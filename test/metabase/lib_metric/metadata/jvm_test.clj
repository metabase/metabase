(ns metabase.lib-metric.metadata.jvm-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-metric.metadata.jvm :as metric-jvm]
   [metabase.lib-metric.metadata.provider :as provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.test :as mt]))

(deftest ^:parallel database-returns-nil-test
  (testing "MetricMetadataProvider.database() should return nil"
    (let [mp (metric-jvm/metadata-provider)]
      (is (nil? (lib.metadata.protocols/database mp))))))

(deftest ^:synchronized metadatas-fetches-metrics-test
  (testing "metadatas should fetch metrics from the database"
    #_{:clj-kondo/ignore [:discouraged-var]}
    (mt/with-temp [:model/Card metric {:type         :metric
                                       :name         "Test Metric"
                                       :database_id  (mt/id)
                                       :table_id     (mt/id :orders)
                                       :dataset_query {:database (mt/id)
                                                       :type :query
                                                       :query {:source-table (mt/id :orders)
                                                               :aggregation [[:count]]}}}]
      (let [mp (metric-jvm/metadata-provider)
            metrics (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric :id #{(:id metric)}})]
        (is (= 1 (count metrics)))
        (is (= "Test Metric" (:name (first metrics))))
        (is (= :metadata/metric (:lib/type (first metrics))))))))

(deftest ^:synchronized metadatas-fetches-metrics-by-table-id-test
  (testing "metadatas should fetch metrics by table-id"
    #_{:clj-kondo/ignore [:discouraged-var]}
    (mt/with-temp [:model/Card metric {:type         :metric
                                       :name         "Table Metric"
                                       :database_id  (mt/id)
                                       :table_id     (mt/id :orders)
                                       :dataset_query {:database (mt/id)
                                                       :type :query
                                                       :query {:source-table (mt/id :orders)
                                                               :aggregation [[:count]]}}}]
      (let [mp (metric-jvm/metadata-provider)
            metrics (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric :table-id (mt/id :orders)})]
        (is (some #(= (:id metric) (:id %)) metrics))
        (is (every? #(= (mt/id :orders) (:table-id %)) metrics))))))

(deftest ^:synchronized metadatas-excludes-archived-metrics-test
  (testing "metadatas should exclude archived metrics when not filtering by ID"
    #_{:clj-kondo/ignore [:discouraged-var]}
    (mt/with-temp [:model/Card active-metric   {:type         :metric
                                                :name         "Active Metric"
                                                :archived     false
                                                :database_id  (mt/id)
                                                :table_id     (mt/id :orders)
                                                :dataset_query {:database (mt/id)
                                                                :type :query
                                                                :query {:source-table (mt/id :orders)
                                                                        :aggregation [[:count]]}}}
                   :model/Card archived-metric {:type         :metric
                                                :name         "Archived Metric"
                                                :archived     true
                                                :database_id  (mt/id)
                                                :table_id     (mt/id :orders)
                                                :dataset_query {:database (mt/id)
                                                                :type :query
                                                                :query {:source-table (mt/id :orders)
                                                                        :aggregation [[:count]]}}}]
      (let [mp (metric-jvm/metadata-provider)
            metrics (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric :table-id (mt/id :orders)})]
        (is (some #(= (:id active-metric) (:id %)) metrics))
        (is (not-any? #(= (:id archived-metric) (:id %)) metrics))))))

(deftest ^:synchronized metadatas-includes-archived-when-filtering-by-id-test
  (testing "metadatas should include archived metrics when filtering by ID"
    #_{:clj-kondo/ignore [:discouraged-var]}
    (mt/with-temp [:model/Card archived-metric {:type         :metric
                                                :name         "Archived Metric"
                                                :archived     true
                                                :database_id  (mt/id)
                                                :table_id     (mt/id :orders)
                                                :dataset_query {:database (mt/id)
                                                                :type :query
                                                                :query {:source-table (mt/id :orders)
                                                                        :aggregation [[:count]]}}}]
      (let [mp (metric-jvm/metadata-provider)
            metrics (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric :id #{(:id archived-metric)}})]
        (is (= 1 (count metrics)))
        (is (= (:id archived-metric) (:id (first metrics))))))))

(deftest ^:parallel metadatas-routes-columns-to-database-provider-test
  (testing "metadatas should route column requests to the appropriate database provider"
    (let [mp (metric-jvm/metadata-provider)
          columns (lib.metadata.protocols/metadatas mp {:lib/type :metadata/column :table-id (mt/id :orders)})]
      (is (seq columns))
      (is (every? #(= (mt/id :orders) (:table-id %)) columns)))))

(deftest ^:parallel database-provider-for-table-returns-provider-test
  (testing "database-provider-for-table should return a working database provider"
    (let [mp (metric-jvm/metadata-provider)
          db-provider (provider/database-provider-for-table mp (mt/id :orders))]
      (is (some? db-provider))
      (is (= (mt/id) (:id (lib.metadata.protocols/database db-provider)))))))

(deftest ^:parallel setting-returns-values-test
  (testing "setting should return Metabase setting values"
    (let [mp (metric-jvm/metadata-provider)]
      ;; These settings should exist in any Metabase instance
      (is (some? (lib.metadata.protocols/setting mp :site-name))))))

(deftest ^:parallel has-cache?-returns-true-test
  (testing "has-cache? should return true"
    (let [mp (metric-jvm/metadata-provider)]
      (is (lib.metadata.protocols/has-cache? mp)))))

(deftest ^:synchronized cross-database-table-routing-test
  (testing "metadatas should route table requests to correct database providers"
    (let [mp (metric-jvm/metadata-provider)
          ;; Try to fetch tables from multiple databases (if available)
          tables (lib.metadata.protocols/metadatas mp {:lib/type :metadata/table :id #{(mt/id :orders) (mt/id :products)}})]
      (is (= 2 (count tables)))
      (is (= #{(mt/id :orders) (mt/id :products)} (set (map :id tables)))))))
