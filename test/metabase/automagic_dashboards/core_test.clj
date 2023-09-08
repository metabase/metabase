(ns ^:mb/once metabase.automagic-dashboards.core-test
  (:require
   [cheshire.core :as json]
   [clojure.core.async :as a]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.api.common :as api]
   [metabase.automagic-dashboards.core :as magic]
   [metabase.automagic-dashboards.dashboard-templates :as dashboard-templates]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models
    :refer [Card Collection Database Field Metric Segment Table]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.query :as query :refer [Query]]
   [metabase.query-processor.async :as qp.async]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.automagic-dashboards :as automagic-dashboards.test]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [ring.util.codec :as codec]
   [schema.core :as s]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

;;; ------------------- `->field` -------------------
(deftest ->field-test
  (testing "Demonstrate the stated methods in which ->fields works"
    (mt/with-test-user :rasta
      (mt/dataset sample-dataset
        (testing "->field checks for a table-based context"
          (let [table (t2/select-one :model/Table :id (mt/id :orders))
                root  (#'magic/->root table)]
            (testing "Looking up the field by name does not work"
              (is (nil? (magic/->field root "DISCOUNT"))))
            (testing "Looking up the field by id or id-field ref works."
              (is (=?
                    {:id (mt/id :orders :discount)}
                    (magic/->field root (mt/id :orders :discount))))
              (is (=?
                    {:id (mt/id :orders :discount)}
                    (magic/->field root [:field (mt/id :orders :discount) nil]))))))
        (testing "->field checks for a model-based context"
          (let [query (mt/native-query {:query "select * from orders"})]
            (t2.with-temp/with-temp [Card card (mt/card-with-source-metadata-for-query query)]
              (let [root  (#'magic/->root card)]
                (testing "Looking up the field by id or id-field ref works"
                  (is (=?
                        {:id (mt/id :orders :discount)}
                        (magic/->field root (mt/id :orders :discount))))
                  (is (=?
                        {:id (mt/id :orders :discount)}
                        (magic/->field root [:field (mt/id :orders :discount) nil]))))
                (testing "Looking up the field by name or named field ref works,
                          returning the metadata description of the field."
                  (is (=?
                        {:name      "DISCOUNT"
                         :field_ref [:field "DISCOUNT" {:base-type :type/Float}]}
                        (magic/->field root "DISCOUNT"))))
                (is (=?
                      {:name      "DISCOUNT"
                       :field_ref [:field "DISCOUNT" {:base-type :type/Float}]}
                      (magic/->field root [:field "DISCOUNT" {:base-type :type/Float}])))))))))))

;;; ------------------- `->reference` -------------------

(deftest ^:parallel ->reference-test
  (is (= [:field 1 nil]
         (->> (assoc (mi/instance Field) :id 1)
              (#'magic/->reference :mbql))))

  (is (= [:field 2 {:source-field 1}]
         (->> (assoc (mi/instance Field) :id 1 :fk_target_field_id 2)
              (#'magic/->reference :mbql))))

  (is (= 42
         (->> 42
              (#'magic/->reference :mbql)))))


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
    (mt/dataset sample-dataset
      (testing "The source of a table is the table itself"
        (let [table (t2/select-one :model/Table :id (mt/id :orders))
              {:keys [entity source]} (#'magic/->root table)]
          (is (= source table))
          (is (= entity table))
          (is (= source entity)))))))

(deftest source-root-field-test
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Field"
    (mt/dataset sample-dataset
      (testing "The source of a field is the originating table of the field"
        (let [table (t2/select-one :model/Table :id (mt/id :orders))
              field (t2/select-one :model/Field :id (mt/id :orders :discount))
              {:keys [entity source]} (#'magic/->root field)]
          (is (= source table))
          (is (= entity field)))))))

(deftest source-root-card-test
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Card"
    (mt/dataset sample-dataset
      (testing "Card sourcing has four branches..."
        (testing "A model's (dataset = true) source is itself with the :entity_type :entity/GenericTable assoced in"
          (mt/with-temp
            [Card card {:table_id      (mt/id :orders)
                        :dataset_query {:query    {:source-table (mt/id :orders)}
                                        :type     :query
                                        :database (mt/id)}
                        :dataset       true}]
            (let [{:keys [entity source]} (#'magic/->root card)]
              (is (true? (:dataset card)))
              (is (= entity card))
              (is (= source (assoc card :entity_type :entity/GenericTable))))))
        (testing "A nested query's source is itself with the :entity_type :entity/GenericTable assoced in"
          (mt/with-temp
            [Card {source-query-id :id
                   :as             nested-query} {:table_id      (mt/id :orders)
                                                  :dataset_query {:query    {:source-table (mt/id :orders)}
                                                                  :type     :query
                                                                  :database (mt/id)}
                                                  :dataset       true}
             Card card {:table_id      (mt/id :orders)
                        :dataset_query {:query    {:limit        10
                                                   :source-table (format "card__%s" source-query-id)}
                                        :type     :query
                                        :database (mt/id)}}]
            (let [{:keys [entity source]} (#'magic/->root card)]
              (is (false? (:dataset card)))
              (is (true? (#'magic/nested-query? card)))
              (is (= entity card))
              (is (= source (assoc nested-query :entity_type :entity/GenericTable))))))
        (testing "A native query's source is itself with the :entity_type :entity/GenericTable assoced in"
          (let [query (mt/native-query {:query "select * from orders"})]
            (t2.with-temp/with-temp [Card card (mt/card-with-source-metadata-for-query query)]
              (let [{:keys [entity source]} (#'magic/->root card)]
                (is (false? (:dataset card)))
                (is (true? (#'magic/native-query? card)))
                (is (= entity card))
                (is (= source (assoc card :entity_type :entity/GenericTable)))))))
        (testing "A plain query card (not native, nested, or a model) is sourced by its base table."
          (mt/with-temp
            [Card {table-id :table_id
                   :as      card} {:table_id      (mt/id :orders)
                                   :dataset_query {:query    {:filter       [:> [:field (mt/id :orders :quantity) nil] 10]
                                                              :source-table (mt/id :orders)}
                                                   :type     :query
                                                   :database (mt/id)}}]
            (let [{:keys [entity source]} (#'magic/->root card)]
              (is (false? (:dataset card)))
              (is (false? (#'magic/nested-query? card)))
              (is (false? (#'magic/native-query? card)))
              (is (= entity card))
              (is (= source (t2/select-one :model/Table :id table-id))))))))))

(deftest source-root-query-test
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Query"
    (mt/dataset sample-dataset
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
  (testing "Demonstrate the stated methods in which ->root computes the source of a :model/Metric"
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
                                       (t2/select Table :db_id (mt/id) {:order-by [[:id :asc]]})
                                       [7 5 8 2])]
        (test-automagic-analysis table cardinality)))

    (automagic-dashboards.test/with-dashboard-cleanup
      (is (= 1
             (->> (magic/automagic-analysis (t2/select-one Table :id (mt/id :venues)) {:show 1})
                  :ordered_cards
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
        (is (pos? (count (:ordered_cards (magic/automagic-analysis field {})))))))))

(deftest metric-test
  (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)
                                          :definition {:aggregation [[:count]]}}]
    (mt/with-test-user :rasta
      (automagic-dashboards.test/with-dashboard-cleanup
        (test-automagic-analysis metric 8)))))

(deftest parameter-mapping-test
  (mt/dataset sample-dataset
    (testing "mbql queries have parameter mappings with field ids"
        (let [table (t2/select-one Table :id (mt/id :products))
              dashboard (magic/automagic-analysis table {})
              expected-targets (mt/$ids #{[:dimension $products.category]
                                          [:dimension $products.created_at]})
              actual-targets (into #{}
                                   (comp (mapcat :parameter_mappings)
                                         (map :target))
                                   (:ordered_cards dashboard))]
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
                                     (:ordered_cards dashboard))]
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

(defn field! [table column]
  (or (t2/select-one Field :id (mt/id table column))
      (throw (ex-info (format "Did not find %s.%s" (name table) (name column))
                      {:table table :column column}))))

(deftest field-matching-predicates-test
  (testing "A Google Analytics dimension will match on field name."
    (let [fa-fieldspec "ga:name"]
      (is (= fa-fieldspec ((#'magic/fieldspec-matcher fa-fieldspec) {:name fa-fieldspec})))))
  (testing "The fieldspec-matcher does not match on ID columns."
    (mt/dataset sample-dataset
      (let [id-field (field! :products :id)]
        ;; the id-field does have a type...
        (is (true? (#'magic/field-isa? id-field :type/*)))
        ;; ...but it isn't a candidate dimension because it is an id column...
        (is (false? ((#'magic/fieldspec-matcher :type/*) id-field)))
        ;; ...unless you're looking explicitly for a primary key
        (is (true? ((#'magic/fieldspec-matcher :type/PK) id-field))))))
  (testing "The fieldspec-matcher should match fields by their fieldspec"
    (mt/dataset sample-dataset
      (let [price-field (field! :products :price)
            latitude-field (field! :people :latitude)
            created-at-field (field! :people :created_at)
            pred (#'magic/fieldspec-matcher :type/Latitude)]
        (is (false? (pred price-field)))
        (is (true? (pred latitude-field)))
        (is (true? ((#'magic/fieldspec-matcher :type/CreationTimestamp) created-at-field)))
        (is (true? ((#'magic/fieldspec-matcher :type/*) created-at-field))))))
  (testing "The name-regex-matcher should return fields with string/regex matches"
    (mt/dataset sample-dataset
      (let [price-field (field! :products :price)
            category-field (field! :products :category)
            ice-pred (#'magic/name-regex-matcher "ice")]
        (is (some? (ice-pred price-field)))
        (is (nil? (ice-pred category-field))))))
  (testing "The max-cardinality-matcher should return fields with cardinality <= the specified cardinality"
    (mt/dataset sample-dataset
      (let [category-field (field! :products :category)]
        (is (false? ((#'magic/max-cardinality-matcher 3) category-field)))
        (is (true? ((#'magic/max-cardinality-matcher 4) category-field)))
        (is (true? ((#'magic/max-cardinality-matcher 100) category-field))))))
  (testing "Roll the above together and test filter-fields"
    (mt/dataset sample-dataset
      (let [category-field (field! :products :category)
            price-field (field! :products :price)
            latitude-field (field! :people :latitude)
            created-at-field (field! :people :created_at)
            source-field (field! :people :source)
            fields [category-field price-field latitude-field created-at-field source-field]]
        ;; Get the lone field that is both a CreationTimestamp and has "at" in the name
        (is (= #{(mt/id :people :created_at)}
               (set (map :id (#'magic/filter-fields
                              {:fieldspec :type/CreationTimestamp
                               :named "at"}
                              fields)))))
        ;; Get all fields with "at" in their names
        (is (= #{(mt/id :products :category)
                 (mt/id :people :created_at)
                 (mt/id :people :latitude)}
               (set (map :id (#'magic/filter-fields {:named "at"} fields)))))
        ;; Products.Category has cardinality 4 and People.Source has cardinality 5
        ;; Both are picked up here
        (is (= #{(mt/id :products :category)
                 (mt/id :people :source)}
               (set (map :id (#'magic/filter-fields {:max-cardinality 5} fields)))))
        ;; People.Source is rejected here
        (is (= #{(mt/id :products :category)}
               (set (map :id (#'magic/filter-fields {:max-cardinality 4} fields)))))))))

(deftest ensure-field-dimension-bindings-test
  (testing "A very simple card with two plain fields should return the singe assigned dimension for each field."
    (mt/dataset sample-dataset
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
                                             :dataset         true}]
            (let [root               (#'magic/->root card)
                  {:keys [dimensions] :as _template} (dashboard-templates/get-dashboard-template ["table" "GenericTable"])
                  base-context       (#'magic/make-base-context root)
                  candidate-bindings (#'magic/candidate-bindings base-context dimensions)
                  bindset            #(->> % candidate-bindings (map ffirst) set)]
              (is (= #{"GenericCategoryMedium"} (bindset (mt/id :products :category))))
              (is (= #{"GenericNumber"} (bindset (mt/id :products :price)))))))))))

(deftest ensure-field-dimension-bindings-test-2
  (testing "A model that spans 3 tables should use all fields, provide correct candidate bindings,
            and choose the best-match candidate."
    (mt/dataset sample-dataset
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
                                                         :dataset         true}]
            (let [root               (#'magic/->root card)
                  {:keys [dimensions] :as _template} (dashboard-templates/get-dashboard-template ["table" "GenericTable"])
                  base-context       (#'magic/make-base-context root)
                  candidate-bindings (#'magic/candidate-bindings base-context dimensions)
                  bindset            #(->> % candidate-bindings (map ffirst) set)
                  boundval            #(->> % candidate-bindings (#'magic/most-specific-matched-dimension) ffirst)]
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
    (mt/dataset sample-dataset
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
                 (set (map :id (#'magic/matching-fields context (dimensions "Timestamp"))))))
          (is (= #{(mt/id :people :created_at)
                   (mt/id :orders :created_at)}
                 (set (map :id (#'magic/matching-fields context (dimensions "CreateTimestamp"))))))
          ;; This does not match any of our fabricated context fields (even (mt/id :people :latitude)) because the
          ;; context is fabricated and needs additional data (:table). See above test for a working example with a match
          (is (= #{} (set (map :id (#'magic/matching-fields context (dimensions "Lat"))))))))))
  (testing "Verify dimension selection works for dimension definitions with 2-element [tablespec fieldspec] definitions."
    (mt/dataset sample-dataset
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
                                             :dataset         true}]
            (let [base-context (#'magic/make-base-context (#'magic/->root card))
                  dimensions   {"GenericCategoryMedium" {:field_type [:entity/GenericTable :type/Category] :max_cardinality 10}
                                "GenericNumber"         {:field_type [:entity/GenericTable :type/Number]}
                                "Lat"                   {:field_type [:entity/GenericTable :type/Latitude]}
                                "Long"                  {:field_type [:entity/GenericTable :type/Longitude]}
                                "State"                 {:field_type [:entity/GenericTable :type/State]}}]
              (is (= #{(mt/id :people :state)}
                     (->> (#'magic/matching-fields base-context (dimensions "State")) (map :id) set)))
              (is (= #{(mt/id :products :category)
                       (mt/id :people :source)}
                     (->> (#'magic/matching-fields base-context (dimensions "GenericCategoryMedium")) (map :id) set)))
              (is (= #{(mt/id :products :price)
                       (mt/id :people :longitude)
                       (mt/id :people :latitude)}
                     (->> (#'magic/matching-fields base-context (dimensions "GenericNumber")) (map :id) set)))
              (is (= #{(mt/id :people :latitude)}
                     (->> (#'magic/matching-fields base-context (dimensions "Lat")) (map :id) set)))
              (is (= #{(mt/id :people :longitude)}
                     (->> (#'magic/matching-fields base-context (dimensions "Long")) (map :id) set))))))))))

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
                          :ordered_cards
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
    (mt/dataset sample-dataset
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
                                             :dataset         true}]
            (let [dashboard (mt/with-test-user :rasta (magic/automagic-analysis card nil))
                  binned-field-id (mt/id :products :price)]
              (ensure-single-table-sourced (mt/id :products) dashboard)
              ;; Count of records
              ;; Distributions:
              ;; - Binned price
              ;; - Binned by category
              (is (= 3 (->> dashboard :ordered_cards (filter :card) count)))
              (ensure-dashboard-sourcing card dashboard)
              ;; This ensures we get a card that does binning on price
              (is (= binned-field-id
                     (first
                      (for [card (:ordered_cards dashboard)
                            :let [fields (get-in card [:card :dataset_query :query :breakout])]
                            [_ field-id m] fields
                            :when (:binning m)]
                        field-id))))
              (->> dashboard :ordered_cards (filter :card) count))))))))

(deftest basic-root-model-test-2
  (testing "Simple model with a temporal dimension detected"
    ;; Same as above, but the code should detect the time dimension of the model and present
    ;; cards with a time axis.
    (mt/dataset sample-dataset
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
                                             :dataset         true}]
            (let [dashboard (mt/with-test-user :rasta (magic/automagic-analysis card nil))
                  temporal-field-ids (for [card (:ordered_cards dashboard)
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
    (mt/dataset sample-dataset
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
                                             :dataset         true}]
            (let [{:keys [ordered_cards] :as dashboard} (mt/with-test-user :rasta (magic/automagic-analysis card nil))]
              (ensure-single-table-sourced (mt/id :people) dashboard)
              (ensure-dashboard-sourcing card dashboard)
              ;; We should generate two cards - locations and total values
              (is (= #{(format "%s by coordinates" (:name card))
                       (format "Total %s" (:name card))}
                     (set
                      (for [{:keys [card]} ordered_cards
                            :let [{:keys [name]} card]
                            :when name]
                        name)))))))))))

(deftest model-title-does-not-leak-abstraction-test
  (testing "The title of a model or question card should not be X model or X question, but just X."
    (mt/dataset sample-dataset
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
                                             :dataset         true}
             Card       question-card       {:table_id        (mt/id :products)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user
                                                                :rasta
                                                                (result-metadata-for-query
                                                                 source-query))
                                             :dataset         false}]
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
  (mt/dataset sample-dataset
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
                                  :dataset         true}]
          (let [{:keys [ordered_cards] :as dashboard} (mt/with-test-user :rasta (magic/automagic-analysis card nil))
                card-names (set (filter identity (map (comp :name :card) ordered_cards)))
                expected-oip-labels #{"Ordered Item Price over time"
                                      (format "%s by Ordered Item Price" (:name card))}
                expected-time-labels (set
                                      (map
                                       #(format "%s when %s were added" % (:name card))
                                       ["Quarters" "Months" "Days" "Hours" "Weekdays"]))
                expected-geo-labels #{(format "%s per state" (:name card))}]
            (is (= 11 (->> dashboard :ordered_cards (filter :card) count)))
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
            cards       (vec (:ordered_cards res))
            join-member (get-in cards [2 :card :dataset_query :query :joins])]
        (is (= join-vec join-member))))))


;;; ------------------- /candidates -------------------

(deftest candidates-test
  (testing "/candidates"
    (testing "should work with the normal test-data DB"
      (mt/with-test-user :rasta
        (is (schema= [(s/one {:tables   (s/constrained [s/Any] #(= (count %) 4))
                              s/Keyword s/Any}
                             "first result")
                      s/Any]
                     (magic/candidate-tables (mt/db))))))

    (testing "should work with unanalyzed tables"
      (mt/with-test-user :rasta
        (mt/with-temp [Database {db-id :id} {}
                       Table    {table-id :id} {:db_id db-id}
                       Field    _ {:table_id table-id}
                       Field    _ {:table_id table-id}]
          (automagic-dashboards.test/with-dashboard-cleanup
            (is (schema= [(s/one {:tables   [(s/one {:table    {:id       (s/eq table-id)
                                                                s/Keyword s/Any}
                                                     s/Keyword s/Any}
                                                    "first Table")]
                                  s/Keyword s/Any}
                                 "first result")]
                         (magic/candidate-tables (t2/select-one Database :id db-id))))))))))

(deftest call-count-test
  (mt/with-temp [Database {db-id :id} {}
                 Table    {table-id :id} {:db_id db-id}
                 Field    _ {:table_id table-id}
                 Field    _ {:table_id table-id}]
    (mt/with-test-user :rasta
      ;; make sure the current user permissions set is already fetched so it's not included in the DB call count below
      @api/*current-user-permissions-set*
      (automagic-dashboards.test/with-dashboard-cleanup
        (let [database (t2/select-one Database :id db-id)]
          (t2/with-call-count [call-count]
            (magic/candidate-tables database)
            (is (= 4
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
               (#'magic/most-specific-matched-dimension)
               first
               key)))))

(deftest ^:parallel ancestors-definition-test
  (testing "Base case: more ancestors"
    (is (= :d2
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}]
               (#'magic/most-specific-matched-dimension)
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
               (#'magic/most-specific-matched-dimension)
               first
               key)))))

(deftest ^:parallel definition-tiebreak-score-test
  (testing "Break ties on score"
    (is (= :d2
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}
                {:d3 {:field_type [:type/State] :score 90}}]
               (#'magic/most-specific-matched-dimension)
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
               (#'magic/most-specific-matched-dimension)
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
             (#'magic/optimal-datetime-resolution {:fingerprint fingerprint}))))))


;;; ------------------- Datetime humanization (for chart and dashboard titles) -------------------

(deftest ^:parallel temporal-humanization-test
  (let [dt    #t "1990-09-09T12:30"
        t-str "1990-09-09T12:30:00"]
    (doseq [[unit expected] {:minute          (tru "at {0}" (t/format "h:mm a, MMMM d, YYYY" dt))
                             :hour            (tru "at {0}" (t/format "h a, MMMM d, YYYY" dt))
                             :day             (tru "on {0}" (t/format "MMMM d, YYYY" dt))
                             :week            (tru "in {0} week - {1}" (#'magic/pluralize (u.date/extract dt :week-of-year)) (str (u.date/extract dt :year)))
                             :month           (tru "in {0}" (t/format "MMMM YYYY" dt))
                             :quarter         (tru "in Q{0} - {1}" (u.date/extract dt :quarter-of-year) (str (u.date/extract dt :year)))
                             :year            (t/format "YYYY" dt)
                             :day-of-week     (t/format "EEEE" dt)
                             :hour-of-day     (tru "at {0}" (t/format "h a" dt))
                             :month-of-year   (t/format "MMMM" dt)
                             :quarter-of-year (tru "Q{0}" (u.date/extract dt :quarter-of-year))
                             :minute-of-hour  (u.date/extract dt :minute-of-hour)
                             :day-of-month    (u.date/extract dt :day-of-month)
                             :week-of-year    (u.date/extract dt :week-of-year)}]
      (testing (format "unit = %s" unit)
        (is (= (str expected)
               (str (#'magic/humanize-datetime t-str unit))))))))

(deftest ^:parallel pluralize-test
  (are [expected n] (= (str expected)
                       (str (#'magic/pluralize n)))
    (tru "{0}st" 1)   1
    (tru "{0}nd" 22)  22
    (tru "{0}rd" 303) 303
    (tru "{0}th" 0)   0
    (tru "{0}th" 8)   8))

(deftest ^:parallel handlers-test
  (testing "Make sure we have handlers for all the units available"
    (doseq [unit (disj (set (concat u.date/extract-units u.date/truncate-units))
                       :iso-day-of-year :second-of-minute :millisecond)]
      (testing unit
        (is (some? (#'magic/humanize-datetime "1990-09-09T12:30:00" unit)))))))

;;; ------------------- Cell titles -------------------
(deftest ^:parallel cell-title-test
  (mt/$ids venues
    (let [query (query/adhoc-query {:query    {:source-table (mt/id :venues)
                                               :aggregation  [:count]}
                                    :type     :query
                                    :database (mt/id)})
          root  (magic/->root query)]
      (testing "Should humanize equal filter"
        (is (= "number of Venues where Name is Test"
               ;; Test specifically the un-normalized form (metabase#15737)
               (magic/cell-title root ["=" ["field" %name nil] "Test"]))))
      (testing "Should humanize and filter"
        (is (= "number of Venues where Name is Test and Price is 0"
               (magic/cell-title root ["and"
                                       ["=" $name "Test"]
                                       ["=" $price 0]]))))
      (testing "Should humanize between filter"
        (is (= "number of Venues where Name is between A and J"
               (magic/cell-title root ["between" $name "A", "J"]))))
      (testing "Should humanize inside filter"
        (is (= "number of Venues where Longitude is between 2 and 4; and Latitude is between 3 and 1"
               (magic/cell-title root ["inside" (mt/$ids venues $latitude) (mt/$ids venues $longitude) 1 2 3 4])))))))


;;; -------------------- Filters --------------------

(deftest filter-referenced-fields-test
  (testing "X-Ray should work if there's a filter in the question (#19241)"
    (mt/dataset sample-dataset
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
            (is (schema= {:description (s/eq "A closer look at the metrics and dimensions used in this saved question.")
                          s/Keyword    s/Any}
                         (mt/user-http-request
                          :crowberto :get 200
                          (format "automagic-dashboards/adhoc/%s/cell/%s" (->base-64 query) (->base-64 cell)))))))))))

;;; -------------------- Bind dimensions, candidate bindings, field candidates, and related --------------------


(deftest field-candidates-with-tablespec-specialization
  (testing "Test for when both a tablespec and fieldspec are provided in the dimension definition"
    (let [matching-field           {:name          "QUANTITY BUT NAME DOES NOT MATTER"
                                    :semantic_type :type/Quantity}
          non-matching-field       {:name          "QUANTITY IS MY NAME, BUT I AM A GENERIC NUMBER"
                                    :semantic_type :type/GenericNumber}
          context                  {:tables
                                    [{:entity_type :entity/GenericTable
                                      :fields      [matching-field
                                                    non-matching-field]}]}
          gt-quantity-dimension    {:field_type [:entity/GenericTable :type/Quantity], :score 100}
          generic-number-dimension {:field_type [:type/GenericNumber], :score 100}
          quantity-dimension       {:field_type [:type/Quantity], :score 100}]
      (testing "A match occurs when the dimension field_type tablespec and fieldspec
                match the table entity_type and field semantic_type."
        (is (=? [matching-field]
                (#'magic/matching-fields
                  context
                  gt-quantity-dimension))))
      (testing "When the table entity_type does not match the dimension, nothing is returned."
        (is (empty? (#'magic/matching-fields
                      (assoc-in context [:tables 0 :entity_type] :entity/Whatever)
                      gt-quantity-dimension))))
      (testing "When the dimension spec does not contain a table spec and no :source is provided
                in the context nothing is returned."
        (is (empty? (#'magic/matching-fields
                      context
                      generic-number-dimension))))
      (testing "Even if the field and dimension semantic types match, a match will not occur without a table spec."
        (is (empty? (#'magic/matching-fields
                      context
                      quantity-dimension)))))))

(deftest field-candidates-with-no-tablespec-specialization
  (testing "Tests for when only a fieldspec is provided in the dimension definition.
            The expectation is a `source` will be provided with populated fields."
    (let [quantity-field           {:name          "QUANTITY BUT NAME DOES NOT MATTER"
                                    :semantic_type :type/Quantity}
          generic-number-field     {:name          "QUANTITY IS MY NAME, BUT I AM A GENERIC NUMBER"
                                    :semantic_type :type/GenericNumber}
          another-field            {:name          "X"
                                    :semantic_type :type/GenericNumber}
          context                  {:source
                                    {:fields [quantity-field
                                              generic-number-field]}}
          quantity-dimension       {:field_type [:type/Quantity], :score 100}
          gt-quantity-dimension    {:field_type [:entity/GenericTable :type/Quantity], :score 100}
          generic-number-dimension {:field_type [:type/GenericNumber], :score 100}]
      (testing "A match occurs when the dimension field_type tablespec and fieldspec
                match the table entity_type and field semantic_type."
        (is (=? [quantity-field]
                (#'magic/matching-fields
                  context
                  quantity-dimension))))
      (testing "When a table spec is provided in the dimension and the source contains no tables there is no match."
        (is (empty? (#'magic/matching-fields
                      context
                      gt-quantity-dimension))))
      (testing "Multiple fields of the same type will match"
        (is (=? [generic-number-field
                 another-field]
                (#'magic/matching-fields
                  (update-in context [:source :fields] conj another-field)
                  generic-number-dimension)))))))

(deftest candidate-bindings-1f-3b-test
  (testing "Candidate bindings with one field and multiple bindings"
    (let [field                {:base_type     :type/Integer
                                :name          "QUANTITY"
                                :semantic_type :type/Quantity}
          context              {:tables
                                [{:entity_type :entity/GenericTable
                                  :fields      [field]}]}
          generic-number-dim   {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
          generic-quantity-dim {"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
          unmatched-dim        {"Quantity no table" {:field_type [:type/Quantity], :score 100}}
          dimensions           [generic-number-dim
                                generic-quantity-dim
                                unmatched-dim]
          bindings             (vals (#'magic/candidate-bindings context dimensions))]
      (testing "The single field binds to the two relevant dimensions"
        (is (=? [[generic-number-dim
                  generic-quantity-dim]]
                bindings)))
      (testing "The single field binds only to those two dimensions and not the unmatched dim"
        (is (= 2 (count (first bindings))))))))

(deftest candidate-bindings-2f-4d-test
  (testing "Candidate bindings with multiple fields and bindings"
    (let [nurnies       {:base_type     :type/Integer
                         :name          "Number of Nurnies"
                         :semantic_type :type/Quantity}
          greebles      {:base_type     :type/Integer
                         :name          "Number of Greebles"
                         :semantic_type :type/Quantity}
          context       {:tables
                         [{:entity_type :entity/GenericTable
                           :fields      [nurnies
                                         greebles]}]}
          integer-dim   {"GenericInteger" {:field_type [:entity/GenericTable :type/Integer], :score 60}}
          number-dim    {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
          quantity-dim  {"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
          unmatched-dim {"Range Free Quantity" {:field_type [:type/Quantity], :score 100}}
          dimensions    [integer-dim
                         number-dim
                         quantity-dim
                         unmatched-dim]
          bindings      (#'magic/candidate-bindings context dimensions)]
      (testing "2 results are returned - one for each matched field group"
        (is (= 2 (count bindings))))
      (testing "The return data shape is a vector for each field, each of which is a vector of
                each matching dimension, each of which as associated a `:matches` into the
                value of the dimension map."
        (is (=? (apply
                  merge
                  (for [{field-name :name :as field} [nurnies greebles]]
                    {field-name
                     (for [dimension [integer-dim number-dim quantity-dim]]
                       (update-vals dimension #(assoc % :matches [field])))}))
                bindings))))))

(deftest candidate-bindings-3f-4d-test
  (testing "Candidate bindings with multiple fields and bindings"
    (let [nurnies       {:base_type     :type/Integer
                         :name          "Number of Nurnies"
                         :semantic_type :type/Quantity}
          greebles      {:base_type     :type/Integer
                         :name          "Number of Greebles"
                         :semantic_type :type/Quantity}
          froobs        {:base_type :type/Float
                         :name      "A double number field"}
          context       {:tables
                         [{:entity_type :entity/GenericTable
                           :fields      [nurnies
                                         greebles
                                         froobs]}]}
          integer-dim   {"GenericInteger" {:field_type [:entity/GenericTable :type/Integer], :score 60}}
          number-dim    {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
          quantity-dim  {"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
          unmatched-dim {"Range Free Quantity" {:field_type [:type/Quantity], :score 100}}
          dimensions    [integer-dim
                         number-dim
                         quantity-dim
                         unmatched-dim]
          bindings      (vals (#'magic/candidate-bindings context dimensions))]
      bindings
      (testing "3 results are returned - one for each matched field group"
        (is (= 3 (count bindings))))
      (testing "The return data shape is a vector for each field, each of which is a vector of
                each matching dimension, each of which as associated a `:matches` into the
                value of the dimension map."
        (is (=? (for [field [nurnies greebles froobs]]
                  (if (= field froobs)
                    [(update-vals number-dim #(assoc % :matches [field]))]
                    (for [dimension [integer-dim number-dim quantity-dim]]
                      (update-vals dimension #(assoc % :matches [field])))))
                bindings))))))

(deftest bind-dimensions-merge-logic-test
  (testing "An example based test of the merge logic in bind dimensions."
    (let [equal-bindings           [{"Quantity" {:score   100
                                                 :matches [{:name "Number of Nurnies"}]}}
                                    {"Quantity" {:score   100
                                                 :matches [{:name "Number of Greebles"}]}}]
          a-lt-b-bindings          [{"Quantity" {:matches [{:name "Number of Nurnies"}]}}
                                    {"Quantity" {:score   100
                                                 :matches [{:name "Number of Greebles"}]}}]
          b-lt-a-bindings          [{"Quantity" {:score   100
                                                 :matches [{:name "Number of Nurnies"}]}}
                                    {"Quantity" {:score   1,
                                                 :matches [{:name "Number of Greebles"}]}}]
          bind-dimensions-merge-fn #(apply merge-with (fn [a b]
                                                        (case (compare (:score a) (:score b))
                                                          1 a
                                                          0 (update a :matches concat (:matches b))
                                                          -1 b))
                                           {}
                                           %)]
      (is (= {"Quantity" {:score 100 :matches [{:name "Number of Nurnies"} {:name "Number of Greebles"}]}}
             (bind-dimensions-merge-fn equal-bindings)))
      (is (= {"Quantity" {:score 100, :matches [{:name "Number of Greebles"}]}}
             (bind-dimensions-merge-fn a-lt-b-bindings)))
      (is (= {"Quantity" {:score 100, :matches [{:name "Number of Nurnies"}]}}
             (bind-dimensions-merge-fn b-lt-a-bindings))))))

(deftest bind-dimensions-3f-4d-test
  (testing "Perform end-to-end dimension binding with multiple dimensions and fields."
    (let [nurnies       {:base_type     :type/Integer
                         :name          "Number of Nurnies"
                         :semantic_type :type/Quantity}
          greebles      {:base_type     :type/Integer
                         :name          "Number of Greebles"
                         :semantic_type :type/Quantity}
          froobs        {:base_type :type/Float
                         :name      "A double number field"}
          context       {:tables
                         [{:entity_type :entity/GenericTable
                           :fields      [nurnies
                                         greebles
                                         froobs]}]}
          integer-dim   {"GenericInteger" {:field_type [:entity/GenericTable :type/Integer], :score 60}}
          number-dim    {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
          quantity-dim  {"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
          unmatched-dim {"Range Free Quantity" {:field_type [:type/Quantity], :score 100}}
          dimensions    [integer-dim
                         number-dim
                         quantity-dim
                         unmatched-dim]
          bindings      (#'magic/bind-dimensions context dimensions)]
      (is (= {"Quantity" {:field_type [:entity/GenericTable :type/Quantity],
                          :score 100,
                          :matches    [{:base_type     :type/Integer,
                                        :name          "Number of Nurnies",
                                        :semantic_type :type/Quantity,
                                        :link          nil,
                                        :field_type    [:entity/GenericTable :type/Quantity],
                                        :score         100}
                                       {:base_type     :type/Integer,
                                        :name          "Number of Greebles",
                                        :semantic_type :type/Quantity,
                                        :link          nil,
                                        :field_type    [:entity/GenericTable :type/Quantity],
                                        :score         100}]},
              "GenericNumber" {:field_type [:entity/GenericTable :type/Number],
                               :score      80,
                               :matches    [{:base_type  :type/Float,
                                             :name       "A double number field",
                                             :link       nil,
                                             :field_type [:entity/GenericTable :type/Number],
                                             :score      80}]}}
             bindings)))))

(deftest bind-dimensions-select-most-specific-test
  (testing "When multiple dimensions are candidates the most specific dimension is selected."
    (is (= {"Quantity" {:field_type [:entity/GenericTable :type/Quantity],
                        :score      100,
                        :matches    [{:semantic_type  :type/Quantity,
                                      :name           "QUANTITY",
                                      :effective_type :type/Integer,
                                      :display_name   "Quantity",
                                      :base_type      :type/Integer,
                                      :link           nil,
                                      :field_type     [:entity/GenericTable :type/Quantity],
                                      :score          100}]}}
           (let [context        {:source {:entity_type :entity/GenericTable
                                          :fields      [{:semantic_type  :type/Discount,
                                                         :name           "DISCOUNT"
                                                         :effective_type :type/Float
                                                         :base_type      :type/Float}
                                                        {:semantic_type  :type/Quantity,
                                                         :name           "QUANTITY"
                                                         :effective_type :type/Integer
                                                         :base_type      :type/Integer}]}
                                 :tables [{:entity_type :entity/TransactionTable
                                           :fields      [{:semantic_type  :type/Discount,
                                                          :name           "DISCOUNT"
                                                          :effective_type :type/Float,
                                                          :display_name   "Discount"
                                                          :base_type      :type/Float}
                                                         {:semantic_type  :type/Quantity,
                                                          :name           "QUANTITY"
                                                          :effective_type :type/Integer
                                                          :display_name   "Quantity"
                                                          :base_type      :type/Integer}]}]}
                 dimension-defs [{"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
                                 {"Quantity" {:field_type [:type/Quantity], :score 100}}]]
             (#'magic/bind-dimensions context dimension-defs))))))

(deftest bind-dimensions-single-field-binding-subtleties-test
  (testing "Fields are always bound to one and only one dimension."
    (let [context        {:tables [{:entity_type :entity/GenericTable
                                    :fields      [{:name "DISCOUNT" :base_type :type/Float}
                                                  {:name "QUANTITY" :base_type :type/Float}
                                                  {:name "Date" :base_type :type/Date}]}]}
          dimension-defs [{"Date" {:field_type [:entity/GenericTable :type/Date], :score 100}}
                          {"Profit" {:field_type [:entity/GenericTable :type/Float], :score 100}}
                          {"Revenue" {:field_type [:entity/GenericTable :type/Float], :score 100}}
                          {"Loss" {:field_type [:entity/GenericTable :type/Float], :score 100}}]]
      (testing "All other things being equal, the bound dimension is the last one in the list.
              It's also important to note that we will lose 2 of the 3 Float bindings even if we have a situation like:
              - Chart 1: Revenue vs. Date
              - Chart 2: Profit vs. Loss
              In this situation, we only get the last bound dimension. Note that there is still a dimension selection
              element downstream when choosing metrics (the ordinate dimension), but at this point these potential named
              dimensions are lost as everything is bound to only one of the three."
        (is (=? {"Date" {:matches [{:name "Date"}]}
                 "Loss" {:matches [{:name "DISCOUNT"}
                                   {:name "QUANTITY"}]}}
                (#'magic/bind-dimensions context dimension-defs)))
        (is (=? {"Date"   {:matches [{:name "Date"}]}
                 "Profit" {:matches [{:name "DISCOUNT"}
                                     {:name "QUANTITY"}]}}
                (#'magic/bind-dimensions context
                  (->> dimension-defs cycle (drop 2) (take 4)))))
        (is (=? {"Date"    {:matches [{:name "Date"}]}
                 "Revenue" {:matches [{:name "DISCOUNT"}
                                      {:name "QUANTITY"}]}}
                (#'magic/bind-dimensions context
                  (->> dimension-defs cycle (drop 3) (take 4)))))))))


(deftest candidate-binding-inner-shape-test
  (testing "Ensure we have examples to understand the shape returned from candidate-bindings"
    (mt/dataset sample-dataset
      (testing "A model with a single field that matches all potential bindings"
        (let [source-query {:database (mt/id)
                            :query    {:source-table (mt/id :people)
                                       :fields       [(mt/id :people :latitude)]}
                            :type     :query}]
          (mt/with-temp
            [Card card {:table_id        (mt/id :products)
                        :dataset_query   source-query
                        :result_metadata (mt/with-test-user
                                           :rasta
                                           (result-metadata-for-query
                                             source-query))
                        :dataset         true}]
            (let [{{:keys [entity_type]} :source :as root} (#'magic/->root card)
                  base-context       (#'magic/make-base-context root)
                  dimensions         [{"GenericNumber" {:field_type [:type/Number], :score 70}}
                                      {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
                                      {"Lat" {:field_type [:type/Latitude], :score 90}}
                                      {"Lat" {:field_type [:entity/GenericTable :type/Latitude], :score 100}}]
                  candidate-bindings (#'magic/candidate-bindings base-context dimensions)]
              (testing "For a model, the entity_type is :entity/GenericTable"
                (is (= :entity/GenericTable entity_type)))
              (is (= (count dimensions)
                     (-> (mt/id :people :latitude)
                         candidate-bindings
                         count)))
              (testing "The return shape of candidate bindings is a map of bound field id to sequence of dimension
                      definitions, each of which has been associated a matches vector containing a single element --
                      the field whose id is the id of the key in this map entry. E.g. if your field id is 1, the result
                      will look like {1 [(assoc matched-dimension-definition-1 :matches [field 1])
                                         (assoc matched-dimension-definition-2 :matches [field 1])
                                         (assoc matched-dimension-definition-3 :matches [field 1])]}"
                (is (=?
                      {(mt/id :people :latitude)
                       (map
                         (fn [m]
                           (update-vals m (fn [v]
                                            (assoc v :matches [{:id (mt/id :people :latitude)}]))))
                         dimensions)}
                      candidate-bindings)))))))
      (testing "A model with two fields that each have a high degree of matching."
        (let [source-query {:database (mt/id)
                            :query    {:source-table (mt/id :people)
                                       :fields       [(mt/id :people :latitude)
                                                      (mt/id :people :longitude)]}
                            :type     :query}]
          (mt/with-temp
            [Card card {:table_id        (mt/id :products)
                        :dataset_query   source-query
                        :result_metadata (mt/with-test-user
                                           :rasta
                                           (result-metadata-for-query
                                             source-query))
                        :dataset         true}]
            (let [{{:keys [entity_type]} :source :as root} (#'magic/->root card)
                  base-context       (#'magic/make-base-context root)
                  ;; These typically come from the dashboard templates, but can be mocked (injected dyamically if desired) easily.
                  dimensions         [{"GenericNumber" {:field_type [:type/Number], :score 70}}
                                      {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
                                      {"Lat" {:field_type [:type/Latitude], :score 90}}
                                      {"Lat" {:field_type [:entity/GenericTable :type/Latitude], :score 100}}
                                      {"Lon" {:field_type [:type/Longitude], :score 90}}
                                      {"Lon" {:field_type [:entity/GenericTable :type/Longitude], :score 100}}]
                  candidate-bindings (#'magic/candidate-bindings base-context dimensions)]
              (testing "For a model, the entity_type is :entity/GenericTable"
                (is (= :entity/GenericTable entity_type)))
              (testing "Each of these binds to 4 potential binding definitions"
                (is (= 4 (-> (mt/id :people :latitude) candidate-bindings count)))
                (is (= 4 (-> (mt/id :people :longitude) candidate-bindings count))))
              (testing "The return shape of candidate bindings is a map of bound field id to sequence of dimension
                      definitions, each of which has been associated a matches vector containing a single element --
                      the field whose id is the id of the key in this map entry. E.g. if your field id is 1, the result
                      will look like {1 [(assoc matched-dimension-definition-1 :matches [field 1])
                                         (assoc matched-dimension-definition-2 :matches [field 1])
                                         (assoc matched-dimension-definition-3 :matches [field 1])]
                                      ;; These matches match 2. They aren't necessarily the same as match-x above.
                                      2 [(assoc matched-dimension-definition-1 :matches [field 2])
                                         (assoc matched-dimension-definition-2 :matches [field 2])
                                         (assoc matched-dimension-definition-3 :matches [field 2])]}"
                (is (=?
                      {(mt/id :people :latitude)
                       (map
                         (fn [m]
                           (update-vals m (fn [v]
                                            (assoc v :matches [{:id (mt/id :people :latitude)}]))))
                         (remove (fn [dimension] (= "Lon" (ffirst dimension))) dimensions))}
                      candidate-bindings))
                (is (=?
                      {(mt/id :people :longitude)
                       (map
                         (fn [m]
                           (update-vals m (fn [v]
                                            (assoc v :matches [{:id (mt/id :people :longitude)}]))))
                         (remove (fn [dimension] (= "Lat" (ffirst dimension))) dimensions))}
                      candidate-bindings)))))))
      (testing "A table with a more specific entity-type will match to more specific binding definitions."
        (let [table (t2/select-one :model/Table (mt/id :people))]
          (let [{{:keys [entity_type]} :source :as root} (#'magic/->root table)
                base-context       (#'magic/make-base-context root)
                dimensions         [{"Loc" {:field_type [:type/Location], :score 60}}
                                    {"GenericNumber" {:field_type [:type/Number], :score 70}}
                                    {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
                                    {"GenericNumber" {:field_type [:entity/UserTable :type/Number], :score 85}}
                                    {"Lat" {:field_type [:type/Latitude], :score 90}}
                                    {"Lat" {:field_type [:entity/GenericTable :type/Latitude], :score 95}}
                                    {"Lat" {:field_type [:entity/UserTable :type/Latitude], :score 100}}]
                candidate-bindings (#'magic/candidate-bindings base-context dimensions)]
            (testing "For a model, the entity_type is :entity/UserTable"
              (is (= :entity/UserTable entity_type)))
            (testing "A table of type :entity/UserTable will match on all 6 of the above dimension definitions."
              (is (= (count dimensions)
                     (-> (mt/id :people :latitude)
                         candidate-bindings
                         count))))
            (testing "The return shape of candidate bindings is a map of bound field id to sequence of dimension
                      definitions, each of which has been associated a matches vector containing a single element --
                      the field whose id is the id of the key in this map entry. E.g. if your field id is 1, the result
                      will look like {1 [(assoc matched-dimension-definition-1 :matches [field 1])
                                         (assoc matched-dimension-definition-2 :matches [field 1])
                                         (assoc matched-dimension-definition-3 :matches [field 1])]}

                      While this looks super weird, it groups a single field to every potential binding in the
                      dimension definition list."
              (is (=?
                    {(mt/id :people :latitude)
                     (map
                       (fn [m]
                         (update-vals m (fn [v]
                                          (assoc v :matches [{:id (mt/id :people :latitude)}]))))
                       dimensions)}
                    (select-keys candidate-bindings [(mt/id :people :latitude)]))))))))))

(deftest most-specific-definition-inner-shape-test
  (testing "Ensure we have examples to understand the shape returned from most-specific-definition"
    (mt/dataset sample-dataset
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
                  candidate-bindings (#'magic/candidate-bindings base-context dimensions)]
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
                            (#'magic/most-specific-matched-dimension)))))
                (testing "Longitude binds to GenericNumber since there is no more specific Lon dimension definition."
                  (is (=?
                        (-> {"GenericNumber" {:field_type [:entity/UserTable :type/Number], :score 85}}
                            (update-vals (fn [v] (assoc v :matches [{:id (mt/id :people :longitude)}]))))
                        (-> (mt/id :people :longitude)
                            candidate-bindings
                            (#'magic/most-specific-matched-dimension)))))
                (testing "City and State both have semantic types that descend from type/Location"
                  (is (=?
                        (-> {"Loc" {:field_type [:type/Location], :score 60}}
                            (update-vals (fn [v] (assoc v :matches [{:id (mt/id :people :city)}]))))
                        (-> (mt/id :people :city)
                            candidate-bindings
                            (#'magic/most-specific-matched-dimension))))
                  (is (=?
                        (-> {"Loc" {:field_type [:type/Location], :score 60}}
                            (update-vals (fn [v] (assoc v :matches [{:id (mt/id :people :state)}]))))
                        (-> (mt/id :people :state)
                            candidate-bindings
                            (#'magic/most-specific-matched-dimension)))))
                (testing "Although type/ZipCode exists, in this table that classification wasn't made, so Zip doesn't
                          bind to anything since there isn't a more generic dimension definition to bind to."
                  (is (nil? (-> (mt/id :people :zip)
                                candidate-bindings
                                (#'magic/most-specific-matched-dimension)))))))))))))

(deftest bind-dimensions-inner-shape-test
  (testing "Ensure we have examples to understand the shape returned from bind-dimensions"
    (mt/dataset sample-dataset
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
                bound-dimensions (#'magic/bind-dimensions base-context dimensions)]
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
    (mt/dataset sample-dataset
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
                            candidate-bindings  (#'magic/candidate-bindings base-context dimensions)
                            bound-dimensions    (#'magic/bind-dimensions base-context dimensions)]
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

;;; -------------------- Resolve overloading (metrics and filters) --------------------

(deftest has-matches-test
  (testing "has-matches? checks only the keys of the bound dimensions map against the [dimension X] vector in the
            metric or filter definition."
    (let [dimensions {"GenericNumber" {:this :does :not :matter}
                      "Income" {:this :does :not :matter}
                      "Day" {:this :does :not :matter}}]
      (testing "has-matches only matches on dimension name. These have no nominal matches to our input dimension names."
        (is (false? (#'magic/has-matches? dimensions
                      {"Avg" {:metric ["avg" ["dimension" "FROOB"]]}})))
        (is (false? (#'magic/has-matches? dimensions
                      {"Last30Days" {:filter ["time-interval" ["dimension" "Timestamp"] -30 "day"]}}))))
      (testing "Basic single name match will match on dimension names."
        (is (true?
              (#'magic/has-matches?
                dimensions
                {"Avg" {:metric ["avg" ["dimension" "GenericNumber"]]}})))
        (is (true?
              (#'magic/has-matches?
                dimensions
                {"Last30Days" {:filter ["time-interval" ["dimension" "Day"] -30 "day"]}}))))
      (testing "Despite one dimension matching (Income) both must match to pass."
        (is (false?
              (#'magic/has-matches?
                dimensions
                {"AvgDiscount" {:metric ["/" ["sum" ["dimension" "Discount"]] ["sum" ["dimension" "Income"]]]}}))))
      (testing "Once all specified dimensions are present the predicate will pass."
        (is (true?
              (#'magic/has-matches?
                (assoc dimensions "Discount" :something)
                {"AvgDiscount" {:metric ["/" ["sum" ["dimension" "Discount"]] ["sum" ["dimension" "Income"]]]}})))))))

(deftest resolve-overloading-no-dimensions-test
  (testing "Testing cases where no dimensions are present.
            Note that this may be a bug in the implementation. If no dimensions are present, the overloaded items should
            potentially be filtered out as they will never be used in cards anyways."
    (let [dimensions nil
          metrics [{"Count" {:metric ["count"] :score 100}}
                   {"CountDistinctFKs" {:metric ["distinct" ["dimension" "FK"]] :score 100}}
                   {"Sum" {:metric ["sum" ["dimension" "GenericNumber"]] :score 100}}
                   {"Avg" {:metric ["avg" ["dimension" "GenericNumber"]] :score 1}}]]
      (testing "When no dimensions are present and there are no conflicts in metric name, the metrics are simply merged."
        (is (= (apply merge metrics)
               (#'magic/resolve-overloading dimensions metrics))))
      (testing "When no dimensions are present and there is a conflict, tie is broken by score."
        (let [new-metric {"Avg" {:metric ["avg" ["dimension" "GenericNumber"]] :score 100}}
              conflicting-metrics (into [new-metric] metrics)]
          (testing "A simple merge won't do"
            (is (not= (apply merge conflicting-metrics)
                      (#'magic/resolve-overloading dimensions conflicting-metrics))))
          (testing "The new metric wins because it has a higher score."
            (is (= (into (apply merge metrics) new-metric)
                   (#'magic/resolve-overloading dimensions conflicting-metrics)))))))))

(deftest resolve-overloading-test
  (testing "When there is a conflict in metric or filter name,
            what matters is the ability to match to dimension name first."
    (is (= {"Avg" {:metric ["avg" ["dimension" "GenericNumber"]] :score 0}}
           (#'magic/resolve-overloading
             {:dimensions {"GenericNumber" {}}}
             [{"Avg" {:metric ["avg" ["dimension" "FROOB"]] :score 100}}
              {"Avg" {:metric ["avg" ["dimension" "GenericNumber"]] :score 0}}]))))
  (testing "When there is a conflict in metric or filter name, we rank on score amongst the matching metrics."
    (is (= {"Avg" {:metric ["/"
                            ["sum" ["dimension" "Discount"]]
                            ["sum" ["dimension" "Income"]]] :score 100}}
           (#'magic/resolve-overloading
             {:dimensions {"GenericNumber" {}
                           "Discount"      {}
                           "Income"        {}}}
             [{"Avg" {:metric ["avg" ["dimension" "FROOB"]] :score 100}}
              {"Avg" {:metric ["/"
                               ["sum" ["dimension" "Discount"]]
                               ["sum" ["dimension" "Income"]]] :score 100}}
              {"Avg" {:metric ["avg" ["dimension" "GenericNumber"]] :score 99}}])))
    (is (= {"Last30Days" {:filter ["time-interval" ["dimension" "Day"] -30 "day"] :score 100}}
           (#'magic/resolve-overloading
             {:dimensions {"Day" {}}}
             [{"Last30Days" {:filter ["something-made-up" ["dimension" "Day"] -720 "hour"] :score 90}}
              {"Last30Days" {:filter ["time-interval" ["dimension" "Day"] -30 "day"] :score 100}}]))))
  (testing "When no dimensions match, we rank on score alone"
    (is (= {"Avg" {:metric ["avg" ["dimension" "FROOB"]] :score 100}}
           (#'magic/resolve-overloading
             {:dimensions {"X" {}}}
             [{"Avg" {:metric ["/"
                               ["sum" ["dimension" "Discount"]]
                               ["sum" ["dimension" "Income"]]] :score 1}}
              {"Avg" {:metric ["/"
                               ["sum" ["dimension" "Discount"]]
                               ["sum" ["dimension" "Income"]]] :score 2}}
              {"Avg" {:metric ["avg" ["dimension" "FROOB"]] :score 100}}])))))

;;; -------------------- make-cards and related (e.g. card-candidates) --------------------

(deftest simple-one-field-query-card-candidates-test
  (mt/dataset sample-dataset
    (testing "A model with a single field that matches all potential bindings"
      (let [source-query {:database (mt/id)
                          :query    {:source-table (mt/id :people)
                                     :fields       [(mt/id :people :latitude)]}
                          :type     :query}]
        (mt/with-temp
          [Card {card-id :id :as card} {:table_id        (mt/id :products)
                                        :dataset_query   source-query
                                        :result_metadata (mt/with-test-user
                                                           :rasta
                                                           (result-metadata-for-query
                                                             source-query))
                                        :dataset         true}]
          (let [dashboard-template (some
                                     #(when (-> % :dashboard-template-name #{"GenericTable"}) %)
                                     (dashboard-templates/get-dashboard-templates ["table"]))
                {:keys [dimensions metrics] :as context} (#'magic/make-context (#'magic/->root card) dashboard-template)]
            (testing "In this case, we are only binding to a single dimension, Lat, which matches the LATITUDE field."
              (is (= #{"Lat"} (set (keys dimensions))))
              (is (=? {"Lat" {:matches [{:id (mt/id :people :latitude) :name "LATITUDE"}]}} dimensions)))
            (testing "These are the metrics that were merged without conflict. Note that not all are actually applicable
                      in our scenario."
              (is (=? {"Count"            {:metric ["count"], :score 100},
                       "CountDistinctFKs" {:metric ["distinct" ["dimension" "FK"]], :score 100},
                       "Sum"              {:metric ["sum" ["dimension" "GenericNumber"]], :score 100},
                       "Avg"              {:metric ["avg" ["dimension" "GenericNumber"]], :score 100}}
                      metrics)))
            (testing "The only metric that will actually be used in our scenario is Count as it is dimensionless.
                      Our other bound dimension is Lat, which does not satisfy the other required dimensions of either
                      FK or GenericNumber."
              (is (= [["Count" {:metric ["count"] :score 100}]]
                     (->> (seq metrics)
                          (filter
                            (fn [metric]
                              (every? dimensions (dashboard-templates/collect-dimensions metric))))))))
            (testing "A card spec that requires only a dimensionless metric will not bind to any dimensions."
              (let [card-def {:title   "A dimensionless quantity card"
                              :metrics ["Count"]
                              :score   100}]
                (is (=? [{:title         "A dimensionless quantity card"
                          :metrics       [{:metric ["count"] :op "count"}]
                          :dimensions    []
                          :dataset_query {:type     :query
                                          :database (mt/id)
                                          :query    {:source-table (format "card__%s" card-id)
                                                     :aggregation  [["count"]]}}}]
                        (#'magic/card-candidates context card-def)))))
            (testing "A card spec that requires both the Count and Lat metrics and dimensions will produce cards that
                      use those bound dimensions."
              (let [card-def {:title      "Some sort of card"
                              :metrics    ["Count"]
                              :dimensions [{"Lat" {}}]
                              :score      100}]
                (is (=? [{:title         "Some sort of card"
                          :metrics       [{:metric ["count"] :op "count"}]
                          :dimensions    ["LATITUDE"]
                          :dataset_query {:type     :query
                                          :database (mt/id)
                                          :query    {:source-table (format "card__%s" card-id)
                                                     :breakout     [[:field (mt/id :people :latitude) nil]]
                                                     :aggregation  [["count"]]}}}]
                        (#'magic/card-candidates context card-def)))))
            (testing "A card spec that requires dimensions we haven't bound to will produce no cards."
              (let [card-def {:title      "Some sort of card"
                              :metrics    ["Count"]
                              :dimensions [{"Lat" {}} {"Lon" {}}]
                              :score      100}]
                (is (=? [] (#'magic/card-candidates context card-def)))))))))))

;;; -------------------- Ensure generation of subcards via related (includes indepth, drilldown) --------------------

(deftest related-card-generation-test
  (testing "Ensure that the `related` function is called and the right cards are created."
    (mt/with-test-user :rasta
      (mt/dataset sample-dataset
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
