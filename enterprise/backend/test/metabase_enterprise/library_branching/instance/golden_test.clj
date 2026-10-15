(ns metabase-enterprise.library-branching.instance.golden-test
  "The golden tree of the format, as content of the app DB: a read of that content gives the items that the golden
  files decode to."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private golden-dir "enterprise/backend/test_resources/library_branching/golden")

(defn golden-snapshot
  "The snapshot that the golden files decode to."
  []
  (:snapshot (tree/decode-tree kinds/codecs
                               (keep (fn [^File f] (when (.isFile f) (Files/readAllBytes (.toPath f))))
                                     (file-seq (io/file golden-dir))))))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- field-ref
  [opts id]
  [:field (merge {:lib/uuid (str (random-uuid))} opts) id])

(defn- nested-id
  "The id of the `i`th entry of attribute `k` (`:tabs` or `:dashcards`) of the dashboard named `dashboard-name` of
  `snapshot`."
  [snapshot dashboard-name k i]
  (some (fn [{:keys [kind name attrs]}]
          (when (and (= :dashboard kind) (= dashboard-name name))
            (get-in attrs [k i :id])))
        (vals snapshot)))

(defn do-with-golden-content
  "Calls `f` with the content of the golden tree written to the app DB, in a transaction that rolls back."
  [f]
  (let [snapshot (golden-snapshot)
        eid-of   (fn [kind item-name]
                   (some (fn [[id item]] (when (and (= kind (:kind item)) (= item-name (:name item))
                                                    (string? id))
                                           id))
                         (sort-by (comp pr-str key) snapshot)))]
    (mt/with-temp [:model/Database db         {:name "Sample Database" :engine :h2 :details {}}
                   :model/Table    orders     {:db_id (:id db) :schema "PUBLIC" :name "ORDERS" :display_name "Orders"}
                   :model/Table    people     {:db_id (:id db) :schema "PUBLIC" :name "PEOPLE" :display_name "People"}
                   :model/Table    products   {:db_id (:id db) :schema "PUBLIC" :name "PRODUCTS"
                                               :display_name "Products"}
                   :model/Field    total      {:table_id (:id orders) :name "TOTAL" :base_type :type/Float}
                   :model/Field    user-id    {:table_id (:id orders) :name "USER_ID" :base_type :type/Integer}
                   :model/Field    created-at {:table_id (:id orders) :name "CREATED_AT" :base_type :type/DateTime}
                   :model/Field    product-id {:table_id (:id orders) :name "PRODUCT_ID" :base_type :type/Integer}
                   :model/Field    people-id  {:table_id (:id people) :name "ID" :base_type :type/BigInteger}
                   :model/Field    products-id {:table_id (:id products) :name "ID" :base_type :type/BigInteger}
                   :model/Collection library  {:name "Library" :type "library" :location "/"
                                               :entity_id (eid-of :collection "Library")}
                   :model/Collection data     {:name "Data" :type "library-data" :location (children-location library)
                                               :entity_id (eid-of :collection "Data")}
                   :model/Collection metrics  {:name "Metrics" :type "library-metrics"
                                               :location (children-location library)
                                               :entity_id (eid-of :collection "Metrics")}
                   :model/Collection revenue  {:name "Revenue" :location (children-location metrics)
                                               :description "Revenue metrics that finance signs off on."
                                               :entity_id (eid-of :collection "Revenue")}
                   :model/Collection filters  {:name "Filters" :namespace "snippets" :location "/"
                                               :entity_id (eid-of :collection "Filters")}
                   :model/Collection _finance {:name "Finance" :namespace "transforms" :location "/"
                                               :entity_id (eid-of :collection "Finance")}
                   :model/Collection dashboards {:name      "Dashboards" :type "library-dashboards"
                                                 :location  (children-location library)
                                                 :entity_id (eid-of :collection "Dashboards")}
                   :model/Card       total-revenue
                   {:name          "Total Revenue"
                    :type          :metric
                    :entity_id     "IW8kbqZVaMxdGtCM2F4U6"
                    :collection_id (:id revenue)
                    :description   "Sum of order totals, after discounts."
                    :display       :scalar
                    :dataset_query {:lib/type :mbql/query
                                    :database (:id db)
                                    :stages   [{:lib/type     :mbql.stage/mbql
                                                :source-table (:id orders)
                                                :aggregation  [[:sum {:lib/uuid (str (random-uuid))}
                                                                (field-ref {:base-type :type/Float} (:id total))]]}]}}
                   :model/Card       _by-month
                   {:name                   "Total Revenue"
                    :type                   :metric
                    :entity_id              "Qx81tWm0aLpN2ZcB7yYgr"
                    :collection_id          (:id revenue)
                    :display                :line
                    :collection_preview     false
                    :visualization_settings {:graph.dimensions ["CREATED_AT"] :graph.metrics ["count"]}
                    :dataset_query
                    {:lib/type :mbql/query
                     :database (:id db)
                     :stages   [{:lib/type     :mbql.stage/mbql
                                 :source-table (:id orders)
                                 :joins        [{:lib/type   :mbql/join
                                                 :alias      "Products"
                                                 :fields     :all
                                                 :stages     [{:lib/type     :mbql.stage/mbql
                                                               :source-table (:id products)}]
                                                 :conditions [[:= {:lib/uuid (str (random-uuid))}
                                                               (field-ref {:base-type :type/Integer} (:id product-id))
                                                               (field-ref {:base-type :type/BigInteger
                                                                           :join-alias "Products"}
                                                                          (:id products-id))]]}]
                                 :aggregation  [[:metric {:lib/uuid (str (random-uuid))} (:id total-revenue)]]
                                 :breakout     [(field-ref {:base-type :type/DateTime :temporal-unit :month}
                                                           (:id created-at))]}
                                {:lib/type :mbql.stage/mbql
                                 :filters  [[:> {:lib/uuid (str (random-uuid))}
                                             (field-ref {:base-type :type/Float} "count") 10]]}]}}
                   :model/TableUserSettings _ {:table_id      (:id orders)
                                               :is_published  true
                                               :collection_id (:id data)
                                               :description   "One row per order."}
                   :model/FieldUserSettings _ {:field_id      (:id total)
                                               :display_name  "Total"
                                               :semantic_type :type/Currency}
                   :model/FieldUserSettings _ {:field_id           (:id user-id)
                                               :visibility_type    :hidden
                                               :fk_target_field_id (:id people-id)}
                   :model/Dashboard  overview {:name          "Revenue overview"
                                               :entity_id     (eid-of :dashboard "Revenue overview")
                                               :collection_id (:id dashboards)
                                               :description   "Revenue at a glance."
                                               :width         "full"
                                               :parameters    [{:id "b0000001" :name "Month" :slug "month"
                                                                :type "date/all-options"}]}
                   :model/DashboardTab overview-tab {:dashboard_id (:id overview) :name "Overview" :position 0
                                                     :entity_id    (nested-id snapshot "Revenue overview" :tabs 0)}
                   :model/DashboardTab details-tab {:dashboard_id (:id overview) :name "Details" :position 1
                                                    :entity_id    (nested-id snapshot "Revenue overview" :tabs 1)}
                   :model/DashboardCard _ {:dashboard_id       (:id overview)
                                           :entity_id          (nested-id snapshot "Revenue overview" :dashcards 0)
                                           :card_id            (:id total-revenue)
                                           :dashboard_tab_id   (:id overview-tab)
                                           :row 0 :col 0 :size_x 12 :size_y 6
                                           :parameter_mappings [{:parameter_id "b0000001"
                                                                 :card_id      (:id total-revenue)
                                                                 :target       [:dimension [:field (:id created-at) nil]]}]}
                   :model/DashboardCard _ {:dashboard_id           (:id overview)
                                           :entity_id              (nested-id snapshot "Revenue overview" :dashcards 1)
                                           :dashboard_tab_id       (:id details-tab)
                                           :row 0 :col 0 :size_x 12 :size_y 2
                                           :visualization_settings {:text         "Revenue is in US dollars."
                                                                    :virtual_card {:display "text"}}}]
      (let [large-orders (t2/insert-returning-instance!
                          :model/Segment
                          {:name        "Large orders"
                           :entity_id   (eid-of :segment "Large orders")
                           :table_id    (:id orders)
                           :description "Orders over 100."
                           :creator_id  (mt/user->id :crowberto)
                           :definition  {:lib/type :mbql/query
                                         :database (:id db)
                                         :stages   [{:lib/type     :mbql.stage/mbql
                                                     :source-table (:id orders)
                                                     :filters      [[:> {:lib/uuid (str (random-uuid))}
                                                                     (field-ref {:base-type :type/Float} (:id total)) 100]]}]}})
            _            (t2/insert! :model/Measure
                                     {:name       "Order total"
                                      :entity_id  (eid-of :measure "Order total")
                                      :table_id   (:id orders)
                                      :creator_id (mt/user->id :crowberto)
                                      :definition {:lib/type :mbql/query
                                                   :database (:id db)
                                                   :stages   [{:lib/type     :mbql.stage/mbql
                                                               :source-table (:id orders)
                                                               :aggregation  [[:sum-where {:lib/uuid (str (random-uuid))}
                                                                               (field-ref {:base-type :type/Float} (:id total))
                                                                               [:segment {:lib/uuid (str (random-uuid))}
                                                                                (:id large-orders)]]]}]}})
            base-filter (t2/insert-returning-pk! :native_query_snippet
                                                 {:name       "Base filter"
                                                  :entity_id  (eid-of :snippet "Base filter")
                                                  :content    "products.deleted_at IS NULL"
                                                  :creator_id (mt/user->id :crowberto)
                                                  :archived   false
                                                  :created_at (java.time.OffsetDateTime/now)
                                                  :updated_at (java.time.OffsetDateTime/now)})]
        (t2/insert! :native_query_snippet
                    {:name          "Active product filter"
                     :entity_id     (eid-of :snippet "Active product filter")
                     :collection_id (:id filters)
                     :description   "Products that are for sale."
                     :content       "products.active = true AND price > {{min_price}} AND {{snippet: Base filter}}"
                     :template_tags (json/encode
                                     {"min_price"            {:type         "number"
                                                              :name         "min_price"
                                                              :display-name "Min price"
                                                              :id           "5f0a3c55-1f0b-4e0e-8c62-2b8f8a9e7d20"}
                                      "snippet: Base filter" {:type         "snippet"
                                                              :name         "snippet: Base filter"
                                                              :display-name "Base filter"
                                                              :snippet-name "Base filter"
                                                              :snippet-id   base-filter
                                                              :id           "0b1d6e0e-6c55-4c1a-9a43-6d5a8b2f6a11"}})
                     :creator_id    (mt/user->id :crowberto)
                     :archived      false
                     :created_at    (java.time.OffsetDateTime/now)
                     :updated_at    (java.time.OffsetDateTime/now)})
        (let [releases (t2/insert-returning-instance! :model/Timeline
                                                      {:name          "Releases"
                                                       :entity_id     (eid-of :timeline "Releases")
                                                       :collection_id (:id dashboards)
                                                       :description   "What we shipped."
                                                       :icon          "bell"
                                                       :creator_id    (mt/user->id :crowberto)})]
          (doseq [event [{:timeline_id  (:id releases)
                          :entity_id    "lAuNcHeVeNt000000001A"
                          :name         "Launch"
                          :timestamp    (java.time.OffsetDateTime/parse "2024-03-01T11:00:00+01:00")
                          :timezone     "Europe/Paris"
                          :time_matters true
                          :icon         "cake"
                          :creator_id   (mt/user->id :crowberto)}
                         {:timeline_id  (:id releases)
                          :entity_id    "oUtAgEeVeNt000000002B"
                          :name         "Outage"
                          :description  "The API was down."
                          :timestamp    (java.time.OffsetDateTime/parse "2024-05-02T00:00:00Z")
                          :timezone     "UTC"
                          :time_matters false
                          :icon         "star"
                          :creator_id   (mt/user->id :crowberto)}
                         {:timeline_id  (:id releases)
                          :entity_id    "aRcHiVeDeVeNt0000003C"
                          :name         "Archived"
                          :timestamp    (java.time.OffsetDateTime/parse "2024-06-01T00:00:00Z")
                          :timezone     "UTC"
                          :time_matters false
                          :icon         "star"
                          :archived     true
                          :creator_id   (mt/user->id :crowberto)}]]
            (t2/insert! :model/TimelineEvent event)))
        (t2/insert! :model/Glossary {:term       "Churn"
                                     :entity_id  (eid-of :glossary-term "Churn")
                                     :definition "The share of customers who cancel in a month."
                                     :creator_id (mt/user->id :crowberto)})
        (f snapshot)))))

(deftest read-gives-golden-items-test
  (testing "the content of the golden tree in the app DB reads as the items that the golden files decode to"
    (do-with-golden-content
     (fn [golden]
       (let [read (app-db/read-current)]
         (doseq [[id item] (sort-by (comp pr-str key) golden)]
           (testing (pr-str id)
             (is (= item (get read id))))))))))
