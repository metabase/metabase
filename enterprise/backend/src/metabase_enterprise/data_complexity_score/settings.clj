(ns metabase-enterprise.data-complexity-score.settings
  "Settings for the data-complexity-score module."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting data-complexity-scoring-enabled
  (deferred-tru "Run the scheduled Data Complexity Score job (one node per cluster, daily).")
  :encryption :no
  :visibility :admin
  :default    false
  :type       :boolean
  :export?    false
  :doc        false)

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
        "instead of calling the synonym-axis embedder configured below. The default (off) is "
        "the better-calibrated signal — see "
        "https://linear.app/metabase/document/synonym-analysis-21-april-2026-31c8ce76eddb "
        "— but the search-index path does not require ai-service to be reachable, which is "
        "useful for instances where it is not deployed."))
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
   (str "Model name passed to the synonym-axis embedding provider. Defaults to "
        "sentence-transformers/all-MiniLM-L6-v2 — an STS-trained Sentence-Transformers model "
        "calibrated against names-split preprocessing at threshold 0.80. See the synonym "
        "calibration analysis before swapping this."))
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
