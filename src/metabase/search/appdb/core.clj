(ns metabase.search.appdb.core
  (:require
   [clojure.string :as str]
   [environ.core :as env]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.index-state :as index-state]
   [metabase.search.appdb.scoring :as search.scoring]
   [metabase.search.appdb.specialization.postgres :as specialization.postgres]
   [metabase.search.appdb.table :as search.table]
   [metabase.search.appdb.writer :as search.writer]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.filter :as search.filter]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.permissions :as search.permissions]
   [metabase.search.settings :as search.settings]
   [metabase.search.spec :as search.spec]
   [metabase.search.util :as search.util]
   [metabase.settings.core :as setting]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)
   (java.util Queue)))

;; Register the multimethods for each specialization
(comment
  specialization.postgres/keep-me)

(set! *warn-on-reflection* true)

;; Make sure the legacy cookies still work.
(derive :search.engine/fulltext :search.engine/appdb)

(def supported-db?
  "All the databases which we have implemented fulltext search for."
  #{:postgres :h2})

(defmethod search.engine/supported-engine? :search.engine/appdb [_]
  (and (or config/is-dev?
           ;; TODO (Chris 2025-11-07) This backwards dependency is unfortunate, we should find a better solution.
           ;;                         Perhaps just an explicit setting for enabling it.
           ;;                         This also opens us up to swapping out the fallback, e.g. to elastic search.
           ;; if the default engine is semantic we want appdb to be available, as we want to mix results
           (#{"appdb" "semantic"} (some-> (search.settings/search-engine) name)))
       (supported-db? (mdb/db-type))))

(defmethod search.engine/disjunction :search.engine/appdb [_ terms]
  (when (seq terms)
    (if (or (= (mdb/db-type) :h2)
            (= 1 (count terms)))
      terms
      [(str/join " OR " (map #(str "(" % ")") terms))])))

(defn- parse-datetime [s]
  (when s (OffsetDateTime/parse s)))

(defn- rehydrate [weights active-scorers index-row]
  (-> (json/decode+kw (:legacy_input index-row))
      search.util/collapse-id
      (assoc
       ;; this relies on the corresponding scorer, which is not great coupling.
       ;; ideally we would make per-user computed attributes part of the spec itself.
       :bookmark   (pos? (:bookmarked index-row 0))
       :score      (:total_score index-row 1)
       :all-scores (search.scoring/all-scores weights active-scorers index-row))
      (dissoc :is_published)
      (update :created_at parse-datetime)
      (update :updated_at parse-datetime)
      (update :last_edited_at parse-datetime)))

(defn add-table-where-clauses
  "Add a `WHERE` clause to the query to only return tables the current user has access to.
   Also adds any CTEs required for permission filtering."
  [search-ctx qry]
  (let [model-id-col [:cast :search_index.model_id (case (mdb/db-type)
                                                     :mysql :signed
                                                     :integer)]
        {:keys [with clause]} (search.permissions/permitted-tables-clause search-ctx model-id-col)]
    (cond-> qry
      (seq with) (update :with (fnil into []) with)
      true       (sql.helpers/where
                  [:or
                   [:= :search_index.model nil]
                   [:!= :search_index.model [:inline "table"]]
                   [:and
                    [:= :search_index.model [:inline "table"]]
                    clause]]))))

(defn add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection,
  so we can return its `:name`."
  [search-ctx qry]
  (let [collection-id-col :search_index.collection_id
        permitted-clause  (search.permissions/permitted-collections-clause search-ctx collection-id-col)
        personal-clause   (search.filter/personal-collections-where-clause search-ctx collection-id-col)
        ;; Tables have their own dedicated permission filter (add-table-where-clauses) that checks both data
        ;; permissions and published-via-collection access, so we exclude them from collection filtering here.
        excluded-models   (conj (vec (search.filter/models-without-collection)) "table")
        or-null           #(vector :or
                                   [:in :search_index.model excluded-models]
                                   %)]
    (cond-> qry
      true (sql.helpers/left-join [:collection :collection] [:= collection-id-col :collection.id])
      true (sql.helpers/where (or-null permitted-clause))
      personal-clause (sql.helpers/where (or-null personal-clause)))))

(defn- ensure-active-table!
  "Throw an informative error if there is no active search index table.
   As a side effect, attempts a fresh sync and optionally triggers a background init."
  [{:keys [search-engine]}]
  (when-not (search.index/active-table)
    (let [state-before (search.index/state-snapshot)
          found-active (:active (index-state/force-refresh! search.index/*state-store*))
          ;; If there is really no index and we are in prod, trigger a background init to recover.
          init-now?    (and (not found-active) config/is-prod?)]
      (when init-now?
        (log/warnf "Triggering a late initialization of the %s search index." search-engine)
        (try
          (future (search.engine/init! search-engine {:force-reset? false}))
          (catch Exception e
            (log/error e))))
      (throw (ex-info "Search Index not found."
                      {:search-engine      search-engine
                       :db-type            (mdb/db-type)
                       :version            (search.spec/index-version-hash)
                       :lang_code          (i18n/site-locale-string)
                       :forced-init?       init-now?
                       :index-state-before state-before
                       :index-state-after  (search.index/state-snapshot)
                       :index-metadata     (t2/select :model/SearchIndexMetadata :engine :appdb)})))))

(defn- execute-search-query
  "Build and execute the appdb search query, returning rehydrated results."
  [{:keys [search-string] :as search-ctx}]
  (when (setting/string->boolean (:mb-experimental-search-block-on-queue env/env))
    ;; wait for a bit for the queue to be drained
    (let [pending-updates #(.size ^Queue @#'search.ingestion/queue)]
      (when-not (u/poll {:thunk       pending-updates
                         :done?       zero?
                         :timeout-ms  2000
                         :interval-ms 100})
        (log/warn "Returning search results even though they may be stale. Queue size:" (pending-updates)))))
  (let [weights (search.config/weights search-ctx)
        scorers (search.scoring/scorers search-ctx)
        query   (->> (search.index/search-query search-string search-ctx [:legacy_input])
                     (add-collection-join-and-where-clauses search-ctx)
                     (add-table-where-clauses search-ctx)
                     (#(sql.helpers/where % (search.filter/transform-source-type-where-clause
                                             search-ctx
                                             :search_index.model
                                             :search_index.source_type)))
                     (search.scoring/with-scores search-ctx scorers)
                     (search.filter/with-filters search-ctx))]
    (->> (t2/query query)
         (map (partial rehydrate weights (keys scorers))))))

(defn- results
  ;; Between the moment one pod drops a retired table and other pods' TTLs expire (up to 5 min),
  ;; those pods may observe a table-not-found error on their first query. We retry once after a
  ;; forced refresh to recover transparently.
  [{:keys [search-string] :as search-ctx}]
  (ensure-active-table! search-ctx)
  (tracing/with-span :search "search.appdb.query" {:search/query-length (count search-string)}
    (try
      (execute-search-query search-ctx)
      (catch Exception e
        (if (and (search.table/table-not-found-exception? e) (not (::already-retried search-ctx)))
          (do (index-state/force-refresh! search.index/*state-store*)
              (execute-search-query (assoc search-ctx ::already-retried true)))
          (throw e))))))

(defmethod search.engine/results :search.engine/appdb
  [search-ctx]
  (results search-ctx))

(defmethod search.engine/model-set :search.engine/appdb
  [search-ctx]
  ;; We ignore any current models filter
  (let [unfiltered-context (assoc search-ctx :models search.config/all-models)
        applicable-models  (search.filter/search-context->applicable-models unfiltered-context)
        search-ctx         (assoc search-ctx :models applicable-models)]
    (->> (search.index/search-query (:search-string search-ctx) search-ctx [[[:distinct :model] :model]])
         (add-collection-join-and-where-clauses search-ctx)
         (#(sql.helpers/where % (search.filter/transform-source-type-where-clause
                                 search-ctx
                                 :search_index.model
                                 :search_index.source_type)))
         (search.filter/with-filters search-ctx)
         t2/query
         (into #{} (map :model)))))

(defn- populate-index! [mode]
  (search.writer/index-docs! mode (search.ingestion/searchable-documents)))

(def ^:private reindex-lock
  "Cluster-wide lock ensuring at most one appdb index build runs across the whole cluster at a time.
  Kept at its historical keyword name to work during rolling upgrades."
  :metabase.search.task.search-index/search-index-lock)

(defn- do-with-reindex-lock
  "Run `thunk` while holding [[reindex-lock]]. If another node or thread already holds it, log and skip
   (return nil) rather than queue: the in-progress build will produce a fresh index, and the periodic
   reindex covers anything a skipped trigger would have caught. Reentrant, so a locked [[init!]] may call
   [[reindex!]] without deadlocking."
  [thunk]
  (try
    (cluster-lock/with-cluster-lock reindex-lock (thunk))
    (catch clojure.lang.ExceptionInfo e
      ;; do-with-cluster-lock wraps a failed acquisition in an ex-info carrying :lock-names; anything else
      ;; (a real error from the body) propagates.
      (if (contains? (ex-data e) :lock-names)
        (do (log/info "An appdb search index build is already running elsewhere; skipping this trigger.")
            nil)
        (throw e)))))

(defmethod search.engine/init! :search.engine/appdb
  [_ {:keys [re-populate?] :as opts}]
  (do-with-reindex-lock
   (fn []
     (let [index-created (search.index/when-index-created)]
       (if (and index-created (< 3 (t/time-between (t/instant index-created) (t/instant) :days)))
         (do
           (log/info "Forcing early reindex because existing index is old")
           (search.engine/reindex! :search.engine/appdb {}))
         (case (search.index/ensure-ready! opts)
           ;; A replacement table was created as pending while the existing index keeps serving queries:
           ;; populate the pending table, THEN rotate it in, so search is never blanked out mid-rebuild.
           :pending   (do (log/info "Populating replacement index, then activating")
                          (u/prog1 (populate-index! (search.index/background-mode))
                            (search.index/activate-table!)))
           ;; A fresh empty table was activated immediately (nothing was serving): just populate it so
           ;; partial results appear as soon as possible.
           :activated (do (log/info "Populating index")
                          (populate-index! (search.index/background-mode)))
           ;; No reset was needed; optionally re-populate the existing active index in place.
           (when re-populate?
             (log/info "Re-populating index")
             (populate-index! (search.index/incremental-mode)))))))))

(defmethod search.engine/sync-from-restored-db! :search.engine/appdb [_]
  (search.index/sync-from-restored-db!))

(defmethod search.engine/reindex! :search.engine/appdb
  [_ {:keys [in-place?]}]
  (do-with-reindex-lock
   (fn []
     (try
       (let [mode (if in-place? (search.index/in-place-mode) (search.index/background-mode))]
         (search.index/ensure-ready!)
         (search.index/prepare! mode)
         (u/prog1 (populate-index! mode)
           (search.index/finish! mode)))
       (catch Throwable e
         (log/error e "Error during reindexing")
         (throw e))))))

(derive :event/setting-update ::settings-changed-event)

(methodical/defmethod events/publish-event! ::settings-changed-event
  [_topic event]
  (when (and (= :site-locale (-> event :details :key)) (= :postgres (mdb/db-type)))
    (log/info "Reindexing appdb index because the site locale changed.")
    (if search.ingestion/*force-sync*
      (search.engine/reindex! :search.engine/appdb {})
      (future (search.engine/reindex! :search.engine/appdb {})))))
