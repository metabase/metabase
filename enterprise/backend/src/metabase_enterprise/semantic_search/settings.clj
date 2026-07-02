(ns metabase-enterprise.semantic-search.settings
  (:require
   [metabase.events.core :as events]
   [metabase.llm.settings :as llm-settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.config :as search.config]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

;; Topic for the just-in-time HNSW build, handled in metabase-enterprise.semantic-search.events. Declared
;; here, not there, so it's valid wherever the setter runs regardless of handler-namespace load order.
(derive :event/semantic-search-hnsw-enabled :metabase/event)

(def ^:private valid-embedding-providers
  "The set of valid embedding provider names."
  #{"ai-service" "openai" "ollama"})

(defsetting ee-embedding-provider
  (deferred-tru "The embedding provider to use (`openai`, `ollama`, or `ai-service`)")
  :encryption :no
  :visibility :settings-manager
  :default "ai-service"
  :type :string
  :export? false
  :doc false
  :setter (fn [new-value]
            (when (and new-value (not (contains? valid-embedding-providers new-value)))
              (throw (ex-info (str "Invalid embedding provider: " (pr-str new-value)
                                   ". Valid providers are: " (pr-str valid-embedding-providers))
                              {:invalid-value new-value
                               :valid-values  valid-embedding-providers})))
            (setting/set-value-of-type! :string :ee-embedding-provider new-value)))

(defsetting ee-embedding-model
  (deferred-tru "Set the embedding model for the selected provider")
  :encryption :no
  :visibility :settings-manager
  :default "Snowflake/snowflake-arctic-embed-l-v2.0"
  :export? false
  :doc false)

(defsetting ee-embedding-query-prefix
  (deferred-tru
   (str "Prefix prepended to search queries (but not indexed documents) before embedding them, as expected by "
        "asymmetric retrieval models such as the snowflake-arctic-embed family (`query: `). It is prepended "
        "verbatim, so include any trailing separator. Leave empty to use the default for the model family."))
  :encryption :no
  :visibility :settings-manager
  :default    nil
  :type       :string
  :export?    false
  :doc        false)

(defsetting ee-embedding-model-dimensions
  (deferred-tru "Set the dimension size for the selected embedding model")
  :encryption :no
  :visibility :settings-manager
  :default 1024
  :type :positive-integer
  :export? false
  :doc false)

(defn openai-api-base-url
  "Get the OpenAI API base url from the existing LLM settings."
  []
  (llm-settings/llm-openai-api-base-url))

(defn openai-api-key
  "Get the OpenAI API key from the existing LLM settings."
  []
  (llm-settings/llm-openai-api-key))

(defsetting ee-embedding-service-base-url
  (deferred-tru "URL of the OpenAI-compatible embedding service (e.g. a LiteLLM proxy).")
  :encryption :no
  :visibility :settings-manager
  :default    nil
  :export?    false
  :doc        false)

(defsetting ee-embedding-service-api-key
  (deferred-tru (str "API key for authenticating with the embedding service. Leave empty for proxying thorugh"
                     " ai-service. In that case premium-embedding-token is used for authentication."))
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :doc        false)

(defsetting semantic-search-enabled
  (deferred-tru "Enable the semantic search engine? Intended as a kill switch for the semantic search feature while dogfooding.")
  :visibility :internal
  :export?    false
  :encryption :no
  :default    true
  :getter     (fn []
                (and (setting/get-value-of-type :boolean :semantic-search-enabled)
                     (premium-features/enable-semantic-search?)))
  :type       :boolean
  :doc        false)

(defsetting openai-max-tokens-per-batch
  (deferred-tru "The maximum number of tokens sent in a single embedding API call.")
  :type :integer
  :default 4000
  :encryption :no
  :export? false
  :visibility :internal
  :doc false)

(defsetting semantic-search-results-limit
  (deferred-tru "Maximum number of results to return from a single semantic search query.")
  :type :integer
  :default 1000
  :encryption :no
  :export? false
  :visibility :internal
  :doc false)

(def ^:private valid-vector-search-strategies
  "Valid semantic-search vector-search strategies, mastered in
  [[metabase.search.config/vector-search-strategies]]."
  (set search.config/vector-search-strategies))

(defsetting semantic-search-vector-strategy
  (deferred-tru
   (str "Default vector-search strategy for semantic search: `hnsw` (approximate, HNSW-index-backed), "
        "`brute-force` (exact, applies non-vector filters first then computes cosine distance over the "
        "survivors), or `hnsw-iterative-relaxed`/`hnsw-iterative-strict` (HNSW-index-backed iterative scans "
        "with inline filters). Defaults to `brute-force`, which needs no index; selecting `hnsw` builds the "
        "HNSW index just-in-time. Individual requests may override this via the `vector_search_strategy` API "
        "parameter."))
  :type       :keyword
  :default    :brute-force
  :encryption :no
  :export?    false
  :visibility :internal
  :doc        false
  :setter     (fn [new-value]
                (let [kw  (some-> new-value keyword)
                      old (setting/get-value-of-type :keyword :semantic-search-vector-strategy)]
                  (when (and kw (not (contains? valid-vector-search-strategies kw)))
                    (throw (ex-info (str "Invalid vector-search strategy: " (pr-str new-value)
                                         ". Valid strategies are: " (pr-str valid-vector-search-strategies))
                                    {:invalid-value new-value
                                     :valid-values  valid-vector-search-strategies})))
                  (setting/set-value-of-type! :keyword :semantic-search-vector-strategy kw)
                  ;; Every HNSW-index-backed strategy needs the index, so build it when transitioning into one
                  ;; from a non-index-backed strategy. Gated on the transition (not every set) so switching
                  ;; between index-backed strategies -- e.g. :hnsw -> :hnsw-iterative-strict -- doesn't rebuild.
                  (let [index-backed? search.config/hnsw-index-backed-strategies]
                    (when (and (index-backed? kw) (not (index-backed? old)))
                      (events/publish-event! :event/semantic-search-hnsw-enabled {}))))))

(defsetting semantic-search-ef-search
  (deferred-tru
   (str "Default pgvector `hnsw.ef_search` (HNSW candidate-list size) for the `hnsw-iterative-*` strategies. "
        "Larger values improve recall at the cost of latency. Individual requests may override this via the "
        "`vector_search_ef_search` API parameter."))
  :type       :positive-integer
  :default    40
  :encryption :no
  :export?    false
  :visibility :internal
  :doc        false)

(defsetting semantic-search-max-scan-tuples
  (deferred-tru
   (str "Default pgvector `hnsw.max_scan_tuples` (soft cap on tuples an iterative scan visits) for the "
        "`hnsw-iterative-*` strategies. Larger values improve recall under selective filters at the cost of "
        "latency. Individual requests may override this via the `vector_search_max_scan_tuples` API parameter."))
  :type       :positive-integer
  :default    20000
  :encryption :no
  :export?    false
  :visibility :internal
  :doc        false)

;; The `vector_search_explain` API parameter only covers requests you author yourself; this setting exists
;; to instrument organic traffic. The frontend issues the real search requests and cannot pass the
;; parameter, so populating the vector-scan Prometheus counters and waterfall logs over production traffic
;; means flipping instrumentation on instance-wide (MB_SEMANTIC_SEARCH_EXPLAIN on hosted, no deploy).
;; EXPLAIN ANALYZE re-runs the inner vector subquery, so the intended lifecycle is on-for-an-investigation,
;; then off.
(defsetting semantic-search-explain
  (deferred-tru
   (str "Run EXPLAIN (ANALYZE) instrumentation of the inner vector subquery for every semantic search? "
        "Expensive (re-executes the inner query); intended for ad-hoc analysis. Individual requests may "
        "override this via the `vector_search_explain` API parameter."))
  :type       :boolean
  :default    false
  :encryption :no
  :export?    false
  :visibility :internal
  :doc        false)

(defsetting semantic-search-min-results-threshold
  (deferred-tru "Minimum number of semantic search results required before falling back to other engines.")
  :type :integer
  :default 100
  :encryption :no
  :export? false
  :visibility :internal
  :doc false)

(defsetting index-update-thread-count
  (deferred-tru "Number of threads to use for batched index updates, including embedding requests")
  :type :integer
  :default 2
  :encryption :no
  :export? false
  :visibility :internal
  :doc "Number of threads to use for batched index updates, including embedding requests")

(defsetting ee-search-gate-write-timeout
  (str "Timeout of gate write statements in seconds. Used to determine lag tolerance of the indexer (see the "
       "[[metabase-enterprise.semantic-search.gate/poll]]) in conjunction "
       "with `ee-search-indexer-lag-tolerance-multiplier`.")
  :type :integer
  :default 5
  :export? false
  :visibility :internal
  :doc false)

(defsetting ee-search-gate-max-batch-size
  "The maximum number of documents that can be sent to `gate-documents!` without causing an error."
  :type :integer
  :default 512
  :export? false
  :visibility :internal
  :doc false)

(defsetting ee-search-indexer-poll-limit
  "Indexer poll limit."
  :type :integer
  :default 1000
  :export? false
  :visibility :internal
  :doc false)

(defsetting ee-search-indexer-exit-early-cold-duration
  "Number of seconds indexer should wait to see new data before yielding back to quartz."
  :type :integer
  :default 30
  :export? false
  :visibility :internal
  :doc false)

(defsetting ee-search-indexer-max-run-duration
  "Number of minutes we expect to run the indexer loop for before yielding to quartz."
  :type :integer
  :default 60
  :export? false
  :visibility :internal
  :doc false)

(defsetting ee-search-indexer-lag-tolerance-multiplier
  (str "Multiplier for computation of [[metabase-enterprise.semantic-search.indexer/lag-tolerance]]. The formula "
       "is `ee-search-gate-write-timeout * ee-search-indexer-lag-tolerance-multiplier`.")
  :type :integer
  :default 2
  :export? false
  :visibility :internal
  :doc false)

(defsetting stale-index-retention-hours
  (deferred-tru "Number of hours to retain stale semantic search indexes before cleanup.")
  :type :integer
  :default 24
  :encryption :no
  :export? false
  :visibility :internal
  :doc false)

(defsetting tombstone-retention-hours
  (deferred-tru "Number of hours to retain tombstone records in the gate table before cleanup.")
  :type :integer
  :default 24
  :encryption :no
  :export? false
  :visibility :internal
  :doc false)

(defsetting repair-table-retention-hours
  (deferred-tru "Number of hours until repair tables are considered stale and eligible for cleanup, if they were not
    cleaned up successfully after use.")
  :type :integer
  :default 2
  :encryption :no
  :export? false
  :visibility :internal
  :doc false)
