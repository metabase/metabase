(ns metabase-enterprise.data-complexity-score.settings
  "Settings for the data-complexity-score module."
  (:require
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting data-complexity-scoring-enabled
  (deferred-tru "Run the scheduled Data Complexity Score job (one node per cluster, daily).")
  :encryption :no
  :visibility :admin
  :type       :boolean
  :export?    false
  :doc        false
  :getter     (fn []
                (u/or-with some?
                  (setting/get-value-of-type :boolean :data-complexity-scoring-enabled)
                  ;; Defaults to true on Metabase Cloud staging hosts and false elsewhere.
                  (boolean (and (premium-features/is-hosted?)
                                (config/config-bool :mb-store-use-staging))))))

(defsetting data-complexity-scoring-last-fingerprint
  (deferred-tru "Internal bookkeeping: Fingerprint of last successful run, to prevent needless re-calculations.")
  :encryption :no
  :visibility :internal
  :default    ""
  :type       :string
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-claim
  (deferred-tru "Internal bookkeeping: EDN metadata with TTL for in-progress run, to skip duplicate work.")
  :encryption :no
  :visibility :internal
  :default    ""
  :type       :string
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-use-search-index-embedder
  (deferred-tru
   (str "Source the synonym-axis embeddings from the active semantic-search pgvector index "
        "instead of calling the synonym-axis embedder configured below. This saves us doing "
        "additional calculations, but the results seem less reliable."))
  :encryption :no
  :visibility :admin
  :default    false
  :type       :boolean
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-synonym-embedding-provider
  (deferred-tru "Provider used by the synonym-axis embedder when not falling back to the search index.")
  :encryption :no
  :visibility :admin
  :default    "ai-service"
  :type       :string
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-synonym-embedding-model
  (deferred-tru
   "Model name passed to the synonym-axis embedding provider.")
  :encryption :no
  :visibility :admin
  :default    "sentence-transformers/all-MiniLM-L6-v2"
  :type       :string
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-synonym-embedding-model-dimensions
  (deferred-tru "Vector dimensions advertised for the synonym-axis embedding model.")
  :encryption :no
  :visibility :admin
  :default    384
  :type       :positive-integer
  :export?    false
  :doc        false)
