(ns metabase-enterprise.metabot-v3.agent.markdown-link-buffer
  "Streaming markdown link buffer for resolving metabase:// links.
   Buffers markdown links during streaming to prevent incomplete markdown rendering
   and resolves metabase:// protocol links to proper Metabase URLs.

   This matches the Python AI Service MarkdownLinkBuffer implementation exactly."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.links :as links]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; Link State Machine
;;
;; States for markdown link parsing:
;; - :bypass     - Not in a link, output directly
;; - :link-text  - Inside [text] portion of markdown link
;; - :link-url-start - Expecting '(' after ']'
;; - :link-url   - Inside (url) portion of markdown link
;; - :escape     - Next character is escaped

(defn create-buffer
  "Create a new markdown link buffer.

  Parameters:
  - queries-state: Map of query-id to query data for resolving query links
  - charts-state: Map of chart-id to chart data for resolving chart links

  Returns a buffer atom containing:
  - :state - Current parsing state
  - :prev-state - Previous state (for escape handling)
  - :buffer - Characters buffered during link parsing
  - :link-text - Accumulated link text
  - :link-url - Accumulated link URL
  - :queries-state - Query mappings for link resolution
  - :charts-state - Chart mappings for link resolution"
  [queries-state charts-state]
  (atom {:state :bypass
         :prev-state :bypass
         :buffer ""
         :link-text ""
         :link-url ""
         :queries-state queries-state
         :charts-state charts-state}))

(defn- resolve-url
  "Resolve a URL, converting metabase:// links to proper Metabase URLs.
  Returns the resolved URL or nil if resolution fails."
  [url queries-state charts-state]
  (if (str/starts-with? url "metabase://")
    (links/resolve-metabase-uri url queries-state charts-state)
    url))

(defn- process-char
  "Process a single character through the state machine.
  Returns [new-state output-string] where output-string may be empty."
  [{:keys [state prev-state buffer link-text link-url queries-state charts-state] :as buf} c]
  (cond
    ;; Handle escape state - return to previous state
    (= state :escape)
    (let [new-state prev-state
          updated (case prev-state
                    :link-text {:link-text (str link-text c)}
                    :link-url {:link-url (str link-url c)}
                    {})]
      (if (= prev-state :bypass)
        [(assoc buf :state new-state :buffer "") (str c)]
        [(merge buf {:state new-state :buffer (str buffer c)} updated) ""]))

    ;; Escape character - save state and enter escape mode
    (= c \\)
    [(assoc buf :prev-state state :state :escape :buffer (str buffer c)) ""]

    ;; BYPASS state - looking for start of link
    (= state :bypass)
    (if (= c \[)
      [(assoc buf :state :link-text :link-text "" :buffer "[") ""]
      [(assoc buf :buffer "") (str c)])

    ;; LINK_TEXT state - inside [text] portion
    (= state :link-text)
    (cond
      (= c \])
      [(assoc buf :state :link-url-start :buffer (str buffer c)) ""]

      (= c \[)
      ;; Nested bracket - flush previous and start new
      (let [output buffer]
        [(assoc buf :buffer "[" :link-text "") output])

      :else
      [(assoc buf :link-text (str link-text c) :buffer (str buffer c)) ""])

    ;; LINK_URL_START state - expecting '(' after ']'
    (= state :link-url-start)
    (if (= c \()
      [(assoc buf :state :link-url :link-url "" :buffer (str buffer c)) ""]
      ;; Not a link after all - flush buffer and reset
      (let [output (str buffer c)]
        [(assoc buf :state :bypass :buffer "" :link-text "" :link-url "") output]))

    ;; LINK_URL state - inside (url) portion
    (= state :link-url)
    (if (= c \))
      ;; Complete link found! Resolve the URL
      (let [resolved-url (resolve-url link-url queries-state charts-state)
            output (if resolved-url
                     (str "[" link-text "](" resolved-url ")")
                     ;; If resolution failed, output just the link text
                     link-text)]
        (when-not resolved-url
          (log/warn "Failed to resolve link URL" {:url link-url}))
        [(assoc buf :state :bypass :buffer "" :link-text "" :link-url "") output])
      [(assoc buf :link-url (str link-url c) :buffer (str buffer c)) ""])

    ;; Default - should not reach here
    :else
    [(assoc buf :buffer "") (str c)]))

(defn process
  "Process a chunk of text through the buffer.

  Buffers markdown links and resolves metabase:// URLs.
  Returns the processed output string (may be empty if buffering).

  Parameters:
  - buffer: The buffer atom created by create-buffer
  - chunk: The text chunk to process"
  [buffer chunk]
  (let [output (StringBuilder.)]
    (doseq [c chunk]
      (let [[new-state out] (process-char @buffer c)]
        (reset! buffer new-state)
        (when (seq out)
          (.append output out))))
    (.toString output)))

(defn flush-buffer
  "Flush any remaining buffered content.
  Call this at the end of the stream to get any remaining text.

  Returns the remaining buffered content."
  [buffer]
  (let [{:keys [buffer-str]} @buffer
        output (or (:buffer @buffer) "")]
    (reset! buffer {:state :bypass
                    :prev-state :bypass
                    :buffer ""
                    :link-text ""
                    :link-url ""
                    :queries-state (:queries-state @buffer)
                    :charts-state (:charts-state @buffer)})
    output))

(defn update-state!
  "Update the queries and charts state in the buffer.
  Call this after tool execution to make newly created queries/charts available for link resolution.

  Parameters:
  - buffer: The buffer atom
  - queries-state: Updated map of query-id to query data
  - charts-state: Updated map of chart-id to chart data"
  [buffer queries-state charts-state]
  (swap! buffer assoc
         :queries-state queries-state
         :charts-state charts-state))
