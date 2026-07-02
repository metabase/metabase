(ns metabase.metrics.api-dimension-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
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
  (testing "GET /api/metric/:id/dimension/:key/search searches field values"
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
                                             (str "metric/" (:id metric) "/dimension/" dim-id "/search")
                                             :query "Red Med")]
          (is (= [["Red Medicine"]] response)))))))

(deftest dimension-search-missing-metric-test
  (testing "GET /api/metric/:id/dimension/:key/search returns 404 for non-existent metric"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404
                                 (str "metric/" Integer/MAX_VALUE "/dimension/" fake-dimension-id "/search")
                                 :query "test")))))

(deftest dimension-search-missing-dimension-test
  (testing "GET /api/metric/:id/dimension/:key/search returns 400 for non-existent dimension"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [response (mt/user-http-request :rasta :get 400
                                           (str "metric/" (:id metric) "/dimension/" fake-dimension-id "/search")
                                           :query "test")]
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
  (testing "GET /api/metric/:id/dimension/:key/search respects collection permissions"
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
                                     (str "metric/" (:id metric) "/dimension/" fake-dimension-id "/search")
                                     :query "test")))))))

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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Dimension CRUD Endpoints                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmacro ^:private with-seeded-metric [[binding] & body]
  `(mt/with-temp [:model/Card metric# {:name          "CRUD Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
     (metrics/sync-dimensions! :metadata/metric (:id metric#))
     (let [~binding metric#]
       ~@body)))

(deftest list-dimensions-test
  (testing "GET /api/metric/:id/dimension lists the curated (self-table) dimensions"
    (with-seeded-metric [metric]
      (let [resp (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension"))]
        (is (seq (:added resp)) "should list seeded self-table dimensions")
        (is (= [] (:addable resp)) "addable is empty unless requested")
        (is (contains? (set (map :display_name (:added resp))) "Price"))))))

(deftest list-dimensions-with-addable-test
  (testing "GET /api/metric/:id/dimension?with_addable=true returns joinable columns to add"
    (with-seeded-metric [metric]
      (let [resp (mt/user-http-request :crowberto :get 200
                                       (str "metric/" (:id metric) "/dimension") :with_addable true)]
        (is (seq (:addable resp)) "FK-joinable (categories) columns should be addable")
        (is (every? #(and (contains? % :group) (seq (:dimensions %))) (:addable resp))
            "each addable entry is a {group, dimensions} group")))))

(deftest list-dimensions-search-test
  (testing "GET /api/metric/:id/dimension?query=… filters added dimensions by name"
    (with-seeded-metric [metric]
      (let [names (->> (mt/user-http-request :crowberto :get 200
                                             (str "metric/" (:id metric) "/dimension") :query "Price")
                       :added (map :display_name) set)]
        (is (contains? names "Price"))
        (is (not (contains? names "Latitude")))))))

(deftest remove-dimensions-test
  (testing "POST /api/metric/:id/dimension/remove removes dimensions by id and persists"
    (with-seeded-metric [metric]
      (let [price-id (get-dimension-id (t2/select-one :model/Card :id (:id metric)) "PRICE")
            resp     (mt/user-http-request :crowberto :post 200
                                           (str "metric/" (:id metric) "/dimension/remove")
                                           {:dimension_ids [price-id]})]
        (is (not (contains? (set (map :id resp)) price-id))
            "removed dimension is gone from the response")
        (is (not (contains? (set (map :id (:dimensions (t2/select-one :model/Card :id (:id metric))))) price-id))
            "removal is persisted")))))

(deftest add-dimensions-test
  (testing "POST /api/metric/:id/dimension/add adds a full dimension object and persists its UUID"
    (with-seeded-metric [metric]
      (let [addable (-> (mt/user-http-request :crowberto :get 200
                                              (str "metric/" (:id metric) "/dimension") :with_addable true)
                        :addable first :dimensions first)]
        (is (some? addable) "there should be an addable joinable dimension")
        (let [resp      (mt/user-http-request :crowberto :post 200
                                              (str "metric/" (:id metric) "/dimension/add")
                                              {:dimensions [addable]})
              field-ids (->> resp (mapcat :sources) (map :field-id) set)]
          (is (contains? (set (map :id resp)) (:id addable))
              "added dimension keeps the posted UUID")
          (is (contains? field-ids (-> addable :sources first :field-id))
              "added dimension targets the chosen column")
          (is (contains? (set (map :id (:dimensions (t2/select-one :model/Card :id (:id metric))))) (:id addable))
              "the addition is persisted"))))))

(deftest update-dimension-display-name-test
  (testing "POST /api/metric/:id/dimension/:id updates display_name"
    (with-seeded-metric [metric]
      (let [price-id (get-dimension-id (t2/select-one :model/Card :id (:id metric)) "PRICE")
            resp     (mt/user-http-request :crowberto :post 200
                                           (str "metric/" (:id metric) "/dimension/" price-id)
                                           {:display_name "Cost"})]
        (is (= "Cost" (:display_name resp)))
        (is (= "Cost" (->> (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension"))
                           :added (m/find-first #(= price-id (:id %))) :display_name))
            "the rename is persisted")))))

(deftest update-dimension-source-type-mismatch-test
  (testing "POST /api/metric/:id/dimension/:id rejects a source column of a different type"
    (with-seeded-metric [metric]
      (let [name-id (get-dimension-id (t2/select-one :model/Card :id (:id metric)) "NAME")
            resp    (mt/user-http-request :crowberto :post 400
                                          (str "metric/" (:id metric) "/dimension/" name-id)
                                          {:source {:type "field" :field-id (mt/id :venues :price)}})]
        (is (re-find #"different type" resp))))))

(deftest dimension-crud-permission-test
  (testing "dimension CRUD endpoints require write permission"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       metric {:name          "Protected Metric"
                                               :type          :metric
                                               :collection_id (:id collection)
                                               :database_id   (mt/id)
                                               :table_id      (mt/id :venues)
                                               :dataset_query (metric-query)}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403
                                     (str "metric/" (:id metric) "/dimension/remove")
                                     {:dimension_ids [fake-dimension-id]})))))))

(deftest default-dimension-absent-by-default-test
  (testing "a freshly seeded metric has no default dimension"
    (with-seeded-metric [metric]
      (let [added (:added (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension")))]
        (is (seq added))
        (is (every? (comp false? :default) added)
            "no dimension is default until one is set")))))

(deftest set-default-dimension-test
  (testing "POST /api/metric/:id/dimension/set-default keeps exactly one dimension as the default"
    (with-seeded-metric [metric]
      (let [added    (:added (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension")))
            a        (:id (first added))
            b        (:id (second added))
            defaults (fn [resp] (into #{} (comp (filter :default) (map :id)) resp))]
        (is (= #{a} (defaults (mt/user-http-request :crowberto :post 200
                                                    (str "metric/" (:id metric) "/dimension/set-default")
                                                    {:dimension_id a})))
            "A becomes the sole default")
        (is (= #{b} (defaults (mt/user-http-request :crowberto :post 200
                                                    (str "metric/" (:id metric) "/dimension/set-default")
                                                    {:dimension_id b})))
            "setting B clears A — still exactly one default")
        (is (= #{b} (defaults (:added (mt/user-http-request :crowberto :get 200
                                                            (str "metric/" (:id metric) "/dimension")))))
            "the default is persisted")))))

(deftest set-default-dimension-not-found-test
  (testing "set-default returns 404 for an unknown dimension"
    (with-seeded-metric [metric]
      (is (mt/user-http-request :crowberto :post 404
                                (str "metric/" (:id metric) "/dimension/set-default")
                                {:dimension_id fake-dimension-id})))))

(deftest update-dimension-preserves-other-mappings-test
  (testing "updating one dimension leaves every dimension mapping intact"
    (with-seeded-metric [metric]
      (let [before   (:dimension_mappings (t2/select-one :model/Card :id (:id metric)))
            price-id (get-dimension-id (t2/select-one :model/Card :id (:id metric)) "PRICE")]
        (mt/user-http-request :crowberto :post 200
                              (str "metric/" (:id metric) "/dimension/" price-id)
                              {:display_name "Cost"})
        (let [after (:dimension_mappings (t2/select-one :model/Card :id (:id metric)))]
          (is (= (count before) (count after)) "no mappings dropped")
          (is (every? some? after) "no nil mappings")
          (is (= (set (map :dimension-id before)) (set (map :dimension-id after)))
              "every dimension is still mapped"))))))
