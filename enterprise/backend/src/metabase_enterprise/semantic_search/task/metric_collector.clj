(ns metabase-enterprise.semantic-search.task.metric-collector
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase.analytics.core :as analytics]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private collector-job-key (jobs/key "metabase.task.semantic-metric-collector.job"))
(def ^:private collector-trigger-key (triggers/key "metabase.task.semantic-metric-collector.trigger"))

(defn- table-exists?
  [pgvector table-name-str]
  (boolean
   (jdbc/execute-one!
    pgvector
    (sql/format {:select [[[:raw 1] :exists]]
                 :from [:information_schema.tables]
                 :where [[:= :information_schema.tables.table_name [:inline table-name-str]]]
                 :limit 1}))))

(defn- row-count
  [pgvector table-name-str]
  (:size
   (jdbc/execute-one!
    pgvector
    (sql/format {:select [[[:count :*] :size]]
                 :from [[[:raw table-name-str]]]}))))

(defn- collect-gate-size!
  [pgvector]
  (let [{:keys [gate-table-name]} (semantic.env/get-index-metadata)]
    (assert (string? gate-table-name))
    (log/debugf "Checking size of gate table %s" gate-table-name)
    (if (table-exists? pgvector gate-table-name)
      (let [table-size (row-count pgvector gate-table-name)]
        (log/debugf "Setting `semantic-gate-size` metric to %d" table-size)
        (analytics/set! :metabase-search/semantic-gate-size table-size)
        nil)
      (log/debug "Gate table does not exist."))))

(defn- active-index-id
  [pgvector index-metadata]
  (try (:id (jdbc/execute-one!
             pgvector
             (sql/format {:select [[:active_id :id]]
                          :from [[[:raw (:control-table-name index-metadata)]]]})
             {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
       (catch Throwable _
         (log/debug "Control table does not exist")
         nil)))

(defn- collect-dlq-size!
  [pgvector index-metadata]
  (if-some [active-index-id (active-index-id pgvector index-metadata)]
    (let [dlq-table-name (name (semantic.dlq/dlq-table-name-kw index-metadata active-index-id))]
      (log/debugf "Checking size of DLQ table %s" dlq-table-name)
      (when (table-exists? pgvector dlq-table-name)
        (let [table-size (row-count pgvector dlq-table-name)]
          (log/debugf "Setting `semantic-dlq-size` metric to %d" table-size)
          (analytics/set! :metabase-search/semantic-dlq-size table-size)
          nil)))
    (log/debug "DLQ table does not exist.")))

(defn- collect-metrics! []
  (let [pgvector (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.env/get-index-metadata)]
    (collect-gate-size! pgvector)
    (collect-dlq-size! pgvector index-metadata)))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Collect expensive semantic search metrics"}
  SemanticMetricCollector [_ctx]
  (collect-metrics!))

(def ^:private job-interval-ms (* 10 60 1000))

(defmethod task/init! ::SemanticMetricCollector
  [_]
  (when (premium-features/has-feature? :semantic-search)
    (let [job (jobs/build
               (jobs/of-type SemanticMetricCollector)
               (jobs/with-identity collector-job-key))
          trigger (triggers/build
                   (triggers/with-identity collector-trigger-key)
                   (triggers/start-at (Date/from (.plusMillis (Instant/now) job-interval-ms)))
                   (triggers/with-schedule
                    (simple/schedule
                     (simple/with-interval-in-milliseconds job-interval-ms)
                     (simple/repeat-forever)))
                   (triggers/start-now))]
      (task/schedule-task! job trigger))))

(comment
  (task/trigger-now! collector-job-key))