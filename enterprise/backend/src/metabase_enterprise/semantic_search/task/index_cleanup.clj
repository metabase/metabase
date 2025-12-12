(ns metabase-enterprise.semantic-search.task.index-cleanup
  "Task to clean up inactive and stale semantic search indexes."
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(defn- orphan-index-tables
  "Returns a list of semantic search index tables which are not referenced in the metadata table.
  Not expected to occur, but if it does, these tables can be dropped."
  [pgvector {:keys [metadata-table-name]}]
  (let [orphaned-tables-sql
        (-> {:select [:t.table_name]
             :from [[:information_schema.tables :t]]
             :left-join [[(keyword metadata-table-name) :meta]
                         [:= :meta.table_name :t.table_name]]
             :where [:and
                     [:like :t.table_name [:inline "index_table_%"]]
                     [:= :meta.table_name nil]]}
            (sql/format :quoted true))]
    (->> (jdbc/execute! pgvector orphaned-tables-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})
         (map :table_name))))

(defn- parse-repair-table-timestamp
  "Extracts timestamp from repair table name. Returns nil if parsing fails."
  [table-name]
  (try
    (when-let [[_ timestamp-str] (re-find #"^repair_(\d+)_" table-name)]
      (t/instant (parse-long timestamp-str))) ; Convert milliseconds to instant
    (catch Exception _
      nil)))

(defn- orphan-repair-tables
  "Returns a list of repair tables that are older than the retention period.
  Repair tables are named: repair_<millis-since-epoch>_<short-id>

  Repair tables should not become orphaned under normal operation, since they should be deleted immeditaely after use.
  However, in case of a crash or failure, they may be left behind, so we clean them up after a retention period."
  [pgvector]
  (let [retention-cutoff (t/minus (t/instant) (t/hours (semantic.settings/repair-table-retention-hours)))
        repair-tables-sql (-> {:select [:t.table_name]
                               :from [[:information_schema.tables :t]]
                               :where [:like :t.table_name [:inline "repair_%"]]}
                              (sql/format :quoted true))
        all-repair-tables (->> (jdbc/execute! pgvector repair-tables-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                               (map :table_name))
        old-tables (filter (fn [table-name]
                             (when-let [table-timestamp (parse-repair-table-timestamp table-name)]
                               (t/before? table-timestamp retention-cutoff)))
                           all-repair-tables)]
    (when (seq old-tables)
      (log/infof "Found %d orphaned repair tables older than %d hours"
                 (count old-tables)
                 (semantic.settings/repair-table-retention-hours)))
    old-tables))

(defn- cleanup-orphan-repair-tables!
  "Cleans up repair tables that are older than the retention period."
  [pgvector]
  (let [orphan-tables (orphan-repair-tables pgvector)]
    (when (seq orphan-tables)
      (let [tables-to-drop (map keyword orphan-tables)
            drop-table-sql (sql/format
                            (apply sql.helpers/drop-table :if-exists tables-to-drop)
                            :quoted true)]
        (log/infof "Dropping %d orphaned repair tables: %s"
                   (count tables-to-drop)
                   (str/join ", " orphan-tables))
        (jdbc/execute! pgvector drop-table-sql)))))

(defn- stale-index-tables
  "Returns a list of semantic search index tables that are considered stale and can be dropped.
   An index is considered stale if it is not the active index and has not been used or updated
   within the retention period defined in settings."
  [pgvector {:keys [metadata-table-name control-table-name]}]
  (let [retention-cutoff     (t/minus (t/offset-date-time) (t/hours (semantic.settings/stale-index-retention-hours)))
        stale-index-sql (-> {:select [:meta.table_name]
                             :from [[(keyword control-table-name) :control]]
                             :join [[(keyword metadata-table-name) :meta]
                                    [:!= :meta.id :control.active_id]]
                             :where [:and
                                     [:< :meta.index_created_at retention-cutoff]
                                     ;; If indexer_last_seen is set, we can use it as a proxy for when the index was
                                     ;; last used.
                                     [:or
                                      [:= :meta.indexer_last_seen nil]
                                      [:< :meta.indexer_last_seen retention-cutoff]]]}
                            (sql/format :quoted true))]
    (->> (jdbc/execute! pgvector stale-index-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})
         (map :table_name))))

(defn- indexer-ran-recently?
  "Check if the indexer has run within the specified number of hours."
  [metadata-row hours-ago]
  (when-let [last-poll-inst (t/instant (:indexer_last_poll metadata-row))]
    (t/after?
     last-poll-inst
     (t/minus (t/instant) (t/hours hours-ago)))))

(defn- get-active-index-metadata-row
  "Get the metadata row for the currently active index."
  [pgvector {:keys [metadata-table-name control-table-name]}]
  (jdbc/execute-one! pgvector
                     (-> {:select [:m.*]
                          :from [[(keyword control-table-name) :c]]
                          :join [[(keyword metadata-table-name) :m] [:= :m.id :c.active_id]]}
                         (sql/format :quoted true))
                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- cleanup-old-gate-tombstones!
  "Cleans up old tombstone records from the gate table, if the indexer has run recently.
  Ensures that the gate table does not grow indefinitely with old tombstone records
  (where document and document_hash are null)."
  [pgvector index-metadata]
  (try
    (let [retention-hours     (semantic.settings/tombstone-retention-hours)
          active-metadata-row (get-active-index-metadata-row pgvector index-metadata)]
      (if-not (indexer-ran-recently? active-metadata-row retention-hours)
        (log/infof "Skipping tombstone cleanup: indexer has not run within the last %s hours"
                   retention-hours)
        (let [{:keys [gate-table-name]} index-metadata
              retention-cutoff (t/minus (t/offset-date-time)
                                        (t/hours retention-hours))
              tombstone-cleanup-sql (-> {:delete-from [(keyword gate-table-name)]
                                         :where [:and
                                                 [:= :document nil]
                                                 [:= :document_hash nil]
                                                 [:< :gated_at retention-cutoff]]}
                                        (sql/format :quoted true))
              deleted-count (::jdbc/update-count (jdbc/execute-one! pgvector tombstone-cleanup-sql))]
          (when (pos? deleted-count)
            (log/infof "Cleaned up %d old tombstone records from gate table" deleted-count)))))
    (catch Exception e
      (log/error e "Failed to clean up tombstone records from gate table"))))

(defn- cleanup-stale-indexes!
  [pgvector index-metadata]
  (let [stale-table-names    (map keyword (stale-index-tables pgvector index-metadata))
        orphaned-table-names (map keyword (orphan-index-tables pgvector index-metadata))
        tables-to-drop       (concat stale-table-names orphaned-table-names)
        drop-table-sql       (sql/format
                              (apply sql.helpers/drop-table :if-exists tables-to-drop)
                              :quoted true)]
    (when (seq tables-to-drop)
      (log/infof "Found %d semantic search index tables to clean up" (count tables-to-drop))
      (doseq [table-name stale-table-names]
        (log/info "Dropping stale/orphaned semantic search index:" table-name))
      (jdbc/execute! pgvector drop-table-sql))))

(defn- cleanup-stale-indexes-and-gate-tombstones!
  []
  (when (semantic.u/semantic-search-available?)
    (let [pgvector             (semantic.env/get-pgvector-datasource!)
          index-metadata       (semantic.env/get-index-metadata)]
      (cleanup-stale-indexes! pgvector index-metadata)
      (cleanup-old-gate-tombstones! pgvector index-metadata)
      (cleanup-orphan-repair-tables! pgvector))))

(def ^:private cleanup-job-key (jobs/key "metabase.task.semantic-index-cleanup.job"))
(def ^:private cleanup-trigger-key (triggers/key "metabase.task.semantic-index-cleanup.trigger"))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Clean up inactive semantic search index tables"}
  SemanticIndexCleanup [_ctx]
  (cleanup-stale-indexes-and-gate-tombstones!))

(defmethod task/init! ::SemanticIndexCleanup [_]
  (when (semantic.u/semantic-search-available?)
    (let [job (jobs/build
               (jobs/of-type SemanticIndexCleanup)
               (jobs/with-identity cleanup-job-key))
          trigger (triggers/build
                   (triggers/with-identity cleanup-trigger-key)
                   (triggers/start-now)
                   (triggers/with-schedule
                  ;; Run daily at 3 AM
                    (cron/cron-schedule "0 0 3 * * ? *")))]
      (task/schedule-task! job trigger))))

(comment
  (task/job-exists? cleanup-job-key)
  (task/trigger-now! cleanup-job-key))
