(ns metabase-enterprise.semantic-search.settings
  (:require
   [metabase-enterprise.llm.settings :as llm-settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ee-embedding-provider
  (deferred-tru "The embedding provider to use (:openai, :ollama, or :ai-service)")
  :encryption :no
  :visibility :settings-manager
  :default "ai-service"
  :type :string
  :export? false
  :doc "This feature is experimental.")

(defsetting ee-embedding-model
  (deferred-tru "Set the embedding model for the selected provider")
  :encryption :no
  :visibility :settings-manager
  :default "Snowflake/snowflake-arctic-embed-l-v2.0"
  :export? false
  :doc "This feature is experimental.")

(defsetting ee-embedding-model-dimensions
  (deferred-tru "Set the dimension size for the selected embedding model")
  :encryption :no
  :visibility :settings-manager
  :default 1024
  :type :positive-integer
  :export? false
  :doc "This feature is experimental.")

(defn openai-api-base-url
  "Get the OpenAI API base url from the existing LLM settings."
  []
  (llm-settings/ee-openai-api-base-url))

(defn openai-api-key
  "Get the OpenAI API key from the existing LLM settings."
  []
  (llm-settings/ee-openai-api-key))

(defsetting semantic-search-enabled
  (deferred-tru "Enable the semantic search engine? Intended as a kill switch for the semantic search feature while dogfooding.")
  :visibility :internal
  :export?    false
  :encryption :no
  :default    true
  :getter     (fn []
                (and (setting/get-value-of-type :boolean :semantic-search-enabled)
                     (premium-features/enable-semantic-search?)))
  :type       :boolean)

(defsetting openai-max-tokens-per-batch
  (deferred-tru "The maximum number of tokens sent in a single embedding API call.")
  :type :integer
  :default 4000
  :encryption :no
  :export? false
  :visibility :internal
  :doc "The maximum number of tokens sent in a single embedding API call.")

(defsetting semantic-search-results-limit
  (deferred-tru "Maximum number of results to return from a single semantic search query.")
  :type :integer
  :default 1000
  :encryption :no
  :export? false
  :visibility :internal
  :doc "Maximum number of results to return from a single semantic search query.")

(defsetting semantic-search-min-results-threshold
  (deferred-tru "Minimum number of semantic search results required before falling back to other engines.")
  :type :integer
  :default 100
  :encryption :no
  :export? false
  :visibility :internal
  :doc "Minimum number of semantic search results required before falling back to other engines.")

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
  :visibility :internal)

(defsetting ee-search-gate-max-batch-size
  "The maximum number of documents that can be sent to `gate-documents!` without causing an error."
  :type :integer
  :default 512
  :export? false
  :visibility :internal)

(defsetting ee-search-indexer-poll-limit
  "Indexer poll limit."
  :type :integer
  :default 1000
  :export? false
  :visibility :internal)

(defsetting ee-search-indexer-exit-early-cold-duration
  "Number of seconds indexer should wait to see new data before yielding back to quartz."
  :type :integer
  :default 30
  :export? false
  :visibility :internal)

(defsetting ee-search-indexer-max-run-duration
  "Number of minutes we expect to run the indexer loop for before yielding to quartz."
  :type :integer
  :default 60
  :export? false
  :visibility :internal)

(defsetting ee-search-indexer-lag-tolerance-multiplier
  (str "Multiplier for computation of [[metabase-enterprise.semantic-search.indexer/lag-tolerance]]. The formula "
       "is `ee-search-gate-write-timeout * ee-search-indexer-lag-tolerance-multiplier`.")
  :type :integer
  :default 2
  :export? false
  :visibility :internal)

(defsetting stale-index-retention-hours
  (deferred-tru "Number of hours to retain stale semantic search indexes before cleanup.")
  :type :integer
  :default 24
  :encryption :no
  :export? false
  :visibility :internal
  :doc "Number of hours to retain stale semantic search indexes before cleanup.")
