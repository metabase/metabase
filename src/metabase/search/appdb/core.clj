(ns metabase.search.appdb.core
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.query :as appdb.query]
   [metabase.search.appdb.scoring :as search.scoring]
   [metabase.search.appdb.specialization.postgres :as specialization.postgres]
   [metabase.search.config :as search.config]
   [metabase.search.db :as search.db]
   [metabase.search.engine :as search.engine]
   [metabase.search.filter :as search.filter]
   [metabase.search.hierarchy :as search.hierarchy]
   [metabase.search.impl :as search.impl]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.util :as search.util]
   [metabase.settings.core :as setting]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [methodical.core :as methodical])
  (:import
   (java.time OffsetDateTime)
   (java.util Queue)))

;; Register the multimethods for each specialization
(comment
  specialization.postgres/keep-me)

(set! *warn-on-reflection* true)

;; Make sure the legacy cookies still work.
(search.hierarchy/derive! :search.engine/fulltext :search.engine/appdb)

(def supported-db?
  "All the databases which we have implemented fulltext search for."
  #{:postgres :h2})

(defmethod search.engine/supported-engine? :search.engine/appdb [_]
  (supported-db? (mdb/db-type)))

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
      ;; internal permission signal (published tables) — never surfaced in API responses
      (dissoc :is_published)
      (update :created_at parse-datetime)
      (update :updated_at parse-datetime)
      (update :last_edited_at parse-datetime)))

(defn- view-count-percentiles*
  [p-value]
  (into {} (for [{:keys [model vcp]} (search.db/view-count-percentile-rows (search.index/active-table) p-value)]
             [(keyword model) vcp])))

(def ^{:private true
       :arglists '([p-value])}
  view-count-percentiles
  (if config/is-prod?
    (memoize/ttl view-count-percentiles*
                 :ttl/threshold (u/hours->ms 1))
    view-count-percentiles*))

(defn- results
  [{:keys [search-engine search-string] :as search-ctx}]
  ;; Check whether there is a query-able index.
  (when-not (search.index/active-table)
    (let [index-state  @@#'search.index/*indexes*
          ;; Sync, in case we're just out of sync with the database.
          found-active (:active (#'search.index/sync-tracking-atoms!))
          ;; If there's really no index, and we're running in prod - gulp, try to initialize now.
          init-now?    (and (not found-active) config/is-prod?)]
      (when init-now?
        (log/warnf "Triggering a late initialization of the %s search index." search-engine)
        (try
          (future
            (search.engine/init! search-engine {:force-reset? false}))
          (catch Exception e
            (log/error (ex-message e)))))
      ;; Even if the index exists now, return an error so that we don't obscure that there was an issue.
      (throw (ex-info "Search Index not found."
                      {:search-engine      search-engine
                       :db-type            (mdb/db-type)
                       :version            (search.spec/index-version-hash)
                       :lang_code          (i18n/site-locale-string)
                       :forced-init?       init-now?
                       :index-state-before index-state
                       :index-state-after  @@#'search.index/*indexes*
                       :index-metadata     (search.db/index-metadata-for-engine :appdb)}))))

  (tracing/with-span :search "search.appdb.query" {:search/query-length (count search-string)}
    (try
      (when (setting/string->boolean (:mb-experimental-search-block-on-queue env/env))
        ;; wait for a bit for the queue to be drained
        (let [pending-updates #(.size ^Queue @#'search.ingestion/queue)]
          (when-not (u/poll {:thunk       pending-updates
                             :done?       zero?
                             :timeout-ms  2000
                             :interval-ms 100})
            (log/warn "Returning search results even though they may be stale. Queue size:" (pending-updates)))))
      (let [weights     (search.config/weights search-ctx)
            percentiles (view-count-percentiles search.config/view-count-scaling-percentile)
            scorer-keys (keys (search.scoring/scorers search-ctx percentiles))]
        (->> (search.db/scored-search-rows (search.index/active-table) search-ctx search-string percentiles)
             (map (partial rehydrate weights scorer-keys))))
      (catch Exception e
        ;; Rule out the error coming from stale index metadata.
        (#'search.index/sync-tracking-atoms!)
        (throw e)))))

(defmethod search.engine/results :search.engine/appdb
  [search-ctx]
  (results search-ctx))

(defmethod search.engine/model-set :search.engine/appdb
  [search-ctx]
  ;; We ignore any current models filter
  (let [unfiltered-context (assoc search-ctx :models search.config/all-models)
        applicable-models  (search.filter/search-context->applicable-models unfiltered-context)
        search-ctx         (assoc search-ctx :models (set applicable-models))]
    (if-let [index-table (search.index/active-table)]
      (into #{} (map :model) (search.db/distinct-model-rows index-table search-ctx))
      #{})))

(defn- row-present?
  [index-table search-ctx search-string model id layer-count]
  (some? (search.db/search-index-probe-row index-table search-ctx search-string model id layer-count)))

(defn- first-excluding-layer
  "Apply the structural + permission `metabase.search.appdb.query/filter-layers` cumulatively to the row-restricted,
  text-free query. Returns the label of the first layer after which the row disappears, or nil if it survives all
  layers."
  [index-table search-ctx model id]
  (->> (appdb.query/filter-layer-labels search-ctx)
       (map-indexed (fn [i label] [(inc i) label]))
       (some (fn [[layer-count label]]
               (when-not (row-present? index-table search-ctx nil model id layer-count)
                 label)))))

(defn- appdb-diagnose
  [search-ctx model id]
  (let [active (search.index/active-table)]
    (if (nil? active)
      {:type :missing-from-index :details {:reason :no-active-index}}
      (let [index-row (search.db/index-row active model (str id))]
        (cond
          (nil? index-row)
          {:type :missing-from-index :details {:active-table active}}

          ;; Perms-first invariant from `search.engine/diagnose`: an access denial is reported ahead of any query
          ;; filter. The post-query permission check runs first since it can deny rows the SQL layers admit
          ;; (archived-write, table query perms, …). For read-checked models, that means a collection/table denial
          ;; may be reported as the generic `:permissions` instead of the more specific SQL-layer label.
          ;; Inside `first-excluding-layer` the SQL permission layers (collection/table) likewise precede the
          ;; structural filter clauses (including `:models`).
          :else
          (if-not (search.impl/check-result-permissions search-ctx (rehydrate {} [] index-row))
            {:type :filtered :details {:excluded-by :permissions}}
            (if-let [layer (first-excluding-layer active search-ctx model id)]
              {:type :filtered :details {:excluded-by layer}}
              (let [search-string (:search-string search-ctx)]
                (if (and (not (str/blank? search-string))
                         (not (row-present? active search-ctx search-string model id nil)))
                  {:type    :not-matching
                   :details {:search-string search-string :search-native-query (boolean (:search-native-query search-ctx))}}
                  {:type :candidate :details {:search-string search-string}})))))))))

(defmethod search.engine/diagnose :search.engine/appdb
  [search-ctx model id]
  (appdb-diagnose search-ctx model id))

(defn- populate-index! [context]
  (search.index/index-docs! context (search.ingestion/searchable-documents)))

(defmethod search.engine/init! :search.engine/appdb
  [_ {:keys [re-populate?] :as opts}]
  (let [index-created (search.index/when-index-created)]
    (if (and index-created (< 3 (t/time-between (t/instant index-created) (t/instant) :days)))
      (do
        (log/info "Forcing early reindex because existing index is old")
        (search.engine/reindex! :search.engine/appdb {}))
      (let [created? (search.index/ensure-ready! opts)]
        (when (or created? re-populate?)
          (log/info "Populating index")
          (populate-index! (if created? :search/reindexing :search/updating)))))))

(defmethod search.engine/sync-from-restored-db! :search.engine/appdb [_]
  (search.index/sync-from-restored-db!))

(defmethod search.engine/reindex! :search.engine/appdb
  [_ {:keys [in-place?]}]
  (try
    (search.index/delete-obsolete-tables!)
    (search.index/ensure-ready!)
    (if in-place?
      (when-let [table (search.index/active-table)]
        ;; keep the current table, just delete its contents
        (search.db/delete-all-rows! table))
      (search.index/maybe-create-pending!))
    (u/prog1 (populate-index! (if in-place? :search/updating :search/reindexing))
      (search.index/activate-table!))
    (catch Throwable e
      (log/errorf "Error during reindexing: %s" (ex-message e))
      (throw e))))

(events/derive! :event/setting-update ::settings-changed-event)

(methodical/defmethod events/publish-event! ::settings-changed-event
  [_topic event]
  (when (and (= :site-locale (-> event :details :key)) (= :postgres (mdb/db-type)))
    (log/info "Reindexing appdb index because the site locale changed.")
    (if search.ingestion/*force-sync*
      (search.engine/reindex! :search.engine/appdb {})
      (future (search.engine/reindex! :search.engine/appdb {})))))
