(ns metabase-enterprise.metabot-v3.agent.markdown-link-buffer
  "Streaming markdown link buffer for resolving metabase:// links.

   Buffers markdown links during streaming to prevent incomplete markdown rendering
   and resolves metabase:// protocol links to proper Metabase URLs.

   Provides both a pure functional state machine and a transducer for stream processing."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.links :as links]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; State

(def initial-state
  "Initial parser state."
  {:buffer  ""
   :queries {}
   :charts  {}})

(defn with-context
  "Update the queries and charts context in the state."
  [state queries charts]
  (assoc state :queries queries :charts charts))

;;; Link Resolution

(def ^:private link-pattern
  "Regex matching a complete markdown link [text](url)."
  #"\[([^\[\]]*)\]\(([^()]*)\)")

(defn- resolve-link
  "Resolve a single markdown link match. Returns the replacement string."
  [{:keys [queries charts]} [_ link-text url]]
  (if-not (str/starts-with? url "metabase://")
    (str "[" link-text "](" url ")")
    (if-let [resolved (links/resolve-metabase-uri url queries charts)]
      (str "[" link-text "](" resolved ")")
      (do
        (log/warn "Failed to resolve link URL" {:url url})
        link-text))))

(defn- resolve-links
  "Resolve all complete markdown links in text."
  [state text]
  (str/replace text link-pattern (partial resolve-link state)))

;;; Buffering Logic

(defn- find-potential-link-start
  "Find the index of a potential incomplete link start (unmatched '[').
   Returns nil if no potential incomplete link exists."
  [text]
  (let [last-open (str/last-index-of text "[")]
    (when last-open
      ;; Check if there's a complete link starting at or after this position
      (let [suffix (subs text last-open)]
        (when-not (re-find link-pattern suffix)
          ;; No complete link, but could be start of one if we have '[' without matching ']('...')'
          ;; or '[...](' without closing ')'
          (when (or (re-find #"\[[^\]]*$" suffix)           ; unclosed [
                    (re-find #"\[[^\]]*\]\([^)]*$" suffix)) ; unclosed (
            last-open))))))

(defn step
  "Process a chunk of text through the state machine.
   Returns [new-state output-string]."
  [{:keys [buffer] :as state} chunk]
  (let [text        (str buffer chunk)
        ;; First resolve any complete links
        resolved    (resolve-links state text)
        ;; Then check for incomplete link at the end
        split-point (find-potential-link-start resolved)]
    (if split-point
      [(assoc state :buffer (subs resolved split-point))
       (subs resolved 0 split-point)]
      [(assoc state :buffer "")
       resolved])))

(defn flush-state
  "Flush remaining buffered content from state.
   Returns the buffered content string."
  [state]
  (:buffer state ""))

;;; Transducer

(defn- get-structured-output
  "Extract structured output from a tool result, handling key variations."
  [result]
  (or (:structured-output result)
      (:structured_output result)))

(defn resolve-xf
  "Stateful transducer that resolves metabase:// links in text parts.

   This transducer:
   1. Accumulates queries/charts from tool-output parts (via :structured-output)
   2. Buffers markdown links to handle links split across text chunks
   3. Resolves metabase:// URLs to proper Metabase paths
   4. Flushes any remaining buffered content at stream end

   Parameters:
   - initial-queries: Initial map of query-id to query data
   - initial-charts: Initial map of chart-id to chart data"
  [initial-queries initial-charts]
  (fn [rf]
    (let [state   (volatile! (with-context initial-state
                               (or initial-queries {})
                               (or initial-charts {})))
          queries (volatile! (or initial-queries {}))
          charts  (volatile! (or initial-charts {}))]
      (fn
        ([] (rf))
        ([result]
         ;; Flush any remaining buffered content
         (let [flushed (flush-state @state)]
           (if (seq flushed)
             (rf (rf result {:type :text :text flushed}))
             (rf result))))
        ([result part]
         ;; Accumulate state from tool outputs
         (when (= (:type part) :tool-output)
           (when-let [{:keys [query-id query chart-id]} (get-structured-output (:result part))]
             (when (and query-id query)
               (log/debug "Accumulating query in resolve-xf" {:query-id query-id})
               (vswap! queries assoc query-id query))
             (when (and chart-id query-id)
               (log/debug "Accumulating chart in resolve-xf" {:chart-id chart-id})
               (vswap! charts assoc chart-id (get-structured-output (:result part)))))
           ;; Update state with new context
           (vswap! state with-context @queries @charts))

         ;; Process text parts through link buffer
         (if (= (:type part) :text)
           (let [[new-state processed-text] (step @state (:text part))]
             (vreset! state new-state)
             (if (seq processed-text)
               (rf result (assoc part :text processed-text))
               result))
           (rf result part)))))))
