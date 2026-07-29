(ns metabase-enterprise.serialization.v2.metric-dimensions-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as serdes.extract]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metrics.core :as metrics]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.warehouses.models.database :as models.database]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [thunk]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)
                                                  models.database/assert-not-h2! (constantly nil)]
                        (binding [models.database/*include-h2-in-extract?* true]
                          (thunk)))))

(def ^:private dim-a-id "11111111-1111-4111-8111-111111111111")
(def ^:private dim-b-id "22222222-2222-4222-8222-222222222222")

(defn- no-labels [path]
  (mapv #(dissoc % :label) path))

(defn- ingestion-in-memory [extractions]
  (let [mapped (into {} (map (juxt (comp no-labels serdes/path) identity)) extractions)]
    (reify
      serdes.ingest/Ingestable
      (ingest-list [_]
        (keys mapped))
      (ingest-one [_ path]
        (get mapped (no-labels path)))
      (ingest-errors [_]
        []))))

(defn- by-model [entities model-name]
  (filter #(-> % :serdes/meta last :model (= model-name)) entities))

(defn- metric-query [db-id table-id field-id]
  (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
        table             (lib.metadata/table metadata-provider table-id)
        query             (lib/query metadata-provider table)
        field             (lib.metadata/field metadata-provider field-id)]
    (lib/aggregate query (lib/sum field))))

(defn- metric-dimensions [category-field-id title-field-id]
  [{:id             dim-a-id
    :name           "CATEGORY"
    :display-name   "Category"
    :effective-type :type/Text
    :status         :status/active
    :default        true
    :sources        [{:type :field, :field-id category-field-id}]}
   {:id             dim-b-id
    :name           "TITLE"
    :display-name   "Title"
    :effective-type :type/Text
    :status         :status/active
    :sources        [{:type :field, :field-id title-field-id}]}])

(defn- metric-dimension-mappings
  [sales-table-id products-table-id category-field-id title-field-id product-fk-id]
  [{:type         :table
    :table-id     sales-table-id
    :dimension-id dim-a-id
    :target       [:field {:lib/uuid "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"} category-field-id]}
   {:type         :table
    :table-id     products-table-id
    :dimension-id dim-b-id
    :target       [:field {:lib/uuid     "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
                           :source-field product-fk-id}
                   title-field-id]}])

(defn- create-source-metric! []
  (let [collection (ts/create! :model/Collection :name "Metrics")
        database   (ts/create! :model/Database :name "metric-db")
        sales      (ts/create! :model/Table :name "sales" :db_id (:id database))
        products   (ts/create! :model/Table :name "products" :db_id (:id database))
        amount     (ts/create! :model/Field :name "amount" :table_id (:id sales))
        category   (ts/create! :model/Field :name "category" :table_id (:id sales))
        product-fk (ts/create! :model/Field :name "product_id" :table_id (:id sales))
        title      (ts/create! :model/Field :name "title" :table_id (:id products))
        user       (ts/create! :model/User :first_name "Tom" :last_name "Scholz" :email "tom@bost.on")
        card       (ts/create! :model/Card
                               :name               "Total Amount"
                               :type               :metric
                               :database_id        (:id database)
                               :table_id           (:id sales)
                               :collection_id      (:id collection)
                               :creator_id         (:id user)
                               :dataset_query      (metric-query (:id database) (:id sales) (:id amount))
                               :dimensions         (metric-dimensions (:id category) (:id title))
                               :dimension_mappings (metric-dimension-mappings
                                                    (:id sales) (:id products)
                                                    (:id category) (:id title) (:id product-fk)))]
    {:sales sales, :category category, :title title, :card card}))

(defn- assert-portable-extraction! [serialized]
  (let [card (m/find-first #(= "Total Amount" (:name %)) (by-model serialized "Card"))]
    (is (=? [{:id dim-a-id :sources [{:field-id ["metric-db" nil "sales" "category"]}]}
             {:id dim-b-id :sources [{:field-id ["metric-db" nil "products" "title"]}]}]
            (:dimensions card)))
    (is (=? [{:dimension-id dim-a-id
              :table-id     ["metric-db" nil "sales"]
              :target       [:field {} ["metric-db" nil "sales" "category"]]}
             {:dimension-id dim-b-id
              :table-id     ["metric-db" nil "products"]
              :target       [:field {:source-field ["metric-db" nil "sales" "product_id"]}
                             ["metric-db" nil "products" "title"]]}]
            (:dimension_mappings card)))
    (is (contains? (metrics/dimension-mappings-deps (:dimension_mappings card))
                   [{:model "Database" :id "metric-db"}]))
    (is (contains? (serdes/deserialization-dependencies card)
                   [{:model "Database" :id "metric-db"}]))))

(defn- prepare-destination! []
  (let [other-db    (ts/create! :model/Database :name "other-db")
        other-table (ts/create! :model/Table :name "junk" :db_id (:id other-db))]
    (doseq [i (range 6)]
      (ts/create! :model/Field :name (str "junk-field-" i) :table_id (:id other-table)))
    (ts/create! :model/User :first_name "Tom" :last_name "Scholz" :email "tom@bost.on")))

(defn- assert-remapped-import! [source]
  (let [sales     (t2/select-one :model/Table :name "sales")
        products  (t2/select-one :model/Table :name "products")
        category  (t2/select-one :model/Field :table_id (:id sales) :name "category")
        product-fk (t2/select-one :model/Field :table_id (:id sales) :name "product_id")
        title      (t2/select-one :model/Field :table_id (:id products) :name "title")
        card       (t2/select-one :model/Card :name "Total Amount")]
    (is (not= (-> source :sales :id) (:id sales)))
    (is (not= (-> source :category :id) (:id category)))
    (is (not= (-> source :title :id) (:id title)))
    (is (=? [{:id dim-a-id :sources [{:field-id (:id category)}]}
             {:id dim-b-id :sources [{:field-id (:id title)}]}]
            (:dimensions card)))
    (is (=? [{:dimension-id dim-a-id
              :table-id     (:id sales)
              :target       [:field {} (:id category)]}
             {:dimension-id dim-b-id
              :table-id     (:id products)
              :target       [:field {:source-field (:id product-fk)} (:id title)]}]
            (:dimension_mappings card)))
    (is (= [dim-a-id] (into [] (comp (filter :default) (map :id)) (:dimensions card))))))

(deftest metric-v2-dimensions-test
  (testing "curated metric dimensions and mappings are portable"
    (ts/with-dbs [source-db dest-db]
      (let [source     (ts/with-db source-db (create-source-metric!))
            serialized (ts/with-db source-db (into [] (serdes.extract/extract {})))]
        (assert-portable-extraction! serialized)
        (ts/with-db dest-db
          (prepare-destination!)
          (serdes.load/load-metabase! (ingestion-in-memory serialized))
          (assert-remapped-import! source))))))

(deftest metric-v2-dimensions-deletion-propagates-test
  (testing "deleting a curated dimension on the source deletes it on the destination after import"
    (ts/with-dbs [source-db dest-db]
      (let [source (ts/with-db source-db (create-source-metric!))
            extract-source #(ts/with-db source-db (into [] (serdes.extract/extract {})))]
        (ts/with-db dest-db
          (prepare-destination!)
          (serdes.load/load-metabase! (ingestion-in-memory (extract-source))))
        (ts/with-db source-db
          (t2/update! :model/Card (-> source :card :id)
                      {:dimensions         (filterv #(= dim-a-id (:id %))
                                                    (-> source :card :dimensions))
                       :dimension_mappings (filterv #(= dim-a-id (:dimension-id %))
                                                    (-> source :card :dimension_mappings))}))
        (ts/with-db dest-db
          (serdes.load/load-metabase! (ingestion-in-memory (extract-source)))
          (let [card (t2/select-one :model/Card :name "Total Amount")]
            (is (= [dim-a-id] (mapv :id (:dimensions card))))
            (is (= [dim-a-id] (mapv :dimension-id (:dimension_mappings card))))))))))
