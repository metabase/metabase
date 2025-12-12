(ns metabase-enterprise.semantic-search.task.metric-collector-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.task.metric-collector :as semantic.task.collector]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- create-test-tables!
  [pgvector index-metadata model]
  (semantic.index-metadata/create-tables-if-not-exists! pgvector index-metadata)
  (semantic.index-metadata/ensure-control-row-exists! pgvector index-metadata)
  (semantic.pgvector-api/initialize-index! pgvector index-metadata model nil #_{:force-reset? true}))

(defn- drop-test-tables!
  [pgvector index-metadata]
  (let [ai (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
    (semantic.dlq/drop-dlq-table-if-exists! pgvector index-metadata (-> ai :metadata-row :id))
    (semantic.index/drop-index-table! pgvector (:index ai))
    (semantic.index-metadata/drop-tables-if-exists! pgvector index-metadata)))

(defn- mock-documents-into-gate-table!
  [pgvector index-metadata documents]
  (jdbc/execute!
   pgvector
   (sql/format {:insert-into [[:raw (:gate-table-name index-metadata)]]
                :columns [:id :model :model_id :updated_at]
                :values documents})))

(defn- mock-documents-into-dlq-table!
  [pgvector index-metadata docs]
  (let [active-index (semantic.index-metadata/get-active-index-state pgvector index-metadata)
        dlq-table-kw (semantic.dlq/dlq-table-name-kw
                      index-metadata
                      (-> active-index :metadata-row :id))]
    (jdbc/execute!
     pgvector
     (sql/format {:insert-into dlq-table-kw
                  :columns [:gate_id :retry_count :attempt_at :last_attempted_at :error_gated_at]
                  :values docs}))))

(defn- drop-dlq-table-entries!
  [pgvector index-metadata]
  (let [active-index (semantic.index-metadata/get-active-index-state pgvector index-metadata)
        dlq-table-kw (semantic.dlq/dlq-table-name-kw
                      index-metadata
                      (-> active-index :metadata-row :id))]
    (jdbc/execute!
     pgvector
     (sql/format {:delete-from dlq-table-kw}))))

(defn- drop-gate-table-entries!
  [pgvector index-metadata]
  (jdbc/execute!
   pgvector
   (sql/format {:delete-from [[:raw (:gate-table-name index-metadata)]]})))

(deftest metric-collector-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-prometheus-system! [_ system]
      (let [pgvector       (semantic.env/get-pgvector-datasource!)
            index-metadata (semantic.tu/unique-index-metadata)
            model semantic.tu/mock-embedding-model]
        (with-redefs [semantic.env/get-index-metadata (fn [] index-metadata)
                      semantic.env/get-configured-embedding-model (fn [] model)]
          (testing "Missing tables are handled gracefully"
            (let [result (try
                           (@#'semantic.task.collector/collect-metrics!)
                           :success
                           (catch Throwable _
                             :failure))]
              (is (= :success result))))
          (try
            (create-test-tables! pgvector index-metadata model)
            (mock-documents-into-gate-table!
             pgvector index-metadata
             [["a" "b" "c" (t/zoned-date-time)]
              ["d" "e" "f" (t/zoned-date-time)]])
            (mock-documents-into-dlq-table!
             pgvector index-metadata
             [["a" 1 (t/zoned-date-time) (t/zoned-date-time) (t/zoned-date-time)]
              ["b" 2 (t/zoned-date-time) (t/zoned-date-time) (t/zoned-date-time)]
              ["c" 3 (t/zoned-date-time) (t/zoned-date-time) (t/zoned-date-time)]])
            (testing "Metrics after insertion into gate and dlq"
              (@#'semantic.task.collector/collect-metrics!)
              (is (== 2 (mt/metric-value system :metabase-search/semantic-gate-size)))
              (is (== 3 (mt/metric-value system :metabase-search/semantic-dlq-size))))
            (drop-gate-table-entries! pgvector index-metadata)
            (drop-dlq-table-entries! pgvector index-metadata)
            (testing "Metrics after deletion from gate and dlq"
              (@#'semantic.task.collector/collect-metrics!)
              (is (== 0 (mt/metric-value system :metabase-search/semantic-gate-size)))
              (is (== 0 (mt/metric-value system :metabase-search/semantic-dlq-size))))
            (finally
              (drop-test-tables! pgvector index-metadata))))))))
