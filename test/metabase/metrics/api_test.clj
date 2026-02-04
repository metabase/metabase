(ns metabase.metrics.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest list-metrics-returns-accessible-metrics-test
  (testing "GET /api/metrics returns metrics the user has access to"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :description   "A test metric"
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 "metrics")]
        (is (= 1 (:total response)))
        (is (= 500 (:limit response)))
        (is (= 0 (:offset response)))
        (is (= 1 (count (:data response))))
        (let [returned-metric (first (:data response))]
          (is (= (:id metric) (:id returned-metric)))
          (is (= "Test Metric" (:name returned-metric)))
          (is (= "A test metric" (:description returned-metric))))))))

(deftest list-metrics-limit-test
  (testing "GET /api/metrics respects limit parameter"
    (mt/with-temp [:model/Card _metric1 {:name          "Metric A"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card _metric2 {:name          "Metric B"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card _metric3 {:name          "Metric C"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 "metrics" :limit 2)]
        (is (= 3 (:total response)))
        (is (= 2 (:limit response)))
        (is (= 2 (count (:data response))))))))

(deftest list-metrics-offset-test
  (testing "GET /api/metrics respects offset parameter"
    (mt/with-temp [:model/Card _metric1 {:name          "Metric A"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card _metric2 {:name          "Metric B"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card _metric3 {:name          "Metric C"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 "metrics" :offset 1 :limit 2)]
        (is (= 3 (:total response)))
        (is (= 1 (:offset response)))
        (is (= 2 (count (:data response))))))))

(deftest list-metrics-excludes-archived-test
  (testing "GET /api/metrics does not return archived metrics"
    (mt/with-temp [:model/Card _metric {:name          "Archived Metric"
                                        :type          :metric
                                        :archived      true
                                        :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (is (= 0 (:total (mt/user-http-request :rasta :get 200 "metrics")))))))

(deftest list-metrics-excludes-non-metrics-test
  (testing "GET /api/metrics does not return non-metric cards"
    (mt/with-temp [:model/Card _card {:name          "Regular Card"
                                      :type          :question
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (is (= 0 (:total (mt/user-http-request :rasta :get 200 "metrics")))))))

(deftest list-metrics-hydrates-collection-test
  (testing "GET /api/metrics hydrates collection information"
    (mt/with-temp [:model/Collection collection {:name "Test Collection"}
                   :model/Card       metric     {:name          "Metric in Collection"
                                                 :type          :metric
                                                 :collection_id (:id collection)
                                                 :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response        (mt/user-http-request :rasta :get 200 "metrics")
            returned-metric (first (:data response))]
        (is (= (:id collection) (:collection_id returned-metric)))
        (is (= (:id collection) (get-in returned-metric [:collection :id])))
        (is (= "Test Collection" (get-in returned-metric [:collection :name])))))))
