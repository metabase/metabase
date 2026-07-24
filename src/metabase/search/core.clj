(ns metabase.search.core
  "NOT the API namespace for the search module!! See [[metabase.search]] instead."
  (:require
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.lib-be.core :as lib-be]
   [metabase.search.config :as search.config]
   [metabase.search.debug :as search.debug]
   [metabase.search.engine :as search.engine]
   [metabase.search.impl :as search.impl]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.util :as search.util]
   [metabase.startup.core :as startup]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  search.engine/keep-me
  search.config/keep-me
  search.impl/keep-me)

(p/import-vars
 [search.config
  SearchableModel]
 [search.debug
  diagnose]
 [search.engine
  model-set]
 [search.impl
  search
  ranked-results
  search-results
  ;; We could avoid exposing this by wrapping `query-model-set` and `search` with it.
  search-context]
 [search.ingestion
  bulk-ingest!
  max-searchable-value-length
  searchable-value-trim-sql]
 [search.spec
  spec
  specifications
  define-spec]
 [search.util
  collapse-id
  indexed-entity-id->model-index-id
  indexed-entity-id->model-pk
  tsv-language
  to-tsquery-expr
  weighted-tsvector])

(defmethod analytics.core/known-labels :metabase-search/index-updates
  [_]
  (for [model (keys (search.spec/specifications))]
    {:model model}))

(defmethod analytics.core/known-labels :metabase-search/index-reindexes
  [_]
  (for [model (keys (search.spec/specifications))]
    {:model model}))

(defmethod analytics.core/known-labels :metabase-search/appdb-index-batches-skipped
  [_]
  [{:table-type :active} {:table-type :pending}])

(defmethod analytics.core/known-labels :metabase-search/index-documents-skipped
  [_]
  (for [model (keys (search.spec/specifications))]
    {:model model}))

(defmethod analytics.core/known-labels :metabase-search/engine-default
  [_]
  (analytics.core/known-labels :metabase-search/engine-active))

(defmethod analytics.core/known-labels :metabase-search/engine-active
  [_]
  (for [e (search.engine/known-engines)]
    {:engine (name e)}))

(defmethod analytics.core/initial-value :metabase-search/engine-default
  [_ {:keys [engine]}]
  (if (= engine (name (search.engine/default-engine))) 1 0))

(defmethod analytics.core/initial-value :metabase-search/engine-active
  [_ {:keys [engine]}]
  ;; Can the engine serve queries: in-place always can, indexed engines only while their index is maintained.
  (if (= :ok (search.engine/engine-status (keyword "search.engine" engine)))
    1
    0))

(defn supports-index?
  "Does this instance support a search index, of any sort?"
  []
  (seq (search.engine/active-engines)))

(defn check-for-removed-env-vars!
  "Fail startup when the removed MB_SEMANTIC_SEARCH_ENABLED kill switch is still set, and would have been
  required to disable the engine, naming the exact configuration change that keeps semantic search off.
  Otherwise just log a warning."
  []
  ;; An empty value is "explicitly unset" per the usual env-var semantics, so only a non-blank value trips this.
  (when-not (str/blank? (env/env :mb-semantic-search-enabled))
    (let [engines              (search.engine/supported-engines)
          semantic-default?    (= :search.engine/semantic (first engines))
          semantic-additional? (contains? (set (search.engine/additional-engines)) :search.engine/semantic)
          fallback             (when semantic-default? (second engines))
          ;; Each case is a complete sentence so translators can reorder it freely.
          detail               (cond
                                 (and semantic-default? (not fallback))
                                 (trs "Semantic search is the only supported engine and cannot be disabled; remove MB_SEMANTIC_SEARCH_ENABLED.")

                                 (and fallback semantic-additional?)
                                 (trs "To keep semantic search off, set MB_SEARCH_ENGINE={0} and remove semantic from additional-search-engines, then remove MB_SEMANTIC_SEARCH_ENABLED."
                                      (name fallback))

                                 fallback
                                 (trs "To keep semantic search off, set MB_SEARCH_ENGINE={0}, then remove MB_SEMANTIC_SEARCH_ENABLED."
                                      (name fallback))

                                 semantic-additional?
                                 (trs "To keep semantic search off, remove semantic from additional-search-engines, then remove MB_SEMANTIC_SEARCH_ENABLED."))
          msg                  (str (trs "MB_SEMANTIC_SEARCH_ENABLED is no longer supported.") " "
                                    (or detail (trs "Remove it from your configuration.")))]
      (if detail
        (throw (ex-info msg {:env-var "MB_SEMANTIC_SEARCH_ENABLED"}))
        (log/warn msg)))))

(defmethod startup/def-startup-validation! ::check-for-removed-env-vars [_]
  (check-for-removed-env-vars!))

(defn init-index!
  "Ensure there is an index ready to be populated."
  [& {:as opts}]
  (search.engine/log-resolution!)
  (when-let [engines (seq (search.engine/active-engines))]
    (log/info "Initializing search indexes")
    (tracing/with-span :search "search.init-index" {}
      (lib-be/with-metadata-provider-cache
        ;; If there are multiple indexes, return the peak inserted for each type. In practice, they should all be the same.
        (try
          (let [timer    (u/start-timer)
                report   (reduce (partial merge-with max)
                                 nil
                                 (for [e engines]
                                   (search.engine/init! e opts)))
                duration (u/since-ms timer)]
            (if (seq report)
              (do
                (analytics/inc! :metabase-search/index-reindex-ms duration)
                (analytics/observe! :metabase-search/index-reindex-duration-ms duration)
                (doseq [[model cnt] report]
                  (analytics/inc! :metabase-search/index-reindexes {:model model} cnt))
                (log/infof "Index initialized in %.0fms %s" duration (sort-by (comp - val) report))
                report)
              (log/info "Found existing search index, and using it.")))
          (catch Exception e
            (analytics/inc! :metabase-search/index-error)
            (throw e)))))))

(defn- reindex-logic! [opts]
  (when-let [engines (seq (search.engine/active-engines))]
    (tracing/with-span :search "search.reindex" {}
      (lib-be/with-metadata-provider-cache
        (try
          (log/info "Reindexing searchable entities")
          (let [timer    (u/start-timer)
                report   (reduce (partial merge-with max)
                                 nil
                                 (for [e engines]
                                   (search.engine/reindex! e opts)))
                duration (u/since-ms timer)]
            (analytics/inc! :metabase-search/index-reindex-ms duration)
            (analytics/observe! :metabase-search/index-reindex-duration-ms duration)
            (doseq [[model cnt] report]
              (analytics/inc! :metabase-search/index-reindexes {:model model} cnt))
            (log/infof "Done reindexing in %.0fms %s" duration (sort-by (comp - val) report))
            report)
          (catch Exception e
            (analytics/inc! :metabase-search/index-error)
            (throw e)))))))

(defn reindex!
  "Populate a new index, and make it active. Simultaneously updates the current index.
  Returns a future that will complete when the reindexing is done.
  Respects `search.ingestion/*force-sync*` and waits for the future if it's true.
  Alternately, if `:async?` is false, it will also run synchronously."
  [& {:keys [async?] :or {async? true} :as opts}]
  (let [f (fn []
            (try
              (reindex-logic! opts)
              (catch Exception e
                (log/error e "Reindex failed")
                (analytics/inc! :metabase-search/index-error)
                (throw e))))]
    (if (or search.ingestion/*force-sync* (not async?))
      (doto (promise) (deliver (f)))
      (future (f)))))

(defn reset-tracking!
  "Stop tracking the current indexes. Used when resetting the appdb."
  []
  (when (supports-index?)
    (doseq [e (search.engine/active-engines)]
      (search.engine/reset-tracking! e))))

(defn sync-from-restored-db!
  "Reconcile all search engine state with the current database.
   Use after snapshot restore instead of reindex! to avoid redundant work."
  []
  (when (supports-index?)
    (doseq [e (search.engine/active-engines)]
      (search.engine/sync-from-restored-db! e))))

(defn- enqueue-updates!
  [updates]
  (when-let [updates (->> updates
                          (remove (comp search.util/impossible-condition? second))
                          seq)]
    (search.ingestion/ingest-maybe-async! updates)))

(defn update!
  "Given a new or updated instance, put all the corresponding search entries if needed in the queue."
  [instance & [always?]]
  (when (supports-index?)
    ;; We need to delay execution to handle deletes, which alert us *before* updating the database.
    (enqueue-updates! (search.spec/search-models-to-update instance always?))))

(defn bulk-update!
  "Enqueue re-indexing derived from `instances` unconditionally, e.g. the pre-images of deleted rows.
  Enqueued messages only ask ingestion to re-derive the affected search entries: rows that no longer
  satisfy their spec's query are purged by ingestion's asked-for-but-not-indexed diff."
  [instances]
  (when (supports-index?)
    (enqueue-updates!
     (into #{} (mapcat #(search.spec/search-models-to-update % true)) instances))))

(defn bulk-update-with-changes!
  "Enqueue re-indexing for the pre-image rows of an update statement that applied `changes` to each of them.
  Hooks are filtered on the changed columns; see [[search.spec/search-models-to-update-with-changes]]."
  [instances changes]
  (when (supports-index?)
    (enqueue-updates!
     (into #{} (mapcat #(search.spec/search-models-to-update-with-changes % changes)) instances))))

(defn delete!
  "Given a model and a list of model's ids, remove corresponding search entries."
  [model ids]
  (when (supports-index?)
    (doseq [e            (search.engine/active-engines)
            search-model (->> (vals (search.spec/specifications))
                              (filter (comp #{model} :model))
                              (map :name))]
      (search.engine/delete! e search-model ids))))
