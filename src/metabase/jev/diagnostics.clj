(ns metabase.jev.diagnostics
  "Bounded structural summaries for the local Metabot experiment."
  (:require [metabase.util.json :as json]
            [metabase.util.log :as log]))

(def ^:dynamic *capture-requests* false)
(defonce ^:dynamic *requests* (atom []))

(defn json-bytes "UTF-8 size of a serialized JSON value, not a token estimate." [value]
  (alength (.getBytes ^String (json/encode value) java.nio.charset.StandardCharsets/UTF_8)))

(defn request-summary
  "Measure the provider request after translation. Top-level member bytes plus framing
  reconcile exactly to the JSON body. Nested breakdowns are subdivisions, not additive totals."
  [body]
  (let [members (into {} (map (fn [[k v]] [k (- (json-bytes {k v}) 2)])) body)
        names (into {} (for [m (:messages body) b (:content m)
                             :when (and (map? b) (= "tool_use" (:type b)))]
                         [(:id b) (:name b)]))]
    {:body-bytes (json-bytes body)
     :member-bytes members
     :framing-bytes (+ 2 (max 0 (dec (count body))))
     :tool-bytes (mapv #(hash-map :name (:name %) :bytes (json-bytes %)) (:tools body))
     :message-bytes
     (mapv (fn [m]
             {:role (:role m) :bytes (json-bytes m)
              :blocks (when (sequential? (:content m))
                        (mapv (fn [b]
                                {:type (:type b) :bytes (json-bytes b)
                                 :tool (or (:name b) (get names (:tool_use_id b)))})
                              (:content m)))})
           (:messages body))}))

(defn capture-request!
  "Opt-in local audit of request bodies only, before auth headers are attached.
  Keep the latest 12 bodies, at most 1 MiB each. Oversized bodies retain measurements only.
  Never print raw prompts, tool results, or reasoning to the console."
  [provider body]
  (when *capture-requests*
    (try
      (let [summary (request-summary body)
            entry (cond-> {:id (str (random-uuid)) :at (str (java.time.Instant/now))
                           :provider provider :model (:model body) :summary summary}
                    (<= (:body-bytes summary) 1048576) (assoc :request body))]
        (swap! *requests* #(vec (take-last 12 (conj % entry))))
        (log/info "LLM outbound payload"
                  (merge (select-keys entry [:id :provider :model])
                         (select-keys summary [:body-bytes :member-bytes]))))
      (catch Exception e
        (log/warn "Could not measure outbound payload" {:error (ex-message e)})))))

(defn step-summary
  "Summarize a streamed step without logging prompts, arguments, or reasoning text.
  Usage is the provider's cumulative turn usage; character counts are not token estimates."
  [parts]
  (let [reasoning (filter #(= :reasoning (:type %)) parts)
        calls (filter #(= :tool-input (:type %)) parts)]
    {:stream-parts (count parts)
     :reasoning-chunks (count reasoning)
     :reasoning-chars (reduce + 0 (map #(count (:text %)) reasoning))
     :tool-call-count (count calls)
     :tools (mapv #(subs % 0 (min 80 (count %)))
                  (take 12 (distinct (keep :function calls))))
     :tool-errors (count (filter #(and (= :tool-output (:type %)) (:error %)) parts))
     :provider-cumulative-usage (some->> parts
                                         (filter #(= :usage (:type %)))
                                         last :usage
                                         (#(select-keys % [:promptTokens :completionTokens :cachedInputTokens
                                                           :cacheReadTokens :cacheCreationTokens])))}))
