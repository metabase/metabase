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

;;; The following four settings decouple the complexity-score's synonym axis from the search-index
;;; embedding model. When [[ee-complexity-synonym-provider]] is nil (default), the synonym axis reuses
;;; vectors from the active search index. When set, the axis routes through the specified provider +
;;; model via the semantic-search embedding dispatcher. This is scoped narrowly to complexity
;;; scoring — search indexing is unaffected.

(defsetting ee-complexity-synonym-provider
  (deferred-tru
   (str "Provider to use for the complexity-score synonym axis. When unset, the axis reuses "
        "vectors from the active semantic-search index. Valid non-nil values mirror "
        "`ee-embedding-provider` (`openai`, `ollama`, `ai-service`); `ollama` is the proven path "
        "for `all-MiniLM-L6-v2`. Operators using `ollama` must have it reachable at "
        "`localhost:11434` and have pulled the model (`ollama pull <model-name>`)."))
  :encryption :no
  :visibility :internal
  :default    nil
  :type       :string
  :export?    false
  :doc        false)

(defsetting ee-complexity-synonym-model-name
  (deferred-tru
   (str "Model identifier to use for the complexity-score synonym axis. Paired with "
        "`ee-complexity-synonym-provider`. Ignored when the provider setting is unset."))
  :encryption :no
  :visibility :internal
  :default    nil
  :type       :string
  :export?    false
  :doc        false)

(defsetting ee-complexity-synonym-model-dimensions
  (deferred-tru
   (str "Vector dimensions of the synonym-axis model. Required when "
        "`ee-complexity-synonym-provider` is set. E.g. 384 for all-MiniLM-L6-v2."))
  :encryption :no
  :visibility :internal
  :default    nil
  :type       :positive-integer
  :export?    false
  :doc        false)

(defsetting ee-complexity-synonym-threshold
  (deferred-tru
   (str "Optional override for the synonym-similarity threshold. When unset, defaults derive from "
        "the provider: 0.90 (search-index / Arctic) or 0.80 (ollama / all-MiniLM-L6-v2). "
        "See `enterprise/backend/test_resources/data_complexity_score/analysis/` for calibration data."))
  :encryption :no
  :visibility :internal
  :default    nil
  :type       :double
  :export?    false
  :doc        false)
