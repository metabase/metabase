(ns metabase.metrics.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /api/metric/                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest list-metric-returns-accessible-metric-test
  (testing "GET /api/metric returns metric the user has access to"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :description   "A test metric"
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 "metric")]
        (is (= 1 (:total response)))
        (is (= 500 (:limit response)))
        (is (= 0 (:offset response)))
        (is (= 1 (count (:data response))))
        (let [returned-metric (first (:data response))]
          (is (= (:id metric) (:id returned-metric)))
          (is (= "Test Metric" (:name returned-metric)))
          (is (= "A test metric" (:description returned-metric))))))))

(deftest list-metric-limit-test
  (testing "GET /api/metric respects limit parameter"
    (mt/with-temp [:model/Card _metric1 {:name          "Metric A"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card _metric2 {:name          "Metric B"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card _metric3 {:name          "Metric C"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 "metric" :limit 2)]
        (is (= 3 (:total response)))
        (is (= 2 (:limit response)))
        (is (= 2 (count (:data response))))))))

(deftest list-metric-offset-test
  (testing "GET /api/metric respects offset parameter"
    (mt/with-temp [:model/Card _metric1 {:name          "Metric A"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card _metric2 {:name          "Metric B"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card _metric3 {:name          "Metric C"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 "metric" :offset 1 :limit 2)]
        (is (= 3 (:total response)))
        (is (= 1 (:offset response)))
        (is (= 2 (count (:data response))))))))

(deftest list-metric-excludes-archived-test
  (testing "GET /api/metric does not return archived metric"
    (mt/with-temp [:model/Card _metric {:name          "Archived Metric"
                                        :type          :metric
                                        :archived      true
                                        :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (is (= 0 (:total (mt/user-http-request :rasta :get 200 "metric")))))))

(deftest list-metric-excludes-non-metric-test
  (testing "GET /api/metric does not return non-metric cards"
    (mt/with-temp [:model/Card _card {:name          "Regular Card"
                                      :type          :question
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (is (= 0 (:total (mt/user-http-request :rasta :get 200 "metric")))))))

(deftest list-metric-hydrates-collection-test
  (testing "GET /api/metric hydrates collection information"
    (mt/with-temp [:model/Collection collection {:name "Test Collection"}
                   :model/Card       metric     {:name          "Metric in Collection"
                                                 :type          :metric
                                                 :collection_id (:id collection)
                                                 :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response        (mt/user-http-request :rasta :get 200 "metric")
            returned-metric (first (:data response))]
        (is (= (:id collection) (:collection_id returned-metric)))
        (is (= (:id collection) (get-in returned-metric [:collection :id])))
        (is (= "Test Collection" (get-in returned-metric [:collection :name])))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            GET /api/metric/:id                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-metric-test
  (testing "GET /api/metric/:id"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :description   "A test metric"
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))]
        (is (= (:id metric) (:id response)))
        (is (= "Test Metric" (:name response)))
        (is (= "A test metric" (:description response)))))))

(deftest fetch-metric-not-found-test
  (testing "GET /api/metric/:id returns 404 for non-existent metric"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404 (str "metric/" Integer/MAX_VALUE))))))

(deftest fetch-metric-hydrates-dimensions-test
  (testing "GET /api/metric/:id returns dimensions and dimension_mappings"
    (mt/with-temp [:model/Card metric {:name          "Metric with Dimensions"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))]
        (is (contains? response :dimensions))
        (is (contains? response :dimension_mappings))))))

(deftest fetch-metric-permissions-test
  (testing "GET /api/metric/:id respects collection permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card metric {:name          "Protected Metric"
                                         :type          :metric
                                         :collection_id (:id collection)
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (testing "returns 403 without permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "metric/" (:id metric))))))))))

(deftest fetch-metric-rejects-non-metric-card-test
  (testing "GET /api/metric/:id returns 404 for non-metric cards"
    (mt/with-temp [:model/Card card {:name          "Regular Question"
                                     :type          :question
                                     :dataset_query (mt/mbql-query venues)}]
      (is (= "Not found."
             (mt/user-http-request :rasta :get 404 (str "metric/" (:id card))))))))

(deftest fetch-metric-saves-dimensions-on-read-test
  (testing "GET /api/metric/:id saves dimensions and dimension_mappings to the database"
    (mt/with-temp [:model/Card metric {:name          "Metric with Dimensions"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (testing "no dimensions saved initially"
        (let [initial-card (t2/select-one :model/Card :id (:id metric))]
          (is (nil? (:dimensions initial-card)))
          (is (nil? (:dimension_mappings initial-card)))))
      (testing "response contains dimensions with active status"
        (let [response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))]
          (is (seq (:dimensions response)))
          (is (seq (:dimension_mappings response)))
          (is (every? #(= "status/active" (:status %)) (:dimensions response)))))
      (testing "dimensions persisted to database"
        (let [updated-card (t2/select-one :model/Card :id (:id metric))]
          (is (seq (:dimensions updated-card)))
          (is (seq (:dimension_mappings updated-card))))))))
