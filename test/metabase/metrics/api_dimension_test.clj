(ns metabase.metrics.api-dimension-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metrics.core :as metrics]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

;;; ------------------------------------------------ Helper Functions ------------------------------------------------

(defn- metric-query []
  (let [mp (mt/metadata-provider)
        table-metadata (lib.metadata/table mp (mt/id :venues))]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count)))))

(defn- get-dimension-id [metric dimension-name]
  (let [dim (first (filter #(= (:name %) dimension-name) (:dimensions metric)))]
    (:id dim)))

(def ^:private fake-dimension-id
  "550e8400-e29b-41d4-a716-446655440000")

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 GET /api/metric/:id/dimension/:key/values                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dimension-values-endpoint-test
  (testing "GET /api/metric/:id/dimension/:key/values returns field values"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [hydrated-metric (t2/select-one :model/Card :id (:id metric))
            dim-id          (get-dimension-id hydrated-metric "PRICE")]
        (is (some? dim-id) "PRICE dimension should exist")
        (let [response (mt/user-http-request :rasta :get 200
                                             (str "metric/" (:id metric) "/dimension/" dim-id "/values"))]
          (is (= (mt/id :venues :price) (:field_id response)))
          (is (= [[1] [2] [3] [4]] (:values response)))
          (is (false? (:has_more_values response))))))))

(deftest dimension-values-missing-metric-test
  (testing "GET /api/metric/:id/dimension/:key/values returns 404 for non-existent metric"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404
                                 (str "metric/" Integer/MAX_VALUE "/dimension/" fake-dimension-id "/values"))))))

(deftest dimension-values-missing-dimension-test
  (testing "GET /api/metric/:id/dimension/:key/values returns 400 for non-existent dimension"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [response (mt/user-http-request :rasta :get 400
                                           (str "metric/" (:id metric) "/dimension/" fake-dimension-id "/values"))]
        (is (re-find #"Dimension not found" (:message response)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              GET /api/metric/:id/dimension/:key/search/:query                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dimension-search-endpoint-test
  (testing "GET /api/metric/:id/dimension/:key/search/:query searches field values"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [hydrated-metric (t2/select-one :model/Card :id (:id metric))
            dim-id          (get-dimension-id hydrated-metric "NAME")]
        (is (some? dim-id) "NAME dimension should exist")
        (let [response (mt/user-http-request :rasta :get 200
                                             (str "metric/" (:id metric) "/dimension/" dim-id "/search/Red%20Med"))]
          (is (= (mt/id :venues :name) (:field_id response)))
          (is (= [["Red Medicine"]] (:values response))))))))

(deftest dimension-search-missing-metric-test
  (testing "GET /api/metric/:id/dimension/:key/search/:query returns 404 for non-existent metric"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404
                                 (str "metric/" Integer/MAX_VALUE "/dimension/" fake-dimension-id "/search/test"))))))

(deftest dimension-search-missing-dimension-test
  (testing "GET /api/metric/:id/dimension/:key/search/:query returns 400 for non-existent dimension"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [response (mt/user-http-request :rasta :get 400
                                           (str "metric/" (:id metric) "/dimension/" fake-dimension-id "/search/test"))]
        (is (re-find #"Dimension not found" (:message response)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                               GET /api/metric/:id/dimension/:key/remapping                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dimension-remapping-endpoint-test
  (testing "GET /api/metric/:id/dimension/:key/remapping returns value"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [hydrated-metric (t2/select-one :model/Card :id (:id metric))
            dim-id          (get-dimension-id hydrated-metric "PRICE")]
        (is (some? dim-id) "PRICE dimension should exist")
        (let [response (mt/user-http-request :rasta :get 200
                                             (str "metric/" (:id metric) "/dimension/" dim-id "/remapping")
                                             :value "1")]
          (is (= [1] response)))))))

(deftest dimension-remapping-missing-metric-test
  (testing "GET /api/metric/:id/dimension/:key/remapping returns 404 for non-existent metric"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404
                                 (str "metric/" Integer/MAX_VALUE "/dimension/" fake-dimension-id "/remapping")
                                 :value "1")))))

(deftest dimension-remapping-missing-dimension-test
  (testing "GET /api/metric/:id/dimension/:key/remapping returns 400 for non-existent dimension"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [response (mt/user-http-request :rasta :get 400
                                           (str "metric/" (:id metric) "/dimension/" fake-dimension-id "/remapping")
                                           :value "1")]
        (is (re-find #"Dimension not found" (:message response)))))))

(deftest dimension-remapping-requires-value-param-test
  (testing "GET /api/metric/:id/dimension/:key/remapping requires value parameter"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [hydrated-metric (t2/select-one :model/Card :id (:id metric))
            dim-id          (get-dimension-id hydrated-metric "PRICE")]
        (is (some? dim-id) "PRICE dimension should exist")
        (is (some? (mt/user-http-request :rasta :get 400
                                         (str "metric/" (:id metric) "/dimension/" dim-id "/remapping"))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Permission Tests                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dimension-values-permission-test
  (testing "GET /api/metric/:id/dimension/:key/values respects collection permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       metric {:name          "Protected Metric"
                                               :type          :metric
                                               :collection_id (:id collection)
                                               :database_id   (mt/id)
                                               :table_id      (mt/id :venues)
                                               :dataset_query (metric-query)}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403
                                     (str "metric/" (:id metric) "/dimension/" fake-dimension-id "/values"))))))))

(deftest dimension-search-permission-test
  (testing "GET /api/metric/:id/dimension/:key/search/:query respects collection permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       metric {:name          "Protected Metric"
                                               :type          :metric
                                               :collection_id (:id collection)
                                               :database_id   (mt/id)
                                               :table_id      (mt/id :venues)
                                               :dataset_query (metric-query)}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403
                                     (str "metric/" (:id metric) "/dimension/" fake-dimension-id "/search/test"))))))))

(deftest dimension-remapping-permission-test
  (testing "GET /api/metric/:id/dimension/:key/remapping respects collection permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       metric {:name          "Protected Metric"
                                               :type          :metric
                                               :collection_id (:id collection)
                                               :database_id   (mt/id)
                                               :table_id      (mt/id :venues)
                                               :dataset_query (metric-query)}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403
                                     (str "metric/" (:id metric) "/dimension/" fake-dimension-id "/remapping")
                                     :value "1")))))))
