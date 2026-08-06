(ns metabase.metabot.self.telemetry
  "Privacy-safe, provider-neutral observability for individual agent iterations."
  (:require
   [metabase.metabot.provider-util :as provider-util]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private ^:const estimated-chars-per-token
  "Deliberately simple, provider-neutral context-size estimate. Provider tokenizers
  differ, so these values are directional and always named as estimates."
  4)

(def ^:private size-estimate-keys
  [:system-prompt-chars
   :system-prompt-estimated-tokens
   :tool-schemas-chars
   :tool-schemas-estimated-tokens
   :conversation-history-chars
   :conversation-history-estimated-tokens
   :tool-result-content-chars
   :tool-result-content-estimated-tokens
   :total-context-chars
   :total-context-estimated-tokens])

(defn- encoded-char-count
  "Estimate the serialized character count of `x`. The fallback handles Malli
  schemas containing values JSON cannot encode. Neither representation is logged."
  [x]
  (try
    (count (json/encode x))
    (catch Exception _
      (count (pr-str x)))))

(defn- content-char-count [x]
  (if (string? x)
    (count x)
    (encoded-char-count x)))

(defn- tool-result-content
  "Return only provider-bound tool-result content, excluding its wrapper."
  [part]
  (or (get-in part [:result :output])
      (when-let [message (get-in part [:error :message])]
        (str "Error: " message))
      (:result part)))

(defn- estimated-tokens [chars]
  (quot (+ chars (dec estimated-chars-per-token)) estimated-chars-per-token))

(defn request-size-estimates
  "Return numeric-only approximate sizes for the canonical context passed to the
  provider adapter. These do not claim exact provider wire serialization.

  Tool-result content is removed from conversation history and measured
  separately, so the components do not double count it. Tool functions and
  decoders are excluded because adapters send only name, description, and schema."
  [system-msg parts tools]
  (let [tool-result?       #(= :tool-output (:type %))
        history-parts      (remove tool-result? parts)
        tool-result-parts  (filter tool-result? parts)
        provider-tool-data (mapv #(select-keys % [:tool-name :doc :schema]) tools)
        chars-by-component {:system-prompt-chars       (if (string? system-msg) (count system-msg) 0)
                            :tool-schemas-chars         (if (seq provider-tool-data)
                                                          (encoded-char-count provider-tool-data)
                                                          0)
                            :conversation-history-chars (if (seq history-parts)
                                                          (encoded-char-count (vec history-parts))
                                                          0)
                            :tool-result-content-chars  (transduce
                                                         (map (comp content-char-count tool-result-content))
                                                         +
                                                         0
                                                         tool-result-parts)}
        total-chars        (reduce + (vals chars-by-component))]
    (reduce-kv (fn [result k chars]
                 (let [component (subs (name k) 0 (- (count (name k)) (count "-chars")))]
                   (assoc result
                          k chars
                          (keyword (str component "-estimated-tokens"))
                          (estimated-tokens chars))))
               {:total-context-chars            total-chars
                :total-context-estimated-tokens (estimated-tokens total-chars)}
               chars-by-component)))

(defn- iteration-data
  [{:keys [iteration model provider provider-model request-size-estimates]} usage duration-ms]
  (let [safe-size-estimates (into {}
                                  (filter (comp nat-int? val))
                                  (select-keys request-size-estimates size-estimate-keys))]
    (cond-> (merge {:iteration     iteration
                    :provider      provider
                    :model         provider-model
                    :model-id      (provider-util/strip-metabase-prefix model)
                    :input-tokens  (:promptTokens usage 0)
                    :output-tokens (:completionTokens usage 0)
                    :duration-ms   duration-ms}
                   safe-size-estimates)
      (contains? usage :cacheCreationTokens)
      (assoc :cache-creation-tokens (:cacheCreationTokens usage))

      (contains? usage :cacheReadTokens)
      (assoc :cache-read-tokens (:cacheReadTokens usage))

      (contains? usage :reasoningTokens)
      (assoc :reasoning-tokens (:reasoningTokens usage))

      (contains? usage :compactionSavingsTokens)
      (assoc :compaction-savings-tokens (:compactionSavingsTokens usage)))))

(defn report-iteration!
  "Log one privacy-safe record for an agent iteration.

  The payload is restricted to provider/model identifiers and numeric counts. It
  never contains request, session, user, prompt, argument, or output values."
  [tracking-opts usage duration-ms]
  (when (some? (:iteration tracking-opts))
    (log/info "Metabot agent iteration usage"
              (iteration-data tracking-opts usage duration-ms))))
