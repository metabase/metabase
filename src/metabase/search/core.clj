(ns metabase.search.core
  "NOT the API namespace for the search module!! See [[metabase.search]] instead."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.impl :as search.impl]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.util :as search.util]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  search.engine/keep-me
  search.config/keep-me
  search.impl/keep-me)

(p/import-vars
 [search.config
  SearchableModel]

 [search.engine
  model-set]

 [search.impl
  queue-delete!
  queue-init!
  queue-reindex!
  search
  supports-index?
  ;; We could avoid exposing this by wrapping `query-model-set` and `search` with it.
  search-context]

 [search.ingestion
  bulk-ingest!
  max-searchable-value-length
  searchable-value-trim-sql]

 [search.spec
  spec
  define-spec]

 [search.util
  collapse-id
  indexed-entity-id->model-index-id
  indexed-entity-id->model-pk
  tsv-language
  to-tsquery-expr
  weighted-tsvector])

(defmethod analytics/known-labels :metabase-search/index-updates
  [_]
  (for [model (keys (search.spec/specifications))]
    {:model model}))

(defmethod analytics/known-labels :metabase-search/index-reindexes
  [_]
  (for [model (keys (search.spec/specifications))]
    {:model model}))

(defmethod analytics/known-labels :metabase-search/engine-default
  [_]
  (analytics/known-labels :metabase-search/engine-active))

(defmethod analytics/known-labels :metabase-search/engine-active
  [_]
  (for [e (search.engine/known-engines)]
    {:engine (name e)}))

(defmethod analytics/initial-value :metabase-search/engine-default
  [_ {:keys [engine]}]
  (if (= engine (name (search.engine/default-engine))) 1 0))

(defmethod analytics/initial-value :metabase-search/engine-active
  [_ {:keys [engine]}]
  (if (search.engine/supported-engine? (keyword "search.engine" engine)) 1 0))

(defn reset-tracking!
  "Stop tracking the current indexes. Used when resetting the appdb."
  []
  (when (supports-index?)
    (doseq [e (search.engine/active-engines)]
      (search.engine/reset-tracking! e))))

(defn queue-update!
  "Given a new or updated instance, put all the corresponding search entries if needed in the queue."
  [instance & [always?]]
  (when (supports-index?)
    (when-let [updates (->> (search.spec/search-models-to-update instance always?)
                            (remove (comp search.util/impossible-condition? second))
                            seq)]
      ;; We need to delay execution to handle deletes, which alert us *before* updating the database.
      (search.ingestion/queue-updates updates))))
