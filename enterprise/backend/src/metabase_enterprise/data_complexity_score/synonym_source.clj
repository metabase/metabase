(ns metabase-enterprise.data-complexity-score.synonym-source
  "Bridge from settings → synonym-axis embedder + the metadata to publish about it.

  The complexity scoring code is intentionally settings-free (analysis modules take flags as opts).
  This namespace is the only place that translates the synonym-related settings into the opts
  callers splice into `complexity/complexity-scores`, and into the fingerprint fragment that lets
  the cron skip re-scoring when nothing meaningful changed."
  (:require
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase-enterprise.data-complexity-score.settings :as settings]
   [metabase-enterprise.semantic-search.core :as semantic-search]))

(defn- configured-model-descriptor
  "`{:provider :model-name :model-dimensions}` from the synonym-axis settings."
  []
  {:provider         (settings/data-complexity-scoring-synonym-embedding-provider)
   :model-name       (settings/data-complexity-scoring-synonym-embedding-model)
   :model-dimensions (settings/data-complexity-scoring-synonym-embedding-model-dimensions)})

(defn complexity-scores-opts
  "Map ready to splice into `complexity/complexity-scores`. When the search-index toggle is on,
  routes the synonym axis through the active pgvector index and advertises whatever model that
  index reports (nil when unreachable). Otherwise builds a fresh provider-embedder for the
  configured descriptor and advertises the descriptor + the names-split text variant."
  []
  (if (settings/data-complexity-scoring-use-search-index-embedder)
    {:embedder             semantic-search/search-index-embedder
     :embedding-model-meta (semantic-search/active-embedding-model)}
    (let [descriptor (configured-model-descriptor)]
      {:embedder             (embedders/provider-embedder descriptor)
       :embedding-model-meta descriptor
       :text-variant         embedders/default-text-variant})))

(defn fingerprint-fragment
  "Synonym-axis fragment of the scoring fingerprint. Toggling the source setting or swapping the
  configured model forces a re-score; the search-index path also folds in the live active model
  so a pgvector re-index that swaps the model invalidates prior scores."
  []
  (if (settings/data-complexity-scoring-use-search-index-embedder)
    {:synonym-source  :search-index
     :embedding-model (or (semantic-search/active-embedding-model) :unavailable)}
    {:synonym-source  :default-provider
     :embedding-model (configured-model-descriptor)
     :text-variant    embedders/default-text-variant}))
