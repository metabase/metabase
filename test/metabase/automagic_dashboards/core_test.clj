(ns ^:mb/once metabase.automagic-dashboards.core-test
  (:require
   [cheshire.core :as json]
   [clojure.core.async :as a]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.api.common :as api]
   [metabase.automagic-dashboards.combination :as combination]
   [metabase.automagic-dashboards.comparison :as comparison]
   [metabase.automagic-dashboards.core :as magic]
   [metabase.automagic-dashboards.dashboard-templates :as dashboard-templates]
   [metabase.automagic-dashboards.interesting :as interesting]
   [metabase.automagic-dashboards.populate :as populate]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models
    :refer [Card Collection Database Field Metric Segment Table]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.query :as query :refer [Query]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.async :as qp.async]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.automagic-dashboards :as automagic-dashboards.test]
   [metabase.util :as u]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)


;;; ------------------- Dashboard template matching  -------------------

(deftest ^:parallel dashboard-template-matching-test
  (is (= [:entity/UserTable :entity/GenericTable :entity/*]
         (->> (mt/id :users)
              (t2/select-one Table :id)
              (#'magic/->root)
              (#'magic/matching-dashboard-templates (dashboard-templates/get-dashboard-templates ["table"]))
              (map (comp first :applies_to)))))

  (testing "Test fallback to GenericTable"
    (is (= [:entity/GenericTable :entity/*]
           (->> (-> (t2/select-one Table :id (mt/id :users))
                    (assoc :entity_type nil)
                    (#'magic/->root))
                (#'magic/matching-dashboard-templates (dashboard-templates/get-dashboard-templates ["table"]))
                (map (comp first :applies_to)))))))

;;; ------------------- `->root source` -------------------

(deftest source-root-table-test
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Table"
    (mt/dataset test-data
      (testing "The source of a table is the table itself"
        (let [table (t2/select-one :model/Table :id (mt/id :orders))
              {:keys [entity source]} (#'magic/->root table)]
          (is (= source table))
          (is (= entity table))
          (is (= source entity)))))))

(deftest source-root-field-test
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Field"
    (mt/dataset test-data
      (testing "The source of a field is the originating table of the field"
        (let [table (t2/select-one :model/Table :id (mt/id :orders))
              field (t2/select-one :model/Field :id (mt/id :orders :discount))
              {:keys [entity source]} (#'magic/->root field)]
          (is (= source table))
          (is (= entity field)))))))

(deftest source-root-card-test
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Card"
    (mt/dataset test-data
      (testing "Card sourcing has four branches..."
        (testing "A model's (dataset = true) source is itself with the :entity_type :entity/GenericTable assoced in"
          (mt/with-temp
            [Card card {:table_id      (mt/id :orders)
                        :dataset_query {:query    {:source-table (mt/id :orders)}
                                        :type     :query
                                        :database (mt/id)}
                        :type          :model}]
            (let [{:keys [entity source]} (#'magic/->root card)]
              (is (=? {:type :model}
                      card))
              (is (= entity card))
              (is (= source (assoc card :entity_type :entity/GenericTable))))))))))

(deftest source-root-card-test-2
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Card"
    (mt/dataset test-data
      (testing "Card sourcing has four branches..."
        (testing "A nested query's source is itself with the :entity_type :entity/GenericTable assoced in"
          (mt/with-temp
            [Card {source-query-id :id
                   :as             nested-query} {:table_id      (mt/id :orders)
                                                  :dataset_query {:query    {:source-table (mt/id :orders)}
                                                                  :type     :query
                                                                  :database (mt/id)}
                                                  :type          :model}
             Card card {:table_id      (mt/id :orders)
                        :dataset_query {:query    {:limit        10
                                                   :source-table (format "card__%s" source-query-id)}
                                        :type     :query
                                        :database (mt/id)}}]
            (let [{:keys [entity source]} (#'magic/->root card)]
              (is (=? {:type :question}
                      card))
              (is (true? (#'magic/nested-query? card)))
              (is (= entity card))
              (is (= source (assoc nested-query :entity_type :entity/GenericTable))))))))))

(deftest source-root-card-test-3
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Card"
    (mt/dataset test-data
      (testing "Card sourcing has four branches..."
        (testing "A native query's source is itself with the :entity_type :entity/GenericTable assoced in"
          (let [query (mt/native-query {:query "select * from orders"})]
            (t2.with-temp/with-temp [Card card (mt/card-with-source-metadata-for-query query)]
              (let [{:keys [entity source]} (#'magic/->root card)]
                (is (=? {:type :question}
                        card))
                (is (true? (#'magic/native-query? card)))
                (is (= entity card))
                (is (= source (assoc card :entity_type :entity/GenericTable)))))))))))

(deftest source-root-card-test-4
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Card"
    (mt/dataset test-data
      (testing "Card sourcing has four branches..."
        (testing "A plain query card (not native, nested, or a model) is sourced by its base table."
          (mt/with-temp
            [Card {table-id :table_id
                   :as      card} {:table_id      (mt/id :orders)
                                   :dataset_query {:query    {:filter       [:> [:field (mt/id :orders :quantity) nil] 10]
                                                              :source-table (mt/id :orders)}
                                                   :type     :query
                                                   :database (mt/id)}}]
            (let [{:keys [entity source]} (#'magic/->root card)]
              (is (=? {:type :question}
                      card))
              (is (false? (#'magic/nested-query? card)))
              (is (false? (#'magic/native-query? card)))
              (is (= entity card))
              (is (= source (t2/select-one :model/Table :id table-id))))))))))

(deftest source-root-query-test
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Query"
    (mt/dataset test-data
      (testing "The source of a query is the underlying datasource of the query"
        (let [query (mi/instance
                      Query
                      {:database-id   (mt/id)
                       :table-id      (mt/id :orders)
                       :dataset_query {:database (mt/id)
                                       :type     :query
                                       :query    {:source-table (mt/id :orders)
                                                  :aggregation  [[:count]]}}})
              {:keys [entity source]} (#'magic/->root query)]
          (is (= entity query))
          (is (= source (t2/select-one :model/Table (mt/id :orders)))))))))

(deftest source-root-metric-test
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/LegacyMetric"
    (testing "The source of a metric is its underlying table."
      (t2.with-temp/with-temp [Metric metric {:table_id   (mt/id :venues)
                                              :definition {:aggregation [[:count]]}}]
        (let [{:keys [entity source]} (#'magic/->root metric)]
          (is (= entity metric))
          (is (= source (t2/select-one :model/Table (mt/id :venues)))))))))

(deftest source-root-segment-test
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Segment"
    (testing "The source of a segment is its underlying table."
      (mt/with-temp [Segment segment {:table_id   (mt/id :venues)
                                      :definition {:filter [:> [:field (mt/id :venues :price) nil] 10]}}]
        (let [{:keys [entity source]} (#'magic/->root segment)]
          (is (= entity segment))
          (is (= source (t2/select-one :model/Table (mt/id :venues)))))))))

;;; ------------------- `automagic-analysis` -------------------

(defn- test-automagic-analysis
  ([entity card-count] (test-automagic-analysis entity nil card-count))
  ([entity cell-query card-count]
   ;; We want to both generate as many cards as we can to catch all aberrations, but also make sure
   ;; that size limiting works.
   (testing (u/pprint-to-str (list 'automagic-analysis entity {:cell-query cell-query, :show :all}))
     (automagic-dashboards.test/test-dashboard-is-valid (magic/automagic-analysis entity {:cell-query cell-query, :show :all}) card-count))
   (when (or (and (not (mi/instance-of? Query entity))
                  (not (mi/instance-of? Card entity)))
             (#'magic/table-like? entity))
     (testing (u/pprint-to-str (list 'automagic-analysis entity {:cell-query cell-query, :show 1}))
       ;; 1 for the actual card returned + 1 for the visual display card = 2
       (automagic-dashboards.test/test-dashboard-is-valid (magic/automagic-analysis entity {:cell-query cell-query, :show 1}) 2)))))

;; These test names were named by staring at them for a while, so they may be misleading

(deftest automagic-analysis-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (doseq [[table cardinality] (map vector
                                       (t2/select Table :db_id (mt/id) {:order-by [[:name :asc]]})
                                       [2 8 11 11 15 17 5 7])]
        (test-automagic-analysis table cardinality)))

    (automagic-dashboards.test/with-dashboard-cleanup
      (is (= 1
             (->> (magic/automagic-analysis (t2/select-one Table :id (mt/id :venues)) {:show 1})
                  :dashcards
                  (filter :card)
                  count))))))

(deftest weird-characters-in-names-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (-> (t2/select-one Table :id (mt/id :venues))
          (assoc :display_name "%Venues")
          (test-automagic-analysis 7)))))

;; Cardinality of cards genned from fields is much more labile than anything else
;; Not just with respect to drivers, but all sorts of other stuff that makes it chaotic
(deftest mass-field-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (doseq [field (t2/select Field
                               :table_id [:in (t2/select-fn-set :id Table :db_id (mt/id))]
                               :visibility_type "normal"
                               {:order-by [[:id :asc]]})]
        (is (pos? (count (:dashcards (magic/automagic-analysis field {})))))))))

(deftest metric-test
  (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)
                                          :definition {:aggregation [[:count]]}}]
    (mt/with-test-user :rasta
      (automagic-dashboards.test/with-dashboard-cleanup
        (test-automagic-analysis metric 8)))))

(deftest parameter-mapping-test
  (mt/dataset test-data
    (testing "mbql queries have parameter mappings with field ids"
        (let [table (t2/select-one Table :id (mt/id :products))
              dashboard (magic/automagic-analysis table {})
              expected-targets (mt/$ids #{[:dimension $products.category]
                                          [:dimension $products.created_at]})
              actual-targets (into #{}
                                   (comp (mapcat :parameter_mappings)
                                         (map :target))
                                   (:dashcards dashboard))]
          (is (= expected-targets actual-targets))))
    (testing "native queries have parameter mappings with field ids"
      (let [query (mt/native-query {:query "select * from products"})]
        (t2.with-temp/with-temp [Card card (mt/card-with-source-metadata-for-query
                                            query)]
          (let [dashboard (magic/automagic-analysis card {})
                ;; i'm not sure why category isn't picked here
                expected-targets #{[:dimension
                                    [:field "CREATED_AT"
                                     {:base-type :type/DateTimeWithLocalTZ}]]}
                actual-targets (into #{}
                                     (comp (mapcat :parameter_mappings)
                                           (map :target))
                                     (:dashcards dashboard))]
            (is (= expected-targets actual-targets))))))))

(deftest complicated-card-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp
      [Collection {collection-id :id} {}
       Card       {card-id :id}       {:table_id      (mt/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query    {:filter [:> [:field (mt/id :venues :price) nil] 10]
                                                                  :source-table (mt/id :venues)}
                                                       :type     :query
                                                       :database (mt/id)}}]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (test-automagic-analysis (t2/select-one Card :id card-id) 7))))))

(deftest query-breakout-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp
      [Collection {collection-id :id} {}
       Card       {card-id :id}       {:table_id      (mt/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query {:aggregation [[:count]]
                                                               :breakout [[:field (mt/id :venues :category_id) nil]]
                                                               :source-table (mt/id :venues)}
                                                       :type :query
                                                       :database (mt/id)}}]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (test-automagic-analysis (t2/select-one Card :id card-id) 17))))))

(deftest native-query-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp
      [Collection {collection-id :id} {}
       Card       {card-id :id}       {:table_id      nil
                                       :collection_id collection-id
                                       :dataset_query {:native {:query "select * from users"}
                                                       :type :native
                                                       :database (mt/id)}}]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (test-automagic-analysis (t2/select-one Card :id card-id) 2))))))

(defn- result-metadata-for-query [query]
  (first
   (a/alts!!
    [(qp.async/result-metadata-for-query-async query)
     (a/timeout 1000)])))

(deftest explicit-filter-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [source-query {:query    {:source-table (mt/id :venues)}
                        :type     :query
                        :database (mt/id)}]
      (mt/with-temp
        [Collection {collection-id :id} {}
         Card       {source-id :id}     {:table_id        (mt/id :venues)
                                         :collection_id   collection-id
                                         :dataset_query   source-query
                                         :result_metadata (mt/with-test-user :rasta (result-metadata-for-query source-query))}
         Card       {card-id :id}     {:table_id      (mt/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query    {:filter       [:> [:field "PRICE" {:base-type "type/Number"}] 10]
                                                                  :source-table (str "card__" source-id)}
                                                       :type     :query
                                                       :database lib.schema.id/saved-questions-virtual-database-id}}]
        (mt/with-test-user :rasta
          (automagic-dashboards.test/with-dashboard-cleanup
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
            (test-automagic-analysis (t2/select-one Card :id card-id) 7)))))))

(deftest native-query-with-cards-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [source-query {:native   {:query "select * from venues"}
                        :type     :native
                        :database (mt/id)}]
      (mt/with-temp [Collection {collection-id :id} {}
                     Card       {source-id :id}     {:table_id        nil
                                                     :collection_id   collection-id
                                                     :dataset_query   source-query
                                                     :result_metadata (mt/with-test-user :rasta (result-metadata-for-query source-query))}
                     Card       {card-id :id}       {:table_id      nil
                                                     :collection_id collection-id
                                                     :dataset_query {:query    {:filter       [:> [:field "PRICE" {:base-type "type/Number"}] 10]
                                                                                :source-table (str "card__" source-id)}
                                                                     :type     :query
                                                                     :database lib.schema.id/saved-questions-virtual-database-id}}]
        (mt/with-test-user :rasta
          (automagic-dashboards.test/with-dashboard-cleanup
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
            (test-automagic-analysis (t2/select-one Card :id card-id) 8)))))))

(deftest ensure-field-dimension-bindings-test
  (testing "A very simple card with two plain fields should return the singe assigned dimension for each field."
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :query    (mt/$ids
                                        {:source-table $$products
                                         :fields       [$products.category
                                                        $products.price]})
                            :type     :query}]
          (mt/with-temp
            [Collection {collection-id :id} {}
             Card       card                {:table_id        (mt/id :products)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user
                                                                :rasta
                                                                (result-metadata-for-query
                                                                 source-query))
                                             :type            :model}]
            (let [root               (#'magic/->root card)
                  {:keys [dimensions] :as _template} (dashboard-templates/get-dashboard-template ["table" "GenericTable"])
                  base-context       (#'magic/make-base-context root)
                  candidate-bindings (#'interesting/candidate-bindings base-context dimensions)
                  bindset            #(->> % candidate-bindings (map ffirst) set)]
              (is (= #{"GenericCategoryMedium"} (bindset (mt/id :products :category))))
              (is (= #{"GenericNumber"} (bindset (mt/id :products :price)))))))))))

(deftest ensure-field-dimension-bindings-test-2
  (testing "A model that spans 3 tables should use all fields, provide correct candidate bindings,
            and choose the best-match candidate."
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (mt/$ids
                                        {:source-table $$orders
                                         :joins        [{:fields       [$people.state
                                                                        $people.longitude
                                                                        $people.latitude]
                                                         :source-table $$people
                                                         :condition    [:= $orders.user_id $people.id]}
                                                        {:fields       [$products.price]
                                                         :source-table $$products
                                                         :condition    [:= $orders.product_id $products.id]}]
                                         :fields       [$orders.created_at]})}]
          (mt/with-temp [Collection {collection-id :id} {}
                         Card       card                {:table_id        (mt/id :products)
                                                         :collection_id   collection-id
                                                         :dataset_query   source-query
                                                         :result_metadata (mt/with-test-user
                                                                            :rasta
                                                                            (result-metadata-for-query
                                                                             source-query))
                                                         :type            :model}]
            (let [root               (#'magic/->root card)
                  {:keys [dimensions] :as _template} (dashboard-templates/get-dashboard-template ["table" "GenericTable"])
                  base-context       (#'magic/make-base-context root)
                  candidate-bindings (#'interesting/candidate-bindings base-context dimensions)
                  bindset            #(->> % candidate-bindings (map ffirst) set)
                  boundval            #(->> % candidate-bindings (#'interesting/most-specific-matched-dimension) ffirst)]
              (is (= #{"State"} (bindset (mt/id :people :state))))
              (is (= "State" (boundval (mt/id :people :state))))
              (is (= #{"GenericNumber" "Long"} (bindset (mt/id :people :longitude))))
              (is (= "Long" (boundval (mt/id :people :longitude))))
              (is (= #{"GenericNumber" "Lat"} (bindset (mt/id :people :latitude))))
              (is (= "Lat" (boundval (mt/id :people :latitude))))
              (is (= #{"GenericNumber"} (bindset (mt/id :products :price))))
              (is (= "GenericNumber" (boundval (mt/id :products :price))))
              (is (= #{"CreateTimestamp" "Timestamp"} (bindset (mt/id :orders :created_at))))
              (is (= "CreateTimestamp" (boundval (mt/id :orders :created_at)))))))))))

(deftest field-candidate-matching-test
  (testing "Simple dimensions with only a tablespec can be matched directly against fields."
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        ;; This is a fabricated context with simple fields.
        ;; These can be matched against dimension definitions with simple 1-element vector table specs
        ;; Example: {:field_type [:type/CreationTimestamp]}
        ;; More context is needed (see below test) for two-element dimension definitions
        (let [context    {:source {:fields (t2/select Field :id [:in [(mt/id :people :created_at)
                                                                      (mt/id :people :latitude)
                                                                      (mt/id :orders :created_at)]])}}
              ;; Lifted from the GenericTable dimensions definition
              dimensions {"CreateTimestamp"       {:field_type [:type/CreationTimestamp]}
                          "Lat"                   {:field_type [:entity/GenericTable :type/Latitude]}
                          "Timestamp"             {:field_type [:type/DateTime]}}]
          (is (= #{(mt/id :people :created_at)
                   (mt/id :orders :created_at)}
                 (set (map :id (#'interesting/matching-fields context (dimensions "Timestamp"))))))
          (is (= #{(mt/id :people :created_at)
                   (mt/id :orders :created_at)}
                 (set (map :id (#'interesting/matching-fields context (dimensions "CreateTimestamp"))))))
          ;; This does not match any of our fabricated context fields (even (mt/id :people :latitude)) because the
          ;; context is fabricated and needs additional data (:table). See above test for a working example with a match
          (is (= #{} (set (map :id (#'interesting/matching-fields context (dimensions "Lat"))))))))))
  (testing "Verify dimension selection works for dimension definitions with 2-element [tablespec fieldspec] definitions."
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        ;; Unlike the above test, we do need to provide a full context to match these fields against the dimension definitions.
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (mt/$ids
                                        {:source-table $$orders
                                         :joins        [{:fields       [&u.people.state
                                                                        &u.people.source
                                                                        &u.people.longitude
                                                                        &u.people.latitude]
                                                         :source-table $$people
                                                         :condition    [:= $orders.user_id &u.people.id]}
                                                        {:fields       [&p.products.category
                                                                        &p.products.price]
                                                         :source-table $$products
                                                         :condition    [:= $orders.product_id &p.products.id]}]
                                         :fields       [$orders.created_at]})}]
          (mt/with-temp
            [Collection {collection-id :id} {}
             Card       card                {:table_id        (mt/id :products)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user
                                                                :rasta
                                                                (result-metadata-for-query
                                                                 source-query))
                                             :type            :model}]
            (let [base-context (#'magic/make-base-context (#'magic/->root card))
                  dimensions   {"GenericCategoryMedium" {:field_type [:entity/GenericTable :type/Category] :max_cardinality 10}
                                "GenericNumber"         {:field_type [:entity/GenericTable :type/Number]}
                                "Lat"                   {:field_type [:entity/GenericTable :type/Latitude]}
                                "Long"                  {:field_type [:entity/GenericTable :type/Longitude]}
                                "State"                 {:field_type [:entity/GenericTable :type/State]}}]
              (is (= #{(mt/id :people :state)}
                     (->> (#'interesting/matching-fields base-context (dimensions "State")) (map :id) set)))
              (is (= #{(mt/id :products :category)
                       (mt/id :people :source)}
                     (->> (#'interesting/matching-fields base-context (dimensions "GenericCategoryMedium")) (map :id) set)))
              (is (= #{(mt/id :products :price)
                       (mt/id :people :longitude)
                       (mt/id :people :latitude)}
                     (->> (#'interesting/matching-fields base-context (dimensions "GenericNumber")) (map :id) set)))
              (is (= #{(mt/id :people :latitude)}
                     (->> (#'interesting/matching-fields base-context (dimensions "Lat")) (map :id) set)))
              (is (= #{(mt/id :people :longitude)}
                     (->> (#'interesting/matching-fields base-context (dimensions "Long")) (map :id) set))))))))))

(defn- ensure-card-sourcing
  "Ensure that destination data is only derived from source data.
  This is a check against a card being generated that presents results unavailable to it with respect to its source data."
  [{source-card-id     :id
    source-database-id :database_id
    source-table-id    :table_id
    source-meta        :result_metadata
    :as                _source-card}
   {magic-card-table-id    :table_id
    magic-card-database-id :database_id
    magic-card-query       :dataset_query
    :as                    _magic-card}]
  (let [valid-source-ids (set (map (fn [{:keys [name id]}] (or id name)) source-meta))
        {query-db-id  :database
         query-actual :query} magic-card-query
        {source-table :source-table
         breakout     :breakout} query-actual]
    (is (= source-database-id magic-card-database-id))
    (is (= source-database-id query-db-id))
    (is (= source-table-id magic-card-table-id))
    (is (= (format "card__%s" source-card-id) source-table))
    (is (= true (every? (fn [[_ id]] (valid-source-ids id)) breakout)))))

(defn- ensure-dashboard-sourcing [source-card dashboard]
  (doseq [magic-card (->> dashboard
                          :dashcards
                          (filter :card)
                          (map :card))]
    (ensure-card-sourcing source-card magic-card)))

(defn- ensure-single-table-sourced
  "Check that the related table from the x-ray is the table we are sourcing from.
  This is applicable for a query/card/etc/ that is sourced directly from one table only."
  [table-id dashboard]
  (is (=
       (format "/auto/dashboard/table/%s" table-id)
       (-> dashboard :related :zoom-out first :url))))

(deftest basic-root-model-test
  ;; These test scenarios consist of a single model sourced from one table.
  ;; Key elements being tested:
  ;; - The dashboard should only present data visible to the model
  ;; (don't show non-selected fields from within the model or its parent)
  ;; - The dashboard should reference its source as a :related field
  (testing "Simple model with a price dimension"
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :query    (mt/$ids
                                        {:source-table $$products
                                         :fields       [$products.category
                                                        $products.price]})
                            :type     :query}]
          (mt/with-temp
            [Collection {collection-id :id} {}
             Card       card                {:table_id        (mt/id :products)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user
                                                                :rasta
                                                                (result-metadata-for-query
                                                                 source-query))
                                             :type            :model}]
            (let [dashboard (mt/with-test-user :rasta (magic/automagic-analysis card nil))
                  binned-field-id (mt/id :products :price)]
              (ensure-single-table-sourced (mt/id :products) dashboard)
              ;; Count of records
              ;; Distributions:
              ;; - Binned price
              ;; - Binned by category
              (is (= 3 (->> dashboard :dashcards (filter :card) count)))
              (ensure-dashboard-sourcing card dashboard)
              ;; This ensures we get a card that does binning on price
              (is (= binned-field-id
                     (first
                      (for [card (:dashcards dashboard)
                            :let [fields (get-in card [:card :dataset_query :query :breakout])]
                            [_ field-id m] fields
                            :when (:binning m)]
                        field-id)))))))))))

(deftest basic-root-model-test-2
  (testing "Simple model with a temporal dimension detected"
    ;; Same as above, but the code should detect the time dimension of the model and present
    ;; cards with a time axis.
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [temporal-field-id (mt/id :products :created_at)
              source-query      {:database (mt/id)
                                 :query    (mt/$ids
                                             {:source-table $$products
                                              :fields       [$products.category
                                                             $products.price
                                                             [:field temporal-field-id nil]]}),
                                 :type     :query}]
          (mt/with-temp
            [Collection {collection-id :id} {}
             Card       card                {:table_id        (mt/id :products)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user
                                                                :rasta
                                                                (result-metadata-for-query
                                                                 source-query))
                                             :type            :model}]
            (let [dashboard (mt/with-test-user :rasta (magic/automagic-analysis card nil))
                  temporal-field-ids (for [card (:dashcards dashboard)
                                           :let [fields (get-in card [:card :dataset_query :query :breakout])]
                                           [_ field-id m] fields
                                           :when (:temporal-unit m)]
                                       field-id)]
              (ensure-single-table-sourced (mt/id :products) dashboard)
              (ensure-dashboard-sourcing card dashboard)
              ;; We want to produce at least one temporal axis card
              (is (pos? (count temporal-field-ids)))
              ;; We only have one temporal field, so ensure that's what's used for the temporal cards
              (is (every? #{temporal-field-id} temporal-field-ids)))))))))

(deftest basic-root-model-test-3
  (testing "A simple model with longitude and latitude dimensions should generate a card with a map."
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :query    (mt/$ids
                                        {:source-table $$people
                                         :fields       [$people.longitude
                                                        $people.latitude]}),
                            :type     :query}]
          (mt/with-temp
            [Collection {collection-id :id} {}
             Card       card                {:table_id        (mt/id :people)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user
                                                                :rasta
                                                                (result-metadata-for-query
                                                                 source-query))
                                             :type            :model}]
            (let [{:keys [dashcards] :as dashboard} (mt/with-test-user :rasta (magic/automagic-analysis card nil))]
              (ensure-single-table-sourced (mt/id :people) dashboard)
              (ensure-dashboard-sourcing card dashboard)
              ;; We should generate two cards - locations and total values
              (is (= #{(format "%s by coordinates" (:name card))
                       (format "Total %s" (:name card))}
                     (set
                      (for [{:keys [card]} dashcards
                            :let [{:keys [name]} card]
                            :when name]
                        name)))))))))))

(deftest model-title-does-not-leak-abstraction-test
  (testing "The title of a model or question card should not be X model or X question, but just X."
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :query    (mt/$ids
                                        {:source-table $$products
                                         :fields       [$products.category
                                                        $products.price]})
                            :type     :query}]
          (mt/with-temp
            [Collection {collection-id :id} {}
             Card       model-card          {:table_id        (mt/id :products)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user
                                                                :rasta
                                                                (result-metadata-for-query
                                                                 source-query))
                                             :type            :model}
             Card       question-card       {:table_id        (mt/id :products)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user
                                                                :rasta
                                                                (result-metadata-for-query
                                                                 source-query))
                                             :type            :question}]
            (let [{model-dashboard-name :name} (mt/with-test-user :rasta (magic/automagic-analysis model-card nil))
                  {question-dashboard-name :name} (mt/with-test-user :rasta (magic/automagic-analysis question-card nil))]
              (is (false? (str/ends-with? model-dashboard-name "question")))
              (is (false? (str/ends-with? model-dashboard-name "model")))
              (is (true? (str/ends-with? model-dashboard-name (format "\"%s\"" (:name model-card)))))
              (is (false? (str/ends-with? question-dashboard-name "question")))
              (is (false? (str/ends-with? question-dashboard-name "model")))
              (is (true? (str/ends-with? question-dashboard-name (format "\"%s\"" (:name question-card))))))))))))

(deftest test-table-title-test
  (testing "Given the current automagic_dashboards/field/GenericTable.yaml template, produce the expected dashboard title"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [Table {table-name :name :as table} {:name "FOO"}]
        (is (= (format "A look at %s" (u/capitalize-en table-name))
               (:name (mt/with-test-user :rasta (magic/automagic-analysis table nil)))))))))

(deftest test-field-title-test
  (testing "Given the current automagic_dashboards/field/GenericField.yaml template, produce the expected dashboard title"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [Field {field-name :name :as field} {:name "TOTAL"}]
        (is (= (format "A look at the %s fields" (u/capitalize-en field-name))
               (:name (mt/with-test-user :rasta (magic/automagic-analysis field nil)))))))))

(deftest test-metric-title-test
  (testing "Given the current automagic_dashboards/metric/GenericMetric.yaml template, produce the expected dashboard title"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [Metric {metric-name :name :as metric} {:table_id   (mt/id :venues)
                                                            :definition {:aggregation [[:count]]}}]
        (is (= (format "A look at the %s metrics" metric-name)
               (:name (mt/with-test-user :rasta (magic/automagic-analysis metric nil)))))))))

(deftest test-segment-title-test
  (testing "Given the current automagic_dashboards/metric/GenericTable.yaml template (This is the default template for segments), produce the expected dashboard title"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [Segment {table-id    :table_id
                              segment-name :name
                              :as          segment} {:table_id   (mt/id :venues)
                                                     :definition {:filter [:> [:field (mt/id :venues :price) nil] 10]}}]
        (is (= (format "A look at %s in the %s segment"
                       (u/capitalize-en (t2/select-one-fn :name Table :id table-id))
                       segment-name)
               (:name (mt/with-test-user :rasta (magic/automagic-analysis segment nil)))))))))

(deftest model-with-joins-test
  ;; This model does a join of 3 tables and aliases columns.
  ;; The created dashboard should use all the data with the correct labels.
  (mt/dataset test-data
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [source-query {:database (mt/id)
                          :type     :query
                          :query    {:source-table (mt/id :orders)
                                     :joins        [{:fields       [[:field (mt/id :people :state) {:join-alias "People - User"}]]
                                                     :source-table (mt/id :people)
                                                     :condition    [:=
                                                                    [:field (mt/id :orders :user_id) nil]
                                                                    [:field (mt/id :people :id) {:join-alias "People - User"}]]
                                                     :alias        "People - User"}
                                                    {:fields       [[:field (mt/id :products :price) {:join-alias "Products"}]]
                                                     :source-table (mt/id :products)
                                                     :condition    [:=
                                                                    [:field (mt/id :orders :product_id) nil]
                                                                    [:field (mt/id :products :id) {:join-alias "Products"}]]
                                                     :alias        "Products"}]
                                     :fields       [[:field (mt/id :orders :created_at) nil]]}}]
        (mt/with-temp [Collection {collection-id :id} {}
                       Card card {:table_id        (mt/id :orders)
                                  :collection_id   collection-id
                                  :dataset_query   source-query
                                  :result_metadata (->> (mt/with-test-user :rasta (result-metadata-for-query source-query))
                                                        (map (fn [m] (update m :display_name {"Created At"            "Created At"
                                                                                              "People - User → State" "State Where Placed"
                                                                                              "Products → Price"      "Ordered Item Price"}))))
                                  :type            :model}]
          (let [{:keys [dashcards] :as dashboard} (mt/with-test-user :rasta (magic/automagic-analysis card nil))
                card-names (set (filter identity (map (comp :name :card) dashcards)))
                expected-oip-labels #{"Ordered Item Price over time"
                                      (format "%s by Ordered Item Price" (:name card))}
                expected-time-labels (set
                                      (map
                                       #(format "%s when %s were added" % (:name card))
                                       ["Quarters" "Months" "Days" "Hours" "Weekdays"]))
                expected-geo-labels #{(format "%s per state" (:name card))}]
            (is (= 11 (->> dashboard :dashcards (filter :card) count)))
            ;; Note that this is only true because we currently only pick up the table referenced by the :table_id field
            ;; in the Card and don't use the :result_metadata :(
            (ensure-dashboard-sourcing card dashboard)
            ;; Ensure that the renamed Products → Price field shows the new name when used
            (is (= expected-oip-labels
                   (set/intersection card-names expected-oip-labels)))
            ;; Ensure that the "created at" column was picked up, which will trigger plots over time
            (is (= expected-time-labels
                   (set/intersection card-names expected-time-labels)))
            ;; Ensure that the state field was picked up as a geographic dimension
            (is (= expected-geo-labels
                   (set/intersection card-names expected-geo-labels)))))))))

(deftest card-breakout-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp
      [Collection {collection-id :id} {}
       Card       {card-id :id}       {:table_id      (mt/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query    {:aggregation  [[:count]]
                                                                  :breakout     [[:field (mt/id :venues :category_id) nil]]
                                                                  :source-table (mt/id :venues)}
                                                       :type     :query
                                                       :database (mt/id)}}]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (test-automagic-analysis (t2/select-one Card :id card-id) 17))))))

(deftest figure-out-table-id-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [Collection {collection-id :id} {}
                   Card {card-id :id} {:table_id      nil
                                       :collection_id collection-id
                                       :dataset_query {:native   {:query "select * from users"}
                                                       :type     :native
                                                       :database (mt/id)}}]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (test-automagic-analysis (t2/select-one Card :id card-id) 2))))))

(deftest card-cell-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [Collection {collection-id :id} {}
                   Card {card-id :id} {:table_id      (mt/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query    {:filter       [:> [:field (mt/id :venues :price) nil] 10]
                                                                  :source-table (mt/id :venues)}
                                                       :type     :query
                                                       :database (mt/id)}}]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> (t2/select-one Card :id card-id)
              (test-automagic-analysis [:= [:field (mt/id :venues :category_id) nil] 2] 7)))))))

(deftest cell-query-is-applied-test
  (testing "Ensure that the cell query is applied to every card in the resulting dashboard"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [Collection {collection-id :id} {}
                     Card {card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter       [:> [:field (mt/id :venues :price) nil] 10]
                                                                    :source-table (mt/id :venues)}
                                                         :type     :query
                                                         :database (mt/id)}}]
        (let [entity     (t2/select-one Card :id card-id)
              cell-query [:= [:field (mt/id :venues :category_id) nil] 2]]
          (mt/with-test-user :rasta
            (automagic-dashboards.test/with-dashboard-cleanup
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id) =
              (let [all-dashcard-filters (->> (magic/automagic-analysis entity {:cell-query cell-query :show :all})
                                              :dashcards
                                              (keep (comp :filter :query :dataset_query :card)))
                    filter-contains-cell-query?                 #(= cell-query (some #{cell-query} %))]
                (is (pos? (count all-dashcard-filters)))
                (is (every? filter-contains-cell-query? all-dashcard-filters))))))))))

(deftest complicated-card-cell-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [Collection {collection-id :id} {}
                   Card {card-id :id} {:table_id      (mt/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query    {:filter       [:> [:field (mt/id :venues :price) nil] 10]
                                                                  :source-table (mt/id :venues)}
                                                       :type     :query
                                                       :database (mt/id)}}]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> (t2/select-one Card :id card-id)
              (test-automagic-analysis [:= [:field (mt/id :venues :category_id) nil] 2] 7)))))))


(deftest adhoc-filter-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field (mt/id :venues :price) nil] 10]
                                          :source-table (mt/id :venues)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q 7)))))

(deftest adhoc-count-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:field (mt/id :venues :category_id) nil]]
                                          :source-table (mt/id :venues)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q 17)))))

(deftest adhoc-fk-breakout-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:field (mt/id :venues :category_id) {:source-field (mt/id :checkins)}]]
                                          :source-table (mt/id :checkins)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q 17)))))

(deftest adhoc-filter-cell-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field (mt/id :venues :price) nil] 10]
                                          :source-table (mt/id :venues)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q [:= [:field (mt/id :venues :category_id) nil] 2] 7)))))

(deftest join-splicing-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [join-vec    [{:source-table (mt/id :categories)
                          :condition    [:= [:field (mt/id :categories :id) nil] 1]
                          :strategy     :left-join
                          :alias        "Dealios"}]
            q           (query/adhoc-query {:query {:source-table (mt/id :venues)
                                                    :joins join-vec
                                                    :aggregation [[:sum [:field (mt/id :categories :id) {:join-alias "Dealios"}]]]}
                                            :type :query
                                            :database (mt/id)})
            res         (magic/automagic-analysis q {})
            cards       (vec (:dashcards res))
            join-member (get-in cards [2 :card :dataset_query :query :joins])]
        (is (= join-vec join-member))))))


;;; ------------------- /candidates -------------------

(deftest candidates-test
  (testing "/candidates"
    (testing "should work with the normal test-data DB"
      (mt/with-test-user :rasta
        (is (malli= [:cat
                     [:map
                      [:tables [:sequential {:min 8, :max 8} :any]]]
                     [:* :any]]
                    (magic/candidate-tables (mt/db))))))

    (testing "should work with unanalyzed tables"
      (mt/with-test-user :rasta
        (mt/with-temp [Database {db-id :id} {}
                       Table    {table-id :id} {:db_id db-id}
                       Field    _ {:table_id table-id}
                       Field    _ {:table_id table-id}]
          (automagic-dashboards.test/with-dashboard-cleanup
            (is (=? [{:tables [{:table {:id table-id}}]}]
                    (magic/candidate-tables (t2/select-one Database :id db-id))))))))))

(deftest call-count-test
  (mt/with-temp [Database {db-id :id} {}
                 Table    {table-id :id} {:db_id db-id}
                 Field    _ {:table_id table-id}
                 Field    _ {:table_id table-id}
                 Metric   _ {:table_id table-id}]
    (mt/with-test-user :rasta
      ;; make sure the current user permissions set is already fetched so it's not included in the DB call count below
      @api/*current-user-permissions-set*
      (automagic-dashboards.test/with-dashboard-cleanup
        (let [database (t2/select-one Database :id db-id)]
          (t2/with-call-count [call-count]
            (magic/candidate-tables database)
            (is (= 5
                   (call-count)))))))))

(deftest empty-table-test
  (testing "candidate-tables should work with an empty Table (no Fields)"
    (t2.with-temp/with-temp [Database db {}
                             Table    _  {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (is (= []
               (magic/candidate-tables db)))))))

(deftest enhance-table-stats-test
  (mt/with-temp [Database {db-id :id} {}
                 Table    {table-id :id} {:db_id db-id}
                 Field    _ {:table_id table-id :semantic_type :type/PK}
                 Field    _ {:table_id table-id}]
    (mt/with-test-user :rasta
      (automagic-dashboards.test/with-dashboard-cleanup
        (is (= {:list-like?  true
                :link-table? false
                :num-fields 2}
               (-> (#'magic/enhance-table-stats [(t2/select-one Table :id table-id)])
                   first
                   :stats)))))))

(deftest enhance-table-stats-fk-test
  (t2.with-temp/with-temp [Database {db-id :id}    {}
                           Table    {table-id :id} {:db_id db-id}
                           Field    _              {:table_id table-id :semantic_type :type/PK}
                           Field    _              {:table_id table-id :semantic_type :type/FK}
                           Field    _              {:table_id table-id :semantic_type :type/FK}]
    (mt/with-test-user :rasta
      (automagic-dashboards.test/with-dashboard-cleanup
        (is (= {:list-like?  false
                :link-table? true
                :num-fields 3}
               (-> (#'magic/enhance-table-stats [(t2/select-one Table :id table-id)])
                   first
                   :stats)))))))


;;; ------------------- Definition overloading -------------------

(deftest ^:parallel most-specific-definition-test
  (testing "Identity"
    (is (= :d1
           (-> [{:d1 {:field_type [:type/Category] :score 100}}]
               (#'interesting/most-specific-matched-dimension)
               first
               key)))))

(deftest ^:parallel ancestors-definition-test
  (testing "Base case: more ancestors"
    (is (= :d2
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}]
               (#'interesting/most-specific-matched-dimension)
               first
               key)))))

(deftest ^:parallel definition-tiebreak-test
  (testing "Break ties based on the number of additional filters"
    (is (= :d3
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}
                {:d3 {:field_type [:type/State]
                      :named      "foo"
                      :score      100}}]
               (#'interesting/most-specific-matched-dimension)
               first
               key)))))

(deftest ^:parallel definition-tiebreak-score-test
  (testing "Break ties on score"
    (is (= :d2
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}
                {:d3 {:field_type [:type/State] :score 90}}]
               (#'interesting/most-specific-matched-dimension)
               first
               key)))))

(deftest ^:parallel definition-tiebreak-precedence-test
  (testing "Number of additional filters has precedence over score"
    (is (= :d3
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}
                {:d3 {:field_type [:type/State]
                      :named      "foo"
                      :score      0}}]
               (#'interesting/most-specific-matched-dimension)
               first
               key)))))


;;; ------------------- Datetime resolution inference -------------------

(deftest ^:parallel optimal-datetime-resolution-test
  (doseq [[m expected] [[{:earliest "2015"
                          :latest   "2017"}
                         :month]
                        [{:earliest "2017-01-01"
                          :latest   "2017-03-04"}
                         :day]
                        [{:earliest "2005"
                          :latest   "2017"}
                         :year]
                        [{:earliest "2017-01-01"
                          :latest   "2017-01-02"}
                         :hour]
                        [{:earliest "2017-01-01T00:00:00"
                          :latest   "2017-01-01T00:02:00"}
                         :minute]]
          :let         [fingerprint {:type {:type/DateTime m}}]]
    (testing (format "fingerprint = %s" (pr-str fingerprint))
      (is (= expected
             (#'interesting/optimal-datetime-resolution {:fingerprint fingerprint}))))))

;;; -------------------- Filters --------------------

(defn field! [table column]
  (or (t2/select-one Field :id (mt/id table column))
      (throw (ex-info (format "Did not find %s.%s" (name table) (name column))
                      {:table table :column column}))))

(deftest filter-referenced-fields-test
  (testing "X-Ray should work if there's a filter in the question (#19241)"
    (mt/dataset test-data
      (let [query (mi/instance
                   Query
                   {:database-id   (mt/id)
                    :table-id      (mt/id :products)
                    :dataset_query {:database (mt/id)
                                    :type     :query
                                    :query    {:source-table (mt/id :products)
                                               :aggregation  [[:count]]
                                               :breakout     [[:field (mt/id :products :created_at) {:temporal-unit :year}]]
                                               :filter       [:=
                                                              [:field (mt/id :products :category) nil]
                                                              "Doohickey"]}}})]
        (testing `magic/filter-referenced-fields
          (is (= {(mt/id :products :category)   (field! :products :category)
                  (mt/id :products :created_at) (field! :products :created_at)}
                 (#'magic/filter-referenced-fields
                  {:source   (t2/select-one Table :id (mt/id :products))
                   :database (mt/id)
                   :entity   query}
                  [:and
                   [:=
                    [:field (mt/id :products :created_at) {:temporal-unit :year}]
                    "2017-01-01T00:00:00Z"]
                   [:=
                    [:field (mt/id :products :category) nil]
                    "Doohickey"]]))))

        (testing "end-to-end"
          ;; VERY IMPORTANT! Make sure the Table is FULLY synced (so it gets classified correctly), otherwise the
          ;; automagic Dashboards won't work (the normal quick sync we do for tests doesn't include everything that's
          ;; needed)
          (sync/sync-table! (t2/select-one Table :id (mt/id :products)))
          (let [query     {:database (mt/id)
                           :type     :query
                           :query    {:source-table (mt/id :products)
                                      :filter       [:= [:field (mt/id :products :category) nil] "Doohickey"]
                                      :aggregation  [[:count]]
                                      :breakout     [[:field (mt/id :products :created_at) {:temporal-unit "year"}]]}}
                cell      [:=
                           [:field (mt/id :products :created_at) {:temporal-unit "year"}]
                           "2017-01-01T00:00:00Z"]
                ->base-64 (fn [x]
                            (codec/base64-encode (.getBytes (json/generate-string x) "UTF-8")))]
            (is (=? {:description "A closer look at the metrics and dimensions used in this saved question."}
                    (mt/user-http-request
                     :crowberto :get 200
                     (format "automagic-dashboards/adhoc/%s/cell/%s" (->base-64 query) (->base-64 cell)))))))))))


(deftest most-specific-definition-inner-shape-test
  (testing "Ensure we have examples to understand the shape returned from most-specific-definition"
    (mt/dataset test-data
      (testing ""
        (testing "A table with a more specific entity-type will match to more specific binding definitions."
          (let [table (t2/select-one :model/Table (mt/id :people))]
            (let [{{:keys [entity_type]} :source :as root} (#'magic/->root table)
                  base-context       (#'magic/make-base-context root)
                  dimensions         [{"Loc" {:field_type [:type/Location], :score 60}}
                                      {"GenericNumber" {:field_type [:type/Number], :score 70}}
                                      {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
                                      {"GenericNumber" {:field_type [:entity/UserTable :type/Number], :score 85}}
                                      {"Lat" {:field_type [:type/Latitude], :score 90}}
                                      {"Lat" {:field_type [:entity/GenericTable :type/Latitude], :score 100}}
                                      {"Lat" {:field_type [:entity/UserTable :type/Latitude], :score 100}}]
                  candidate-bindings (#'interesting/candidate-bindings base-context dimensions)]
              (testing "For a model, the entity_type is :entity/UserTable"
                (is (= :entity/UserTable entity_type)))
              (testing "A table of type :entity/UserTable will match on all 6 of the above dimension definitions."
                (is (= (count dimensions)
                       (-> (mt/id :people :latitude)
                           candidate-bindings
                           count))))
              (testing "The return shape of most-specific-definition a single dimension containing a matches vector
                        that contains a single field. Recall from candidate-binding-inner-shape-test that each
                        most-most-specific-definition call ensures every field is bound to at most one dimension
                        definition. The sequence of all most-specific-definition may have multiple of the same dimension
                        name, however. Example:

                        [{\"Lat\" {:matches [latitude field]}}
                         ;; Note - test does not have a Lon specified
                         {\"GenericNumber\" {:matches [longitude field]}}
                         ;; Both of these have higher semantic types than Loc, so match on :type/Loc since no
                         ;; dimension definitions are more specific
                         {\"Loc\" {:matches [state field]}}
                         {\"Loc\" {:matches [city field]}}]
                        "
                (testing "Latitude is very specific so binds to Lat"
                  (is (=?
                        (-> (peek dimensions)
                           (update-vals (fn [v] (assoc v :matches [{:id (mt/id :people :latitude)}]))))
                        (-> (mt/id :people :latitude)
                            candidate-bindings
                            (#'interesting/most-specific-matched-dimension)))))
                (testing "Longitude binds to GenericNumber since there is no more specific Lon dimension definition."
                  (is (=?
                        (-> {"GenericNumber" {:field_type [:entity/UserTable :type/Number], :score 85}}
                           (update-vals (fn [v] (assoc v :matches [{:id (mt/id :people :longitude)}]))))
                        (-> (mt/id :people :longitude)
                            candidate-bindings
                            (#'interesting/most-specific-matched-dimension)))))
                (testing "City and State both have semantic types that descend from type/Location"
                  (is (=?
                        (-> {"Loc" {:field_type [:type/Location], :score 60}}
                           (update-vals (fn [v] (assoc v :matches [{:id (mt/id :people :city)}]))))
                        (-> (mt/id :people :city)
                            candidate-bindings
                            (#'interesting/most-specific-matched-dimension))))
                  (is (=?
                        (-> {"Loc" {:field_type [:type/Location], :score 60}}
                           (update-vals (fn [v] (assoc v :matches [{:id (mt/id :people :state)}]))))
                        (-> (mt/id :people :state)
                            candidate-bindings
                            (#'interesting/most-specific-matched-dimension)))))
                (testing "Although type/ZipCode exists, in this table that classification wasn't made, so Zip doesn't
                          bind to anything since there isn't a more generic dimension definition to bind to."
                  (is (nil? (-> (mt/id :people :zip)
                                candidate-bindings
                                (#'interesting/most-specific-matched-dimension)))))))))))))

(deftest bind-dimensions-inner-shape-test
  (testing "Ensure we have examples to understand the shape returned from bind-dimensions"
    (mt/dataset test-data
      (testing "Clearly demonstrate the mechanism of full dimension binding"
        (let [table (t2/select-one :model/Table (mt/id :people))]
          (let [{{:keys [entity_type]} :source :as root} (#'magic/->root table)
                base-context     (#'magic/make-base-context root)
                dimensions       [{"Loc" {:field_type [:type/Location], :score 60}}
                                  {"GenericNumber" {:field_type [:type/Number], :score 70}}
                                  {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
                                  {"GenericNumber" {:field_type [:entity/UserTable :type/Number], :score 85}}
                                  {"Lat" {:field_type [:type/Latitude], :score 90}}
                                  {"Lat" {:field_type [:entity/GenericTable :type/Latitude], :score 100}}
                                  {"Lat" {:field_type [:entity/UserTable :type/Latitude], :score 100}}]
                bound-dimensions (#'interesting/find-dimensions base-context dimensions)]
            (testing "For a model, the entity_type is :entity/UserTable"
              (is (= :entity/UserTable entity_type)))
            (testing "The return shape of bound dimensions is a map of bound dimensions (those that are used from the
                      dimension definitions) to their own definitions with the addition of a `:matches` vector
                      containing the fields that most closely match this particular dimension definition."
              (is (=?
                   {"Lat"           {:field_type [:entity/UserTable :type/Latitude]
                                     :matches [{:id (mt/id :people :latitude)}]
                                     :score 100}
                    "GenericNumber" {:field_type [:entity/UserTable :type/Number]
                                     :matches [{:id (mt/id :people :longitude)}]
                                     :score 85}
                    "Loc"           {:field_type [:type/Location]
                                     :matches    (sort-by :id [{:id (mt/id :people :state)}
                                                               {:id (mt/id :people :city)}])
                                     :score      60}}
                   (update-in bound-dimensions ["Loc" :matches] (partial sort-by :id)))))))))))

(deftest binding-functions-with-all-same-names-and-types-test
  (testing "Ensure expected behavior when multiple columns alias to the same base column and display metadata uses the
            same name for all columns."
    (mt/dataset test-data
      (let [source-query {:native   {:query "SELECT LATITUDE AS L1, LATITUDE AS L2, LATITUDE AS L3 FROM PEOPLE;"}
                          :type     :native
                          :database (mt/id)}]
        (mt/with-temp [Card card {:table_id        nil
                                  :dataset_query   source-query
                                  :result_metadata (->> (result-metadata-for-query source-query)
                                                        (mt/with-test-user :rasta)
                                                        (mapv (fn [m]
                                                                (assoc m
                                                                       :display_name "Frooby"
                                                                       :semantic_type :type/Latitude))))}]
          (let [{{:keys [entity_type]} :source :as root} (#'magic/->root card)
                base-context        (#'magic/make-base-context root)
                dimensions          [{"Loc" {:field_type [:type/Location], :score 60}}
                                     {"GenericNumber" {:field_type [:type/Number], :score 70}}
                                     {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
                                     {"GenericNumber" {:field_type [:entity/UserTable :type/Number], :score 85}}
                                     {"Lat" {:field_type [:type/Latitude], :score 90}}
                                     {"Lat" {:field_type [:entity/GenericTable :type/Latitude], :score 100}}
                                     {"Lat" {:field_type [:entity/UserTable :type/Latitude], :score 100}}]
                            ;; These will be matched in our tests since this is a generic table entity.
                bindable-dimensions (remove
                                     #(-> % vals first :field_type first #{:entity/UserTable})
                                     dimensions)
                candidate-bindings  (#'interesting/candidate-bindings base-context dimensions)
                bound-dimensions    (#'interesting/find-dimensions base-context dimensions)]
            (testing "For a plain native query (even on a specialized table), the entity_type is :entity/GenericTable"
              (is (= :entity/GenericTable entity_type)))
            (testing "candidate bindings are a map of field identifier (id or name) to dimension matches."
              (is (= #{"L1" "L2" "L3"} (set (keys candidate-bindings)))))
            (testing "Everything except for the specialized :entity/GenericTable definitions are candidates.
                                  Note that this is a map of field id -> vector of passing candidate bindings with
                                  the keyed field added to the dimension as a `:matches` vector with just that field.

                                  Also note that the actual field names and display name are not used in candidate
                                   selection. Ultimately, the filtering was based on entity_type and semantic_type."
              (is (=?
                   (let [add-matches (fn [col-name]
                                       (map
                                        (fn [bd]
                                          (update-vals
                                           bd
                                           (fn [v]
                                             (assoc v
                                                    :matches [{:name col-name :display_name "Frooby"}]))))
                                        bindable-dimensions))]
                     {"L1" (add-matches "L1")
                      "L2" (add-matches "L2")
                      "L3" (add-matches "L3")})
                   candidate-bindings)))
            (testing "Despite binding to 5 potential dimension bindings, all 3 query fields end up binding
                                  to latitude."
              (is (= ["Lat"] (keys bound-dimensions))))
            (testing "Finally, after the candidates are scored and sorted, all 3 latitude fields end up
                                  being bound to the Lat dimension."
              (is (=? {"Lat" {:field_type [:entity/GenericTable :type/Latitude]
                              :score      100
                              :matches    [{:name "L1" :display_name "Frooby"}
                                           {:name "L2" :display_name "Frooby"}
                                           {:name "L3" :display_name "Frooby"}]}}
                      bound-dimensions)))))))))

;;; -------------------- Ensure generation of subcards via related (includes indepth, drilldown) --------------------

(deftest related-card-generation-test
  (testing "Ensure that the `related` function is called and the right cards are created."
    (mt/with-test-user :rasta
      (mt/dataset test-data
        (let [{table-id :id :as table} (t2/select-one Table :id (mt/id :orders))
              {:keys [related]} (magic/automagic-analysis table {:show :all})]
          (is (=? {:zoom-in [{:url         (format "/auto/dashboard/field/%s" (mt/id :people :created_at))
                              :title       "Created At fields"
                              :description "How People are distributed across this time field, and if it has any seasonal patterns."}
                             {:title       "Orders over time"
                              :description "Whether or not there are any patterns to when they happen."
                              :url         (format "/auto/dashboard/table/%s/rule/TransactionTable/Seasonality" table-id)}
                             {:title       "Orders per product"
                              :description "How different products are performing."
                              :url         (format "/auto/dashboard/table/%s/rule/TransactionTable/ByProduct" table-id)}
                             {:title       "Orders per source"
                              :description "Where most traffic is coming from."
                              :url         (format "/auto/dashboard/table/%s/rule/TransactionTable/BySource" table-id)}
                             {:title       "Orders per state"
                              :description "Which US states are bringing you the most business."
                              :url         (format "/auto/dashboard/table/%s/rule/TransactionTable/ByState" table-id)}
                             {:url         (format "/auto/dashboard/field/%s" (mt/id :people :source))
                              :title       "Source fields"
                              :description "A look at People across Source fields, and how it changes over time."}]
                   :related [{:url         (format "/auto/dashboard/table/%s" (mt/id :people)),
                              :title       "People"
                              :description "An exploration of your users to get you started."}
                             {:url         (format "/auto/dashboard/table/%s" (mt/id :products))
                              :title       "Products"
                              :description "An overview of Products and how it's distributed across time, place, and categories."}]}
                  (-> related
                      (update :zoom-in (comp vec (partial sort-by :title)))
                      (update :related (comp vec (partial sort-by :title)))))))))))

(deftest singular-cell-dimensions-test
  (testing "Find the cell dimensions for a cell query"
    (is (= #{1 2 "TOTAL"}
           (#'magic/singular-cell-dimension-field-ids
            {:cell-query
             [:and
              [:= [:field 1 nil]]
              [:= [:field 2 nil]]
              [:= [:field "TOTAL" {:base-type :type/Number}]]]})))))

(deftest linked-metrics-test
  (testing "Testing the ability to return linked metrics based on a provided entity."
    (mt/dataset test-data
      (t2.with-temp/with-temp [Metric total-orders {:name       "Total Orders"
                                                    :table_id   (mt/id :orders)
                                                    :definition {:aggregation [[:count]]}}
                               Metric avg-quantity-ordered {:name       "Average Quantity Ordered"
                                                            :table_id   (mt/id :orders)
                                                            :definition {:aggregation [[:avg (mt/id :orders :quantity)]]}}]
        (testing "A metric links to a seq of a normalized version of itself"
          (is (=? [{:metric-definition (:definition total-orders)
                    :metric-score      100}]
                  (magic/linked-metrics total-orders)))
          (is (=? [{:metric-definition (:definition avg-quantity-ordered)
                    :metric-score      100}]
                  (magic/linked-metrics avg-quantity-ordered))))
        (testing "A table with linked metrics returns a seq of normalized linked queries"
          (is (=? [{:metric-definition (:definition avg-quantity-ordered)}
                   {:metric-definition (:definition total-orders)}]
                  (sort-by
                    :metric-name
                    (magic/linked-metrics (t2/select-one :model/Table (mt/id :orders)))))))
        (testing "A table context with linked metrics returns a seq of normalized linked queries"
          (is (=? [{:metric-definition (:definition avg-quantity-ordered)}
                   {:metric-definition (:definition total-orders)}]
                  (mt/with-test-user :rasta
                    (let [entity (t2/select-one :model/Table (mt/id :orders))
                          {{:keys [linked-metrics]} :root} (#'magic/make-base-context (magic/->root entity))]
                      (sort-by :metric-name linked-metrics))))))
        (testing "When no linked metrics are present, return nothing"
          (is (nil? (mt/with-test-user :rasta
                      (let [entity (t2/select-one :model/Table (mt/id :people))
                            {{:keys [linked-metrics]} :root} (#'magic/make-base-context (magic/->root entity))]
                        (seq linked-metrics))))))))))

(deftest affinities->viz-types-test
  (testing "Conversion of normalized card templates and ground dimensions to a map of dimension affinities to viz types"
    (let [normalized-card-templates [{:dimensions [{"DIM0" nil}] :visualization ["bar"]}
                                     {:dimensions [{"DIM0" nil}] :visualization ["line"]}
                                     {:dimensions [{"LON" nil} {"LAT" nil}] :visualization ["map"]}]]
      (testing "A single dimension can produce multiple viz types"
        (is (= {#{"DIM0"} #{["bar"] ["line"]}}
               (magic/affinities->viz-types normalized-card-templates {"DIM0" {}}))))
      (testing "The addition of a dimension that is part of an affinity, bot not the whole thing, doesn't add anything."
        (is (= {#{"DIM0"} #{["bar"] ["line"]}}
               (magic/affinities->viz-types normalized-card-templates {"DIM0" {} "LON" {}}))))
      (testing "Dimension affinities such as longitude and latitude match to their viz as defined in the normalized cards."
        (is (= {#{"LON" "LAT"} #{["map"]}}
               (magic/affinities->viz-types normalized-card-templates {"LON" {} "LAT" {}}))))
      (testing "A case in which all of the card templates are satisfied."
        (is (= {#{"LON" "LAT"} #{["map"]}
                #{"DIM0"}      #{["bar"] ["line"]}}
               (magic/affinities->viz-types normalized-card-templates {"DIM0" {} "LON" {} "LAT" {}})))))))

(deftest user-defined-groups-test
  (testing "Example of group generation from user metrics (based on a seq of maps with `:metric-name`)."
    (is (= {"METRIC0" {:title "Your METRIC0 Metric" :score 0}
            "METRIC1" {:title "Your METRIC1 Metric" :score 0}}
           (magic/user-defined-groups
             [{:metric-name "METRIC0"}
              {:metric-name "METRIC0"}
              {:metric-name "METRIC1"}])))))

(deftest combination-grounded-metrics->dashcards-test
  (testing "Dashcard creation example test"
    (mt/dataset test-data
      (t2.with-temp/with-temp [Metric _total-orders {:name       "Total Orders"
                                                     :table_id   (mt/id :orders)
                                                     :definition {:aggregation [[:count]]}}
                               Metric _avg-quantity-ordered {:name       "Average Quantity Ordered"
                                                             :table_id   (mt/id :orders)
                                                             :definition {:aggregation [[:avg (mt/id :orders :quantity)]]}}]
        (mt/with-test-user :rasta
          (let [entity                      (t2/select-one :model/Table (mt/id :orders))
                {template-dimensions :dimensions
                 template-metrics    :metrics
                 template-cards      :cards
                 :as                 template} (dashboard-templates/get-dashboard-template ["table" "GenericTable"])
                metric-templates            (interesting/normalize-seq-of-maps :metric template-metrics)
                {{user-defined-metrics :linked-metrics} :root
                 :as                                             base-context} (#'magic/make-base-context (magic/->root entity))
                ;; A mapping of dimension (by name) to dimension definition + matches (a seq of matching fields)
                ground-dimensions           (interesting/find-dimensions base-context template-dimensions)
                ;; Grounded metrics come in two flavors -- those satisfiable by the template, and user-defined metrics.
                grounded-metrics            (concat
                                              (interesting/grounded-metrics metric-templates ground-dimensions)
                                              user-defined-metrics)
                ;; Card templates come in two flavors -- generic templates from the dashboard template and user-defined
                card-templates              (interesting/normalize-seq-of-maps :card template-cards)
                user-defined-card-templates (magic/user-defined-metrics->card-templates
                                              (magic/affinities->viz-types card-templates ground-dimensions)
                                              user-defined-metrics)
                all-cards                   (into card-templates user-defined-card-templates)
                ground-filters              (interesting/grounded-filters (:filters template) ground-dimensions)
                dashcards                   (combination/grounded-metrics->dashcards
                                              base-context
                                              all-cards
                                              ground-dimensions
                                              ground-filters
                                              grounded-metrics)
                {total-orders-group         "Total Orders"
                 avg-quantity-ordered-group "Average Quantity Ordered"} (group-by :group dashcards)]
            (is (= 55 (count dashcards)))
            (is (= 14 (count total-orders-group)))
            (is (= #{"map" "bar" "line" "row"}
                   (set (map (comp first :visualization) total-orders-group))))
            (is (= 15 (count avg-quantity-ordered-group)))
            (is (= #{"map" "bar" "scalar" "line" "row"}
                   (set (map (comp first :visualization) avg-quantity-ordered-group))))))))))

(deftest generate-dashboard-pipeline-test
  (testing "Example new pipeline dashboard generation test"
    (mt/dataset test-data
      (t2.with-temp/with-temp [Metric _total-orders {:name       "Total Orders"
                                                     :table_id   (mt/id :orders)
                                                     :definition {:aggregation [[:count]]}}
                               Metric _avg-quantity-ordered {:name       "Average Quantity Ordered"
                                                             :table_id   (mt/id :orders)
                                                             :definition {:aggregation [[:avg (mt/id :orders :quantity)]]}}]
        (mt/with-test-user :rasta
          (let [entity                      (t2/select-one :model/Table (mt/id :orders))
                {template-dimensions :dimensions
                 template-metrics    :metrics
                 template-cards      :cards
                 template-filters    :filters
                 :keys [dashboard_filters]
                 :as                 template} (dashboard-templates/get-dashboard-template ["table" "GenericTable"])
                metric-templates            (interesting/normalize-seq-of-maps :metric template-metrics)
                {{user-defined-metrics :linked-metrics :as root} :root
                 :as                                             base-context} (#'magic/make-base-context (magic/->root entity))
                ;; A mapping of dimension (by name) to dimension definition + matches (a seq of matching fields)
                ground-dimensions           (->> (interesting/find-dimensions base-context template-dimensions)
                                                 (#'interesting/add-field-self-reference base-context))
                template-grounded-metrics   (interesting/grounded-metrics metric-templates ground-dimensions)
                set-score                   (fn [score metrics]
                                              (map #(assoc % :metric-score score) metrics))
                ;; Grounded metrics come in two flavors -- those satisfiable by the template, and user-defined metrics.
                grounded-metrics            (concat (set-score 50 template-grounded-metrics) (set-score 95 user-defined-metrics)
                                                    (let [entity (-> base-context :root :entity)]
                                                      ;; metric x-rays talk about "this" in the template
                                                      (when (mi/instance-of? :model/LegacyMetric entity)
                                                        [{:metric-name       "this"
                                                          :metric-title      (:name entity)
                                                          :metric-definition {:aggregation [(interesting/->reference :mbql entity)]}
                                                          :metric-score      dashboard-templates/max-score}])))
                ground-filters              (interesting/grounded-filters template-filters ground-dimensions)
                ;; Card templates come in two flavors -- generic templates from the dashboard template and user-defined
                card-templates              (interesting/normalize-seq-of-maps :card template-cards)
                user-defined-card-templates (magic/user-defined-metrics->card-templates
                                              (magic/affinities->viz-types card-templates ground-dimensions)
                                              user-defined-metrics)
                all-cards                   (into card-templates user-defined-card-templates)
                dashcards                   (combination/grounded-metrics->dashcards
                                              base-context
                                              all-cards
                                              ground-dimensions
                                              ground-filters
                                              grounded-metrics)
                template-with-user-groups   (update template :groups into (#'magic/user-defined-groups user-defined-metrics))
                empty-dashboard             (#'magic/make-dashboard root template-with-user-groups)
                show                        @#'magic/max-cards ;(or show max-cards)
                base-dashboard              (assoc empty-dashboard
                                              ;; Adds the filters that show at the top of the dashboard
                                              ;; Why do we need (or do we) the last remove form?
                                              :filters (->> dashboard_filters
                                                            (mapcat (comp :matches ground-dimensions))
                                                            (remove (comp (#'magic/singular-cell-dimension-field-ids root) #'magic/id-or-name)))
                                              :cards dashcards)
                final-dashboard             (populate/create-dashboard base-dashboard show)
                strip-ids                   (partial walk/prewalk (fn [v] (cond-> v (map? v) (dissoc :id :card_id))))]
            (is (pos? (count (:dashcards final-dashboard))))
            (is (= (strip-ids (:dashcards final-dashboard))
                   (strip-ids (:dashcards (#'magic/generate-dashboard base-context template
                                            {:dimensions ground-dimensions
                                             :metrics    grounded-metrics
                                             :filters    ground-filters})))))))))))

(deftest adhoc-query-with-explicit-joins-14793-test
  (testing "A verification of the fix for https://github.com/metabase/metabase/issues/14793,
            X-rays fails on explicit joins, when metric is for the joined table"
    (mt/dataset test-data
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (let [query-with-joins {:database   (mt/id)
                                  :type       :query
                                  :query      {:source-table (mt/id :reviews)
                                               :joins        [{:strategy     :left-join
                                                               :alias        "Products"
                                                               :condition    [:=
                                                                              [:field (mt/id :reviews :product_id)
                                                                               {:base-type :type/Integer}]
                                                                              [:field (mt/id :products :id)
                                                                               {:base-type :type/BigInteger :join-alias "Products"}]]
                                                               :source-table (mt/id :products)}]
                                               :aggregation  [[:sum [:field (mt/id :products :price)
                                                                     {:base-type :type/Float :join-alias "Products"}]]]
                                               :breakout     [[:field (mt/id :reviews :created_at)
                                                               {:base-type :type/DateTime :temporal-unit :year}]]
                                               ;; The filter is what is added with the "Click any point and select X-Ray" stage of the bug repro
                                               :filter       [:= [:field (mt/id :reviews :created_at)
                                                                  {:base-type :type/DateTime :temporal-unit :year}]
                                                              "2018"]}
                                  :parameters []}
                q                (query/adhoc-query query-with-joins)
                section-headings (->> (magic/automagic-analysis q {:show :all})
                                      :dashcards
                                      (keep (comp :text :visualization_settings))
                                      set)
                expected-section "## How this metric is distributed across different numbers"]
            (testing "A dashboard is produced -- prior to the bug fix, this would not produce a dashboard"
              (is (some? section-headings)))
            (testing "An expectation check -- this dashboard should produce this group heading"
              (is (= expected-section
                     (section-headings expected-section))))))))))

(deftest compare-to-the-rest-25278+32557-test
  (testing "Ensure valid queries are generated for an automatic comparison dashboard (fixes 25278 & 32557)"
    (mt/dataset test-data
      (mt/with-test-user :rasta
        (let [left                 (query/adhoc-query
                                     {:database (mt/id)
                                      :type     :query
                                      :query
                                      {:source-table (mt/id :orders)
                                       :joins
                                       [{:strategy     :left-join
                                         :alias        "Products"
                                         :condition
                                         [:=
                                          [:field (mt/id :orders :product_id) {:base-type :type/Integer}]
                                          [:field (mt/id :products :id) {:base-type :type/BigInteger :join-alias "Products"}]]
                                         :source-table (mt/id :products)}]
                                       :aggregation  [[:avg [:field (mt/id :orders :tax) {:base-type :type/Float}]]]
                                       :breakout     [[:field (mt/id :products :title)
                                                       {:base-type :type/Text :join-alias "Products"}]]}})
              right                (t2/select-one :model/Table (mt/id :orders))
              cell-query           [:= [:field (mt/id :products :title)
                                        {:base-type :type/Text :join-alias "Products"}]
                                    "Intelligent Granite Hat"]
              dashboard            (magic/automagic-analysis left {:show         nil
                                                                   :query-filter nil
                                                                   :comparison?  true})
              comparison-dashboard (comparison/comparison-dashboard dashboard left right {:left {:cell-query cell-query}})
              sample-card-title "Average of Tax per state"
              [{base-query :dataset_query :as card-without-cell-query}
               {filtered-query :dataset_query :as card-with-cell-query}] (->> comparison-dashboard
                                                                              :dashcards
                                                                              (filter (comp #{sample-card-title} :name :card))
                                                                              (map :card))]
          (testing "Comparison cards exist"
            (is (some? card-with-cell-query))
            (is (some? card-without-cell-query)))
          (testing "The cell-query exists in only one of the cards"
            (is (not= cell-query (get-in base-query [:query :filter])))
            (is (= cell-query (get-in filtered-query [:query :filter]))))
          (testing "Join aliases exist in the queries"
            ;; The reason issues 25278 & 32557 would blow up is the lack of join aliases.
            (is (= ["Products"] (map :alias (get-in base-query [:query :joins]))))
            (is (= ["Products"] (map :alias (get-in filtered-query [:query :joins])))))
          (testing "Card queries are both executable and produce different results"
            ;; Note that issues 25278 & 32557 would blow up on the filtered queries.
            (let [base-data           (get-in (qp/process-query base-query) [:data :rows])
                  filtered-data       (get-in (qp/process-query filtered-query) [:data :rows])]
              (is (some? base-data))
              (is (some? filtered-data))
              (is (not= base-data filtered-data)))))))))

(deftest compare-to-the-rest-with-expression-16680-test
  (testing "Ensure a valid comparison dashboard is generated with custom expressions (fixes 16680)"
    (mt/dataset test-data
      (mt/with-test-user :rasta
        (let [left                 (query/adhoc-query
                                     {:database (mt/id)
                                      :type     :query
                                      :query
                                      {:source-table (mt/id :orders)
                                       :expressions  {"TestColumn" [:+ 1 1]}
                                       :aggregation  [[:count]]
                                       :breakout     [[:expression "TestColumn"]
                                                      [:field (mt/id :orders :created_at)
                                                       {:temporal-unit :month}]]}})
              right                (t2/select-one :model/Table (mt/id :orders))
              cell-query           [:and
                                    [:= [:expression "TestColumn"] 2]
                                    [:= [:field (mt/id :orders :created_at)
                                         {:temporal-unit :month}]
                                     "2019-02-01T00:00:00Z"]]
              dashboard            (magic/automagic-analysis left {:show         nil
                                                                   :query-filter nil
                                                                   :comparison?  true})
              {:keys [dashcards]} (comparison/comparison-dashboard dashboard left right {:left {:cell-query cell-query}})
              ;; Select a few cards to compare -- there are many more but we're just going to sample
              distinct-values-card-label "Distinct values"
              [{base-query :dataset_query :as card-without-cell-query}
               {filtered-query :dataset_query :as card-with-cell-query}] (->> dashcards
                                                                              (filter (comp #{distinct-values-card-label} :name :card))
                                                                              (map :card))

              series-card-label    "Number of Orders per day of the week (Number of Orders where TestColumn is 2 and Created At is in February 2019)"
              {[{series-dataset-query :dataset_query}] :series
               {card-dataset-query :dataset_query} :card
               :as                                     series-card} (some
                                                                      (fn [{{card-name :name} :card :as dashcard}]
                                                                        (when (= series-card-label card-name)
                                                                          dashcard))
                                                                      dashcards)]
          (testing "Comparisons that exist on two cards"
            (testing "Comparison cards exist"
              (is (some? card-with-cell-query))
              (is (some? card-without-cell-query)))
            (testing "The cell-query exists in only one of the cards"
              (is (not= cell-query (get-in base-query [:query :filter])))
              (is (= cell-query (get-in filtered-query [:query :filter]))))
            (testing "Expressions exist in the queries"
              (is (= {"TestColumn" [:+ 1 1]} (get-in base-query [:query :expressions])))
              (is (= {"TestColumn" [:+ 1 1]} (get-in filtered-query [:query :expressions]))))
            (testing "Card queries are both executable and produce different results"
              (let [base-data     (get-in (qp/process-query base-query) [:data :rows])
                    filtered-data (get-in (qp/process-query filtered-query) [:data :rows])]
                (is (some? base-data))
                (is (some? filtered-data))
                (is (not= base-data filtered-data)))))
          (testing "Comparisons that exist on the same card"
            (testing "Both series (original and comparison) are present on the same chart"
              (is (= ["Number of Orders per day of the week (Number of Orders where TestColumn is 2 and Created At is in February 2019)"
                      "Number of Orders per day of the week (All Orders)"]
                     (get-in series-card [:visualization_settings :graph.series_labels]))))
            (testing "Both the series and card datasets are present and queryable"
              (is (some? series-dataset-query))
              (is (= 7 (:row_count (qp/process-query series-dataset-query))))
              (is (some? card-dataset-query))
              (is (= 7 (:row_count (qp/process-query card-dataset-query)))))))))))

(deftest preserve-entity-element-test
  (testing "Join preservation scenarios: merge, empty expressions, no expressions, no card"
    (is (= [[{:strategy :left-join, :alias "Orders"}
             {:strategy :left-join, :alias "Products"}]
            [{:strategy :left-join, :alias "Products"}]
            [{:strategy :left-join, :alias "Products"}]
            nil]
           (->>
             (#'magic/preserve-entity-element
               {:dashcards [{:card {:dataset_query {:query {:joins [{:strategy :left-join :alias "Orders"}]}}}}
                            {:card {:dataset_query {:query {:joins []}}}}
                            {:card {:dataset_query {:query {}}}}
                            {:viz_settings nil}]}
               {:dataset_query {:query {:joins [{:strategy :left-join :alias "Products"}]}}}
               :joins)
             :dashcards
             (mapv (comp :joins :query :dataset_query :card))))))
  (testing "Expression preservation scenarios: merge, empty expressions, no expressions, no card"
    (is (= [{"Existing" [:- 1 1] "TestColumn" [:+ 1 1]}
            {"TestColumn" [:+ 1 1]}
            {"TestColumn" [:+ 1 1]}
            nil]
           (->>
             (#'magic/preserve-entity-element
               {:dashcards [{:card {:dataset_query {:query {:expressions {"Existing" [:- 1 1]}}}}}
                            {:card {:dataset_query {:query {:expressions {}}}}}
                            {:card {:dataset_query {:query {}}}}
                            {:viz_settings nil}]}
               {:dataset_query {:query {:expressions {"TestColumn" [:+ 1 1]}}}}
               :expressions)
             :dashcards
             (mapv (comp :expressions :query :dataset_query :card)))))))

(deftest compare-to-the-rest-15655-test
  (testing "Questions based on native questions should produce a valid dashboard."
    (mt/dataset test-data
      (mt/with-test-user :rasta
        (let [native-query {:native   {:query "select * from people"}
                            :type     :native
                            :database (mt/id)}]
          (mt/with-temp
            [Card {native-card-id :id :as native-card} {:table_id        nil
                                                        :name            "15655"
                                                        :dataset_query   native-query
                                                        :result_metadata (mt/with-test-user :rasta (result-metadata-for-query native-query))}
             ;card__19169
             Card card {:table_id      (mt/id :orders)
                        :dataset_query {:query    {:source-table (format "card__%s" native-card-id)
                                                   :aggregation  [[:count]]
                                                   :breakout     [[:field "SOURCE" {:base-type :type/Text}]]}
                                        :type     :query
                                        :database (mt/id)}}]
            (let [{:keys [description dashcards] :as dashboard} (magic/automagic-analysis card {})]
              (testing "Questions based on native queries produce a dashboard"
                (is (= "A closer look at the metrics and dimensions used in this saved question."
                       description))
                (is (set/subset?
                      #{{:group-name "# A look at the SOURCE fields", :card-name nil}
                        {:group-name "## The number of 15655 over time", :card-name nil}
                        {:group-name nil, :card-name "Over time"}
                        {:group-name nil, :card-name "Number of 15655 per day of the week"}
                        {:group-name "## How this metric is distributed across different categories", :card-name nil}
                        {:group-name nil, :card-name "Number of 15655 per NAME over time"}
                        {:group-name nil, :card-name "Number of 15655 per CITY over time"}
                        {:group-name "## Overview", :card-name nil}
                        {:group-name nil, :card-name "Count"}
                        {:group-name nil, :card-name "How the SOURCE is distributed"}
                        {:group-name "## How the SOURCE fields is distributed", :card-name nil}
                        {:group-name nil, :card-name "SOURCE by NAME"}
                        {:group-name nil, :card-name "SOURCE by CITY"}}
                      (set (map (fn [dashcard]
                                  {:group-name (get-in dashcard [:visualization_settings :text])
                                   :card-name  (get-in dashcard [:card :name])})
                                dashcards)))))
              (let [cell-query ["=" ["field" "SOURCE" {:base-type "type/Text"}] "Affiliate"]
                    {comparison-description :description
                     comparison-dashcards   :dashcards
                     transient_name         :transient_name} (comparison/comparison-dashboard
                                                               dashboard
                                                               card
                                                               native-card
                                                               {:left {:cell-query cell-query}})]
                (testing "Questions based on native queries produce a comparable dashboard"
                  (is (= "Comparison of Number of 15655 where SOURCE is Affiliate and \"15655\", all 15655"
                         transient_name))
                  (is (= "Automatically generated comparison dashboard comparing Number of 15655 where SOURCE is Affiliate and \"15655\", all 15655"
                         comparison-description))
                  (is (= [{:group-name nil, :card-name "SOURCE by CITY"}
                          {:group-name nil, :card-name "SOURCE by CITY"}
                          {:group-name nil, :card-name "SOURCE by NAME"}
                          {:group-name nil, :card-name "SOURCE by NAME"}
                          {:group-name "## How the SOURCE fields is distributed", :card-name nil}
                          {:group-name nil, :card-name "Distinct values"}
                          {:group-name nil, :card-name "Distinct values"}
                          {:group-name nil, :card-name "How the SOURCE is distributed (Number of 15655 where SOURCE is Affiliate)"}
                          {:group-name nil, :card-name "Null values"}
                          {:group-name nil, :card-name "Null values"}]
                         (->> comparison-dashcards
                              (take 10)
                              (map (fn [dashcard]
                                     {:group-name (get-in dashcard [:visualization_settings :text])
                                      :card-name  (get-in dashcard [:card :name])})))))
                  (mapv (fn [dashcard]
                          {:group-name (get-in dashcard [:visualization_settings :text])
                           :card-name  (get-in dashcard [:card :name])})
                        comparison-dashcards))))))))))

(deftest source-fields-are-populated-for-aggregations-38618-test
  (testing "X-ray aggregates (metrics) with source fields in external tables should properly fill in `:source-field` (#38618)"
    (mt/dataset test-data
      (let [dashcard  (->> (magic/automagic-analysis (t2/select-one Table :id (mt/id :reviews)) {:show :all})
                           :dashcards
                           (filter (fn [dashcard]
                                     (= "Distinct Product ID"
                                        (get-in dashcard [:card :name]))))
                           first)
            aggregate (get-in dashcard [:card :dataset_query :query :aggregation])]
        (testing "Fields requiring a join should have :source-field populated in the aggregate."
          (is (= [["distinct" [:field (mt/id :products :id)
                               ;; This should be present vs. nil (value before issue)
                               {:source-field (mt/id :reviews :product_id)}]]]
                 aggregate)))))))
