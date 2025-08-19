(ns metabase-enterprise.semantic-search.task.index-cleanup
  "Task to clean up inactive and stale semantic search indexes."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

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
  (let [pgvector          (semantic.env/get-pgvector-datasource!)
        index-metadata    (semantic.env/get-index-metadata)
        stale-table-names (stale-index-tables pgvector index-metadata)]
    (doseq [table-name stale-table-names]
      (log/info "Cleaning up stale semantic search index:" table-name)
      (jdbc/execute! pgvector
                     [(str "DROP TABLE IF EXISTS " (name table-name) " CASCADE")]
                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(def ^:private cleanup-job-key (jobs/key "metabase.task.semantic-index-cleanup.job"))
(def ^:private cleanup-trigger-key (triggers/key "metabase.task.semantic-index-cleanup.trigger"))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Clean up inactive semantic search index tables"}
  SemanticIndexCleanup [_ctx]
  (cluster-lock/with-cluster-lock ::semantic-index-cleanup-lock
    (cleanup-stale-indexes!)))

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
