(ns metabase-enterprise.semantic-search.task.index-cleanup
  "Task to clean up inactive and stale semantic search indexes."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(defn- orphan-index-tables
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

(defn- stale-index-tables
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

(defn- cleanup-stale-indexes!
  []
  (let [pgvector             (semantic.env/get-pgvector-datasource!)
        index-metadata       (semantic.env/get-index-metadata)
        stale-table-names    (map keyword (stale-index-tables pgvector index-metadata))
        orphaned-table-names (map keyword (orphan-index-tables pgvector index-metadata))
        tables-to-drop       (concat stale-table-names orphaned-table-names)
        drop-table-sql       (sql/format
                              (apply sql.helpers/drop-table :if-exists tables-to-drop))]
    (when (seq tables-to-drop)
      (log/infof "Found %d semantic search index tables to clean up" (count tables-to-drop))
      (doseq [table-name stale-table-names]
        (log/info "Dropping stale/orphaned semantic search index:" table-name))
      (jdbc/execute! pgvector drop-table-sql))))

(def ^:private cleanup-job-key (jobs/key "metabase.task.semantic-index-cleanup.job"))
(def ^:private cleanup-trigger-key (triggers/key "metabase.task.semantic-index-cleanup.trigger"))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Clean up inactive semantic search index tables"}
  SemanticIndexCleanup [_ctx]
  (cleanup-stale-indexes!))

(defmethod task/init! ::SemanticIndexCleanup [_]
  (let [job (jobs/build
             (jobs/of-type SemanticIndexCleanup)
             (jobs/with-identity cleanup-job-key))
        trigger (triggers/build
                 (triggers/with-identity cleanup-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; Run daily at 3 AM
                  (cron/cron-schedule "0 0 3 * * ? *")))]
    (task/schedule-task! job trigger)))

(comment
  (task/job-exists? cleanup-job-key)
  (task/trigger-now! cleanup-job-key))
