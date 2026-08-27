(ns metabase-enterprise.data-complexity-score.settings
  "Settings for the data-complexity-score module."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ^:deprecated data-complexity-scoring-enabled
  (deferred-tru
   (str "Deprecated: the :data-complexity-score premium feature token is the authoritative gate "
        "for the scheduled scoring job. Retained as a read-only fallback so existing overrides "
        "keep working — values from the MB_DATA_COMPLEXITY_SCORING_ENABLED env var or previously "
        "persisted DB rows are still honored, but the setting can no longer be changed at runtime."))
  :encryption :no
  :visibility :internal
  :setter     :none
  :deprecated "0.61.0"
  :type       :boolean
  :export?    false
  :doc        false)

(defn scoring-active?
  "Whether the scheduled Data Complexity Score runner is permitted to execute on this instance.
  The `:data-complexity-score` premium feature token is authoritative; the deprecated
  [[data-complexity-scoring-enabled]] setting is honored as a backward-compatible fallback so
  existing self-hosted overrides keep working until the setting is removed."
  []
  (boolean (or (premium-features/enable-data-complexity-score?)
               ;; Intentional call to the deprecated env-var-only fallback (see docstring above).
               #_{:clj-kondo/ignore [:deprecated-var]}
               (data-complexity-scoring-enabled))))

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
