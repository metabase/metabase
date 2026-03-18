(ns metabase.lib-metric.metadata.jvm-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-metric.metadata.jvm :as metric-jvm]
   [metabase.lib-metric.metadata.provider :as provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.test :as mt]))

(deftest ^:synchronized metric-fetch-test
  (testing "metric should fetch a metric from the database"
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
            result (provider/metric mp (:id metric))]
        (is (some? result))
        (is (= "Test Metric" (:name result)))
        (is (= :metadata/metric (:lib/type result)))))))

(deftest ^:synchronized metric-fetch-by-table-id-test
  (testing "dimensions-for-metric returns dimensions for metric fetched by table"
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
            result (provider/metric mp (:id metric))]
        (is (some? result))
        (is (= (mt/id :orders) (:table-id result)))))))

(deftest ^:synchronized metric-excludes-archived-test
  (testing "metric fetched by ID still returns archived metrics (explicit ID lookup)"
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
            result (provider/metric mp (:id archived-metric))]
        (is (some? result))
        (is (= (:id archived-metric) (:id result)))))))

(deftest ^:parallel columns-for-table-test
  (testing "columns-for-table should return columns for a table"
    (let [mp (metric-jvm/metadata-provider)
          columns (provider/columns-for-table mp (mt/id :orders))]
      (is (seq columns))
      (is (every? #(= (mt/id :orders) (:table-id %)) columns)))))

(deftest ^:parallel database-provider-for-table-returns-provider-test
  (testing "database-provider-for-table should return a working database provider"
    (let [mp (metric-jvm/metadata-provider)
          db-provider (provider/database-provider-for-table mp (mt/id :orders))]
      (is (some? db-provider))
      (is (= (mt/id) (:id (lib.metadata.protocols/database db-provider)))))))

(deftest ^:parallel setting-returns-values-test
  (testing "metric-setting should return Metabase setting values"
    (let [mp (metric-jvm/metadata-provider)]
      (is (some? (provider/metric-setting mp :site-name))))))

(deftest ^:synchronized dimension-fetch-by-uuid-test
  (testing "dimension fetches a single dimension by UUID from metric dimensions"
    #_{:clj-kondo/ignore [:discouraged-var]}
    (let [dim-uuid "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]
      (mt/with-temp [:model/Card metric {:type              :metric
                                         :name              "Dim Metric"
                                         :archived          false
                                         :database_id       (mt/id)
                                         :table_id          (mt/id :orders)
                                         :dataset_query     {:database (mt/id)
                                                             :type     :query
                                                             :query    {:source-table (mt/id :orders)
                                                                        :aggregation  [[:count]]}}
                                         :dimensions        [{:id           dim-uuid
                                                              :display-name "Order Date"
                                                              :target       [:field {} (mt/id :orders :created_at)]}]
                                         :dimension_mappings []}]
        (let [mp  (metric-jvm/metadata-provider)
              dim (provider/dimension mp dim-uuid)]
          (is (some? dim))
          (is (= dim-uuid (:id dim)))
          (is (= "Order Date" (:display-name dim)))
          (is (= :metric (:source-type dim)))
          (is (= (:id metric) (:source-id dim))))))))

(deftest ^:parallel metric-table-test
  (testing "metric-table returns table metadata"
    (let [mp (metric-jvm/metadata-provider)
          table (provider/metric-table mp (mt/id :orders))]
      (is (some? table))
      (is (= (mt/id :orders) (:id table))))))
