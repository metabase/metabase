(ns metabase.metrics.api-dimension-test
  (:require
   [clojure.string :as str]
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

(defn- orders-metric-query []
  (let [mp (mt/metadata-provider)
        table-metadata (lib.metadata/table mp (mt/id :orders))]
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
  (testing "GET /api/metric/:id/dimension?with-addable=true returns joinable columns to add"
    (with-seeded-metric [metric]
      (let [resp (mt/user-http-request :crowberto :get 200
                                       (str "metric/" (:id metric) "/dimension") :with-addable true)]
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

(deftest list-dimensions-excludes-orphaned-dimensions-test
  (testing "GET /api/metric/:id/dimension synchronizes and optionally includes orphaned dimensions"
    (with-seeded-metric [metric]
      (let [{:keys [dimensions dimension_mappings]} (t2/select-one :model/Card :id (:id metric))
            orphan-id (:id (first dimensions))
            mappings  (mapv #(if (= orphan-id (:dimension-id %))
                               (assoc-in % [:target 2] (mt/id :users :name))
                               %)
                            dimension_mappings)]
        (t2/update! :model/Card (:id metric) {:dimension_mappings mappings})
        (let [response (mt/user-http-request :crowberto :get 200
                                             (str "metric/" (:id metric) "/dimension"))]
          (is (not (some #(= orphan-id (:id %)) (:added response)))))
        (let [response (mt/user-http-request :crowberto :get 200
                                             (str "metric/" (:id metric) "/dimension")
                                             :include-orphaned true)
              orphan   (some #(when (= orphan-id (:id %)) %) (:added response))]
          (is (= "status/orphaned" (:status orphan))))))))

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

(deftest remove-default-dimension-test
  (testing "removing the default dimension assigns the preferred remaining active dimension"
    (with-seeded-metric [metric]
      (let [dimensions       (:dimensions (t2/select-one :model/Card :id (:id metric)))
            current-default (m/find-first :default dimensions)
            remaining-ids   (into #{}
                                  (comp (remove #(= (:id current-default) (:id %)))
                                        (remove #(= :status/orphaned (:status %)))
                                        (map :id))
                                  dimensions)]
        (is (some? current-default))
        (is (seq remaining-ids))
        (when current-default
          (let [resp     (mt/user-http-request :crowberto :post 200
                                               (str "metric/" (:id metric) "/dimension/remove")
                                               {:dimension_ids [(:id current-default)]})
                defaults (filter :default resp)]
            (is (= 1 (count defaults)))
            (is (contains? remaining-ids (:id (first defaults))))))))))

(deftest remove-all-dimensions-test
  (testing "removing all dimensions leaves the metric without a default"
    (with-seeded-metric [metric]
      (let [dimension-ids (mapv :id (:dimensions (t2/select-one :model/Card :id (:id metric))))
            resp          (mt/user-http-request :crowberto :post 200
                                                (str "metric/" (:id metric) "/dimension/remove")
                                                {:dimension_ids dimension-ids})]
        (is (empty? resp))
        (is (empty? (:dimensions (t2/select-one :model/Card :id (:id metric)))))))))

(deftest add-dimensions-test
  (testing "POST /api/metric/:id/dimension/add adds a full dimension object and preserves the default"
    (with-seeded-metric [metric]
      (let [default-id (-> (m/find-first :default
                                         (:dimensions (t2/select-one :model/Card :id (:id metric))))
                           :id)
            addable    (-> (mt/user-http-request :crowberto :get 200
                                                 (str "metric/" (:id metric) "/dimension") :with-addable true)
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
              "the addition is persisted")
          (is (= [default-id] (mapv :id (filter :default resp)))
              "the existing default is preserved"))))))

(deftest add-dimension-through-one-of-multiple-foreign-key-paths-test
  (testing "adding a dimension reached through duplicate foreign key paths preserves the selected path"
    (let [product-id-field-id (mt/id :orders :product_id)
          user-id-field-id    (mt/id :orders :user_id)
          product-title-id    (mt/id :products :title)]
      (mt/with-temp-vals-in-db :model/Field user-id-field-id
                               {:fk_target_field_id (mt/id :products :id)}
        (mt/with-temp [:model/Card metric {:name          "Duplicate FK Metric"
                                           :type          :metric
                                           :database_id   (mt/id)
                                           :table_id      (mt/id :orders)
                                           :dataset_query (orders-metric-query)}]
          (metrics/sync-dimensions! :metadata/metric (:id metric))
          (let [response (mt/user-http-request :crowberto :get 200
                                               (str "metric/" (:id metric) "/dimension")
                                               :with-addable true)
                title-dimensions (->> (:addable response)
                                      (mapcat :dimensions)
                                      (filter #(= product-title-id (-> % :sources first :field-id))))
                source-field     #(get (second (:mapping_target %)) :source-field)
                by-source-field  (m/index-by source-field
                                             title-dimensions)
                selected         (get by-source-field product-id-field-id)]
            (is (= #{product-id-field-id user-id-field-id}
                   (set (keys by-source-field))))
            (is (some? selected))
            (when selected
              (mt/user-http-request :crowberto :post 200
                                    (str "metric/" (:id metric) "/dimension/add")
                                    {:dimensions [selected]})
              (let [stored-mapping (->> (t2/select-one-fn :dimension_mappings
                                                          :model/Card :id (:id metric))
                                        (m/find-first #(= (:id selected) (:dimension-id %))))
                    remaining     (->> (mt/user-http-request :crowberto :get 200
                                                             (str "metric/" (:id metric) "/dimension")
                                                             :with-addable true)
                                       :addable
                                       (mapcat :dimensions)
                                       (filter #(= product-title-id (-> % :sources first :field-id))))]
                (is (= product-id-field-id (get-in stored-mapping [:target 1 :source-field])))
                (is (= [user-id-field-id]
                       (mapv source-field remaining)))))))))))

(deftest add-first-dimension-assigns-default-test
  (testing "adding a dimension to an empty curated list makes it the default"
    (with-seeded-metric [metric]
      (let [dimension-ids (mapv :id (:dimensions (t2/select-one :model/Card :id (:id metric))))]
        (mt/user-http-request :crowberto :post 200
                              (str "metric/" (:id metric) "/dimension/remove")
                              {:dimension_ids dimension-ids})
        (let [addable (-> (mt/user-http-request :crowberto :get 200
                                                (str "metric/" (:id metric) "/dimension") :with-addable true)
                          :addable first :dimensions first)
              resp    (mt/user-http-request :crowberto :post 200
                                            (str "metric/" (:id metric) "/dimension/add")
                                            {:dimensions [addable]})]
          (is (= [(:id addable)] (mapv :id (filter :default resp))))
          (is (= [(:id addable)]
                 (->> (t2/select-one :model/Card :id (:id metric))
                      :dimensions
                      (filter :default)
                      (mapv :id)))))))))

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

(deftest default-dimension-picked-on-seed-test
  (testing "a freshly seeded metric has one default dimension"
    (with-seeded-metric [metric]
      (let [added (:added (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension")))]
        (is (seq added))
        (is (= 1 (count (filter :default added))))))))

(deftest set-default-dimension-test
  (testing "POST /api/metric/:id/dimension/set-default keeps exactly one dimension as the default"
    (with-seeded-metric [metric]
      (let [added    (:added (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension")))
            a        (:id (first added))
            b        (:id (second added))
            defaults (fn [resp] (into #{} (comp (filter :default) (map :id)) resp))]
        (t2/update! :model/Card (:id metric)
                    {:dimensions (mapv #(assoc % :default true)
                                       (t2/select-one-fn :dimensions :model/Card :id (:id metric)))})
        (is (= #{a} (defaults (mt/user-http-request :crowberto :post 200
                                                    (str "metric/" (:id metric) "/dimension/set-default")
                                                    {:dimension_id a})))
            "setting A repairs multiple persisted defaults")
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

(deftest reorder-dimensions-test
  (testing "POST /api/metric/:id/dimension/reorder persists the given order"
    (with-seeded-metric [metric]
      (let [ids       (->> (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension"))
                           :added (mapv :id))
            new-order (vec (reverse ids))
            resp      (mt/user-http-request :crowberto :post 200
                                            (str "metric/" (:id metric) "/dimension/reorder")
                                            {:dimension_ids new-order})]
        (is (= new-order (mapv :id resp))
            "response reflects the new order")
        (is (= new-order
               (->> (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension"))
                    :added (mapv :id)))
            "the order is persisted")))))

(deftest reorder-dimensions-partial-list-test
  (testing "dimensions missing from the posted order keep their relative order after the listed ones"
    (with-seeded-metric [metric]
      (let [ids            (->> (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension"))
                                :added (mapv :id))
            [listed unlisted] [(vec (reverse (take 2 ids))) (vec (drop 2 ids))]
            resp           (mt/user-http-request :crowberto :post 200
                                                 (str "metric/" (:id metric) "/dimension/reorder")
                                                 {:dimension_ids listed})]
        (is (= (into listed unlisted) (mapv :id resp)))))))

(deftest reorder-dimensions-permission-test
  (testing "POST /api/metric/:id/dimension/reorder requires write permission"
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
                                     (str "metric/" (:id metric) "/dimension/reorder")
                                     {:dimension_ids [fake-dimension-id]})))))))

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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                     Curated dimensions: pre-curation metric modernization on read                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- pre-curation-metric!
  "Insert a metric on ORDERS and stamp it with the previous release's `card_schema` and no persisted
   `:dimensions`, simulating a metric created before curated dimensions shipped. `f` receives the
   metric id."
  [f]
  (let [mp       (mt/metadata-provider)
        orders-q (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                     (lib/aggregate (lib/count)))]
    (mt/with-temp [:model/Card metric {:name          "Orders Count"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :orders)
                                       :dataset_query orders-q}]
      ;; Force the previous release's card_schema (23) and leave :dimensions never synced (nil),
      ;; bypassing before-update so nothing bumps it back to the current version.
      (t2/query-one {:update :report_card
                     :set    {:card_schema 23}
                     :where  [:= :id (:id metric)]})
      (f (:id metric)))))

(deftest pre-curation-metric-modernized-to-full-dimension-set-on-read-test
  (testing (str "UXW-4808: a metric with the previous release's `card_schema` and no persisted "
                "`:dimensions` is modernized on read — the `:model/Card` schema upgrade backfills the "
                "FULL implicitly-joined dimension set (own-table + FK-joined columns) it implicitly "
                "exposed pre-curation, so existing dashboard-filter mappings on joined columns still "
                "correspond to a live dimension.")
    (pre-curation-metric!
     (fn [metric-id]
       (let [cat-field (mt/id :products :category)   ; reachable from ORDERS only via the implicit FK join
             dims      (:dimensions (mt/user-http-request :crowberto :get 200 (str "metric/" metric-id)))
             groups    (into #{} (comp (map :group)
                                       (map :type))
                             dims)
             fields    (into #{} (comp (mapcat :sources)
                                       (map :field-id))
                             dims)
             field-names (into {}
                               (map (juxt #(-> % :sources first :field-id) :display-name))
                               dims)]
         (testing "the modernized set spans the own-table AND joined columns"
           (is (contains? groups "main")       "own-table (main) dimensions are present")
           (is (contains? groups "connection") "FK-joined (connection) dimensions are present"))
         (testing "a joined column that an existing dashboard filter targets exists as a dimension"
           (is (contains? fields cat-field)
               "implicitly-joined PRODUCTS.CATEGORY is a live dimension after modernization"))
         (testing "connected dimensions use table-prefixed display names (UXW-4896)"
           (doseq [{:keys [display-name group]} dims
                   :when (= "connection" (:type group))]
             (is (str/starts-with? display-name (str (:display-name group) " - "))))
           (is (= "ID" (field-names (mt/id :orders :id))))
           (is (= "Product - ID" (field-names (mt/id :products :id))))
           (is (= "User - ID" (field-names (mt/id :people :id))))))))))

(deftest pre-curation-metric-dashboard-filter-on-joined-column-works-test
  (testing (str "UXW-4808: a dashboard filter bound to an implicitly-joined column of a pre-curation metric "
                "(previous-release `card_schema`, no persisted `:dimensions`) resolves and filters the "
                "query. The metric is modernized on read while the dashcard query runs, and the "
                "parameter mapping (a field ref via :source-field) executes correctly.")
    (pre-curation-metric!
     (fn [metric-id]
       (let [cat-field (mt/id :products :category)
             fk-field  (mt/id :orders :product_id)
             target    [:dimension [:field cat-field {:source-field fk-field}]]]
         (mt/with-temp [:model/Dashboard dash {:name       "Dash"
                                               :parameters [{:id "cat" :name "Category"
                                                             :slug "category" :type "string/="}]}
                        :model/DashboardCard dc {:dashboard_id (:id dash)
                                                 :card_id      metric-id
                                                 :parameter_mappings
                                                 [{:parameter_id "cat"
                                                   :card_id      metric-id
                                                   :target       target}]}]
           (let [run      (fn [params]
                            (mt/user-http-request
                             :crowberto :post 202
                             (format "dashboard/%d/dashcard/%d/card/%d/query"
                                     (:id dash) (:id dc) metric-id)
                             {:parameters params}))
                 total    (-> (run []) :data :rows ffirst)
                 filtered (-> (run [{:id     "cat"
                                     :target target
                                     :value  ["Gadget"]}])
                              :data :rows ffirst)]
             (testing "the join-column filter applies to the pre-curation metric's dashcard query"
               (is (pos-int? total)
                   "unfiltered metric returns a positive count")
               (is (pos-int? filtered)
                   "the filtered query executes and returns a count")
               (is (< filtered total)
                   "filtering by a single joined product category returns fewer rows than unfiltered")))))))))
