(ns metabase.lib.query-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.invocation-tracker :as lib.metadata.invocation-tracker]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.metadata-providers.merged-mock :as merged-mock]
   [metabase.lib.util :as lib.util]
   [metabase.types.core :as types]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(comment lib/keep-me
         lib.metadata.calculation/keep-me)

(deftest ^:parallel describe-query-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
        ;; wrong arity: there's a bug in our Kondo config, see
        ;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1679022185079739?thread_ts=1679022025.317059&cid=C04DN5VRQM6
        query (-> #_{:clj-kondo/ignore [:invalid-arity]}
               (lib/filter query (lib/= (meta/field-metadata :venues :name) "Toucannery"))
                  (lib/breakout (meta/field-metadata :venues :category-id))
                  (lib/order-by (meta/field-metadata :venues :id))
                  (lib/limit 100))]
    (is (= (str "Venues,"
                " Sum of Price,"
                " Grouped by Category ID,"
                " Filtered by Name is Toucannery,"
                " Sorted by ID ascending,"
                " 100 rows")
           (lib/display-name query)
           (lib/describe-query query)
           (lib/suggested-name query)))))

(deftest ^:parallel notebook-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)}
                      {:lib/type :mbql.stage/mbql}
                      {:lib/type :mbql.stage/mbql}]}
          (lib/query meta/metadata-provider {:database (meta/id)
                                             :type     :query
                                             :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}}))))

(deftest ^:parallel with-different-table-test
  (let [query (-> (lib/query (lib.tu/metadata-provider-with-mock-cards) (meta/table-metadata :venues))
                  (lib/filter (lib/= (meta/field-metadata :venues :name) "Toucannery"))
                  (lib/breakout (meta/field-metadata :venues :category-id))
                  (lib/limit 100)
                  (lib/append-stage))
        card-id (:id (:orders (lib.tu/mock-cards)))]
    (is (= [{:lib/type :mbql.stage/mbql :source-table (meta/id :orders)}]
           (:stages (lib/with-different-table query (meta/id :orders)))))
    (is (= [{:lib/type :mbql.stage/mbql :source-card card-id}]
           (:stages (lib/with-different-table query (str "card__" card-id)))))))

(deftest ^:parallel type-fill-in-converted-test
  (is (=? {:stages [{:fields [[:field {:base-type :type/BigInteger
                                       :effective-type :type/BigInteger}
                               (meta/id :venues :id)]]
                     :filters [[:= {} [:expression {:base-type :type/Integer :effective-type :type/Integer} "math"] 2]]}]}
          (lib/query
           meta/metadata-provider
           (lib.convert/->pMBQL {:type :query
                                 :database (meta/id)
                                 :query {:source-table (meta/id :venues)
                                         :expressions {"math" [:+ 1 1]}
                                         :fields [[:field (meta/id :venues :id) nil]]
                                         :filters [[:= [:expression "math"] 2]]}}))))
  (testing "filling in works for nested join queries"
    (let [clause (as-> (lib/expression (lib.tu/venues-query) "CC" (lib/+ 1 1)) $q
                   (lib/join-clause $q [(lib/= (meta/field-metadata :venues :id)
                                               (lib/expression-ref $q "CC"))]))
          query (lib/join (lib.tu/venues-query) clause)
          ;; Make a legacy query but don't put types in :field and :expression
          converted-query (lib.convert/->pMBQL
                           (walk/postwalk
                            (fn [node]
                              (if (map? node)
                                (dissoc node :base-type :effective-type)
                                node))
                            (lib.convert/->legacy-MBQL query)))]
      (is (=? {:stages [{:joins [{:conditions [[:= {}
                                                [:field {:base-type :type/BigInteger} (meta/id :venues :id)]
                                                [:expression
                                                 {}
                                                 ;; TODO Fill these in?
                                                 ;; tech debt issue: #39376
                                                 #_{:base-type :type/Integer}
                                                 "CC"]]]}]}]}

              (lib/query meta/metadata-provider converted-query))))))

(deftest ^:parallel stage-count-test
  (is (= 1 (lib/stage-count (lib.tu/venues-query))))
  (is (= 2 (lib/stage-count (lib/append-stage (lib.tu/venues-query)))))
  (is (= 3 (lib/stage-count (lib/append-stage (lib/append-stage (lib.tu/venues-query)))))))

(deftest ^:parallel native?-test
  (testing "MBQL queries are not native"
    (is (not (lib.query/native? (lib/query meta/metadata-provider (meta/table-metadata :orders))))))
  (testing "SQL queries are native"
    (is (lib.query/native? (lib/native-query meta/metadata-provider "SELECT * FROM Orders;")))))

(deftest ^:parallel display-info-test
  (testing "display-info"
    (testing "on MBQL queries"
      (let [editable    (lib/query meta/metadata-provider (meta/table-metadata :orders))]
        (are [editable? query] (= {:is-native   false
                                   :is-editable editable?}
                                  (mu/disable-enforcement
                                    (lib/display-info query -1 query)))
          true  editable
          false (assoc editable :database 999999999)                       ; database unknown - no permissions
          false (assoc-in editable [:stages 0 :source-table] 999999999)    ; source-table not visible
          false (lib.util/update-query-stage
                 editable 0
                 #(-> %
                      ;; source-card not visible
                      (assoc :source-card 999999999)
                      (dissoc :source-table))))))))

(deftest ^:parallel display-info-test-2
  (testing "display-info"
    (testing "on native queries (#37765)"
      (let [editable              (lib/native-query meta/metadata-provider "SELECT * FROM Venues;")
            ;; Logic for the native-query mock borrowed from metabase.lib.native/has-write-permission-test
            mock-db-native-perms #(lib/native-query (lib.tu/mock-metadata-provider
                                                     meta/metadata-provider
                                                     {:database (merge (lib.metadata/database meta/metadata-provider) {:native-permissions %})})
                                                    "select * from x;")]
        (are [editable? query] (= {:is-native   true
                                   :is-editable editable?}
                                  (mu/disable-enforcement
                                    (lib/display-info query -1 query)))
          true  editable
          false (assoc editable :database 999999999) ; database unknown - no permissions
          false (mock-db-native-perms :none)         ; native-permissions explicitly set to :none
          false (mock-db-native-perms nil))))))      ; native-permissions not found on the database

(deftest ^:parallel convert-from-legacy-preserve-info-test
  (testing ":info key should be converted when converting from legacy to pMBQL"
    (is (=? {:lib/type     :mbql/query
             :lib/metadata lib.metadata.protocols/cached-metadata-provider?
             :database     (meta/id)
             :stages       [{:lib/type    :mbql.stage/mbql
                             :source-card 1}]
             :info         {:card-id 1000}}
            (lib.query/query meta/metadata-provider
                             {:database (meta/id)
                              :type     :query
                              :query    {:source-table "card__1"}
                              :info     {:card-id 1000}})))))

(deftest ^:parallel convert-from-legacy-remove-type-test
  (testing "legacy keys like :type and :query should get removed"
    (is (=? {:database               (meta/id)
             :lib/type               :mbql/query
             :lib/metadata           lib.metadata.protocols/cached-metadata-provider?
             :stages                 [{:lib/type :mbql.stage/mbql, :source-table 74040}]
             :lib.convert/converted? true
             :type                   (symbol "nil #_\"key is not present.\"")
             :query                  (symbol "nil #_\"key is not present.\"")}
            (lib.query/query meta/metadata-provider
                             {:database 74001, :type :query, :query {:source-table 74040}})))))

(deftest ^:parallel handle-null-collection-test
  (testing "collection: null doesn't cause errors #59675"
    (is (=? {:database               (meta/id)
             :lib/type               :mbql/query
             :lib/metadata           lib.metadata.protocols/cached-metadata-provider?
             :stages                 [{:lib/type :mbql.stage/native
                                       :native "select * from products limit 3;"}]
             :lib.convert/converted? true
             :type                   (symbol "nil #_\"key is not present.\"")
             :query                  (symbol "nil #_\"key is not present.\"")}
            (lib.query/query meta/metadata-provider
                             {:database 1703
                              :type :native
                              :native {:template-tags {}
                                       :query "select * from products limit 3;"
                                       :collection nil}})))))

(deftest ^:parallel can-run-test
  (mu/disable-enforcement
    #_{:clj-kondo/ignore [:equals-true]}
    (are [can-run? card-type query]
         (if (= card-type :question)
           (= can-run? (lib.query/can-run query card-type) (lib.query/can-preview query))
           (= can-run? (lib.query/can-run query card-type)))
      true  :question (lib.tu/venues-query)
      false :question (assoc (lib.tu/venues-query) :database nil) ; database unknown - no permissions
      true  :question (lib/native-query meta/metadata-provider "SELECT")
      false :question (lib/native-query meta/metadata-provider "")
      false :metric   (lib.tu/venues-query)
      true  :metric   (-> (lib.tu/venues-query)
                          (lib/aggregate (lib/count)))
      false :metric   (-> (lib.tu/venues-query)
                          (lib/aggregate (lib/count))
                          (lib/aggregate (lib/sum (meta/field-metadata :venues :id))))
      true  :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :people :birth-date)))
      true  :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :people :created-at)))
      true  :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :people :birth-date) :year)))
      true  :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :people :birth-date) :month-of-year)))
      false :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :people :created-at))
                          (lib/breakout (meta/field-metadata :people :birth-date)))
      false :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :people :name)))
      false  :metric  (-> (lib.tu/venues-query)
                          (lib/aggregate (lib/count))
                          (lib/append-stage)
                          (lib/aggregate (lib/count))))))

(deftest ^:parallel can-save-test
  (mu/disable-enforcement
    #_{:clj-kondo/ignore [:equals-true]}
    (are [can-save? card-type query]
         (= can-save? (lib.query/can-save query card-type))
      true  :question (lib.tu/venues-query)
      false :question (assoc (lib.tu/venues-query) :database nil)           ; database unknown - no permissions
      true  :question (lib/native-query meta/metadata-provider "SELECT")
      false :question (lib/native-query meta/metadata-provider "")
      false :metric   (lib.tu/venues-query)
      true  :metric   (-> (lib.tu/venues-query)
                          (lib/aggregate (lib/count)))
      true  :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :people :birth-date)))
      true  :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :people :created-at)))
      true  :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :people :birth-date) :year)))
      true  :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :people :birth-date) :month-of-year)))
      false :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :people :created-at))
                          (lib/breakout (meta/field-metadata :people :birth-date)))
      false :metric   (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :people :id)))
      false  :metric  (-> (lib.tu/venues-query)
                          (lib/aggregate (lib/count))
                          (lib/append-stage)
                          (lib/aggregate (lib/count))))))

(def ^:private query-for-preview
  "\"Christmas tree\" query with anything and everything hanging from its branches, for testing [[preview-query]]."
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/join (lib/join-clause (meta/table-metadata :products)
                                 [(lib/= (meta/field-metadata :orders :product-id)
                                         (meta/field-metadata :products :id))]))
      (lib/join (lib/join-clause (meta/table-metadata :people)
                                 [(lib/= (meta/field-metadata :orders :user-id)
                                         (meta/field-metadata :people :id))]))
      (lib/expression "Tax rate" (lib// (meta/field-metadata :orders :tax)
                                        (meta/field-metadata :orders :subtotal)))
      (lib/filter (lib/=  (meta/field-metadata :products :category) "Doohickey" "Gizmo"))
      (lib/filter (lib/<  (meta/field-metadata :orders :subtotal) 100))
      (lib/filter (lib/!= (meta/field-metadata :people :source) "Twitter"))
      (lib/aggregate (lib/count))
      (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
      (lib/breakout  (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :week))
      (lib/order-by (meta/field-metadata :orders :created-at))
      (lib/order-by (meta/field-metadata :products :category))
      (lib/limit 20)
      lib/append-stage
      (lib/filter (lib/> (lib.options/ensure-uuid [:field {:base-type :type/Number} "sum"]) 10000))
      (lib/aggregate (lib/count))))

(defn- test-preview [stage-number clause-type clause-index expecting]
  (let [preview (lib/preview-query query-for-preview stage-number clause-type clause-index)]
    (is (=? expecting preview))
    (is (-> expecting :stages (nth stage-number) keys set (conj :lib/type))
        (-> preview :stages (nth stage-number) keys set))))

(deftest ^:parallel preview-query-test-1-data
  (testing "stage 0"
    (testing ":data"
      (test-preview 0 :data nil
                    {:stages [{:source-table (meta/id :orders)}]}))))

(deftest ^:parallel preview-query-test-2-joins
  (testing "stage 0"
    (testing ":joins"
      (test-preview 0 :joins nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]}]})
      (test-preview 0 :joins 0
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{}]}]})
      (test-preview 0 :joins 1
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]}]}))))

(deftest ^:parallel preview-query-test-3-expressions
  (testing "stage 0"
    (testing ":expressions"
      (test-preview 0 :expressions nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]
                               :expressions  [vector?]}]}))))
(deftest ^:parallel preview-query-test-4-filters
  (testing "stage 0"
    (testing ":filters"
      (test-preview 0 :filters nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]
                               :expressions  [vector?]
                               :filters      [vector? vector? vector?]}]})
      (doseq [n (range 3)]
        (test-preview 0 :filters n
                      {:stages [{:source-table (meta/id :orders)
                                 :joins        [{} {}]
                                 :expressions  [vector?]
                                 :filters      (repeat (inc n) vector?)}]})))))

(deftest ^:parallel preview-query-test-5-breakout
  (testing "stage 0"
    ;; Breakouts are never previewed separately, but test them anyway.
    (testing ":breakout"
      (test-preview 0 :breakout nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]
                               :expressions  [vector?]
                               :filters      [vector? vector? vector?]
                               :breakout     [vector?]}]}))))

(deftest ^:parallel preview-query-test-6-aggregation
  (testing "stage 0"
    (testing ":aggregation"
      (test-preview 0 :aggregation nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]
                               :expressions  [vector?]
                               :filters      [vector? vector? vector?]
                               :aggregation  [vector? vector?]
                               :breakout     [vector?]}]})
      (doseq [n (range 2)]
        (test-preview 0 :aggregation n
                      {:stages [{:source-table (meta/id :orders)
                                 :joins        [{} {}]
                                 :expressions  [vector?]
                                 :filters      [vector? vector? vector?]
                                 :aggregation  (repeat (inc n) vector?)
                                 :breakout     [vector?]}]})))))

(deftest ^:parallel preview-query-test-7-order-by
  (testing "stage 0"
    (testing ":order-by"
      (test-preview 0 :order-by nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]
                               :expressions  [vector?]
                               :filters      [vector? vector? vector?]
                               :aggregation  [vector? vector?]
                               :breakout     [vector?]
                               :order-by     [vector? vector?]}]})
      (doseq [n (range 2)]
        (test-preview 0 :order-by n
                      {:stages [{:source-table (meta/id :orders)
                                 :joins        [{} {}]
                                 :expressions  [vector?]
                                 :filters      [vector? vector? vector?]
                                 :aggregation  [vector? vector?]
                                 :breakout     [vector?]
                                 :order-by     (repeat (inc n) vector?)}]})))))

(deftest ^:parallel preview-query-test-8-limit
  (testing "stage 0"
    (testing ":limit"
      (test-preview 0 :limit nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]
                               :expressions  [vector?]
                               :filters      [vector? vector? vector?]
                               :aggregation  [vector? vector?]
                               :breakout     [vector?]
                               :order-by     [vector? vector?]
                               :limit        20}]}))))

(deftest ^:parallel preview-query-test-9-second-stage-empty
  (testing "stage 1"
    (testing "joins (empty)"
      (test-preview 1 :joins nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]
                               :expressions  [vector?]
                               :filters      [vector? vector? vector?]
                               :aggregation  [vector? vector?]
                               :breakout     [vector?]
                               :order-by     [vector? vector?]
                               :limit        20}
                              {}]}))))

(deftest ^:parallel preview-query-test-10-second-stage-filters
  (testing "stage 1"
    (testing "filters"
      (test-preview 1 :filters nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]
                               :expressions  [vector?]
                               :filters      [vector? vector? vector?]
                               :aggregation  [vector? vector?]
                               :breakout     [vector?]
                               :order-by     [vector? vector?]
                               :limit        20}
                              {:filters      [vector?]}]}))))

(deftest ^:parallel preview-query-test-11-second-stage-aggregation
  (testing "stage 1"
    (testing "aggregation"
      (test-preview 1 :aggregation nil
                    {:stages [{:source-table (meta/id :orders)
                               :joins        [{} {}]
                               :expressions  [vector?]
                               :filters      [vector? vector? vector?]
                               :aggregation  [vector? vector?]
                               :breakout     [vector?]
                               :order-by     [vector? vector?]
                               :limit        20}
                              {:filters      [vector?]
                               :aggregation  [[:count {}]]}]}))))

(deftest ^:parallel normalize-test
  (testing "Normalize (including adding :lib/uuids) when creating a new query"
    (are [x] (=? {:lib/type :mbql/query
                  :database (meta/id)
                  :stages   [{:lib/type     :mbql.stage/mbql
                              :source-table (meta/id :orders)
                              :aggregation  [[:count {:lib/uuid string?}]]
                              :filters      [[:=
                                              {:lib/uuid string?}
                                              [:field {:lib/uuid string?} (meta/id :orders :quantity)]
                                              4]]}]}
                 (lib/query meta/metadata-provider x))
      {"lib/type" "mbql/query"
       "database" (meta/id)
       "stages"   [{"lib/type"     "mbql.stage/mbql"
                    "source-table" (meta/id :orders)
                    "aggregation"  [["count" {}]]
                    "filters"      [["=" {} ["field" {} (meta/id :orders :quantity)] 4]]}]}

      {:lib/type :mbql/query
       :database (meta/id)
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table (meta/id :orders)
                   :aggregation  [[:count {}]]
                   :filters      [[:=
                                   {}
                                   [:field {} (meta/id :orders :quantity)]
                                   4]]}]}

      ;; denormalized legacy query
      {"type"     "query"
       "database" (meta/id)
       "query"    {"source-table" (meta/id :orders)
                   "aggregation"  [["count"]]
                   "filter"       ["=" ["field" (meta/id :orders :quantity) nil] 4]}})))

(deftest ^:parallel coerced-fields-effective-type-test
  (let [effective-type (types/effective-type-for-coercion :Coercion/UNIXSeconds->DateTime)
        mp (merged-mock/merged-mock-metadata-provider
            meta/metadata-provider
            {:fields [{:id                (meta/id :people :id)
                       :coercion-strategy :Coercion/UNIXSeconds->DateTime
                       :effective-type    effective-type}]})
        ;; Query of a following form is input to `lib/query` in the wild.
        query {:database (meta/id)
               :type     "query"
               :query    {:source-table (meta/id :people)
                          :filter       ["and"
                                         ["between"
                                          ["field" (meta/id :people :id) {:base-type "type/BigInteger"}]
                                          "1969-10-12"
                                          "1971-10-12"]]}}]
    (testing "Effective type is added to coerced fields during legacy query transformation (part of issue #42931)"
      (is (=? {:stages [{:filters [[:between
                                    {:lib/uuid string?}
                                    [:field
                                     {:lib/uuid       string?
                                      :base-type      :type/BigInteger
                                      :effective-type effective-type}
                                     (meta/id :people :id)]
                                    "1969-10-12"
                                    "1971-10-12"]]}]}
              (lib/query mp query))))))

(deftest ^:parallel metric-based-question-test
  (let [question-id 100
        model-id 101
        table-based-metric-id 102
        model-based-metric-id 103
        base-card {:name        "Sum of Cans"
                   :database-id (meta/id)
                   :table-id    (meta/id :venues)
                   :dataset-query
                   (-> (lib.tu/venues-query)
                       (lib/filter (lib/= (meta/field-metadata :venues :price) 4))
                       (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
                       (lib/breakout (meta/field-metadata :venues :category-id))
                       (lib/breakout (meta/field-metadata :venues :latitude))
                       (lib/breakout (meta/field-metadata :venues :longitude))
                       lib.convert/->legacy-MBQL)}
        base-mp (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [(assoc base-card :id question-id           :type :question)
                          (assoc base-card :id model-id              :type :model)
                          (assoc base-card :id table-based-metric-id :type :metric)]})
        mp (lib.tu/mock-metadata-provider
            base-mp
            {:cards [{:id          model-based-metric-id
                      :name        "Model based metric"
                      :database-id (meta/id)
                      :table-id    (meta/id :venues)
                      :source-card-id model-id
                      :dataset-query
                      (-> (lib/query base-mp (lib.metadata/card base-mp model-id))
                          (lib/aggregate (lib/count))
                          lib.convert/->legacy-MBQL)
                      :type :metric}]})]
    (is (=? {:lib/type :mbql/query
             :database (meta/id)
             :stages
             [{:lib/type :mbql.stage/mbql
               :source-table (meta/id :venues)
               :aggregation [[:metric {} table-based-metric-id]]
               :breakout [[:field {} (meta/id :venues :category-id)]
                          [:field {} (meta/id :venues :latitude)]
                          [:field {} (meta/id :venues :longitude)]]}]}
            (lib/query base-mp (lib.metadata/card base-mp table-based-metric-id))))
    (is (=? {:lib/type :mbql/query
             :database (meta/id)
             :stages
             [{:lib/type :mbql.stage/mbql
               :source-card model-id
               :aggregation [[:metric {} model-based-metric-id]]}]}
            (lib/query base-mp (lib.metadata/card mp model-based-metric-id))))))

(deftest ^:parallel automatically-wrap-metadata-providers-in-cached-metadata-provider-test
  (testing "Automatically wrap metadata providers to make them CachedMetadataProviders"
    (let [mp meta/metadata-provider]
      (is (not (lib.metadata.protocols/cached-metadata-provider? mp)))
      (let [query (lib/query mp (meta/table-metadata :venues))]
        (is (lib.metadata.protocols/cached-metadata-provider? (lib.metadata/->metadata-provider query)))))))

(deftest ^:parallel automatically-wrap-metadata-providers-in-cached-metadata-provider-test-2
  (testing "Re-wrap things that are CachedMetadataProviders IF they do not have a cache"
    (let [mp (lib.metadata.invocation-tracker/invocation-tracker-provider
              (lib.tu/mock-metadata-provider {}))]
      (is (lib.metadata.protocols/cached-metadata-provider? mp))
      (is (not (lib.metadata.protocols/cached-metadata-provider-with-cache? mp)))
      (is (= (lib.metadata.cached-provider/cached-metadata-provider mp)
             (:lib/metadata (#'lib.query/ensure-cached-metadata-provider {:lib/metadata mp})))))))

(deftest ^:parallel automatically-wrap-metadata-providers-in-cached-metadata-provider-test-3
  (testing "Do-not re-wrap things that already have a cache"
    (let [mp (lib.metadata.invocation-tracker/invocation-tracker-provider
              (lib.metadata.cached-provider/cached-metadata-provider
               (lib.tu/mock-metadata-provider {})))]
      (is (lib.metadata.protocols/cached-metadata-provider? mp))
      (is (lib.metadata.protocols/cached-metadata-provider-with-cache? mp))
      (is (identical? mp (:lib/metadata (#'lib.query/ensure-cached-metadata-provider {:lib/metadata mp})))))))

(deftest ^:parallel preserve-database-id-with-invalid-metadata-provider-test
  (mu/disable-enforcement
    (is (=? {:database 1
             :stages   [{:source-table 2, :lib/type :mbql.stage/mbql}]
             :lib/type :mbql/query}
            (lib.query/query (lib.tu/mock-metadata-provider {})
                             {"database" 1, "type" "query", "query" {"source-table" 2}})))))

(deftest ^:parallel discard-invalid-clauses-on-conversion-from-mbql-4-test
  (testing "Invalid expressions that do not get normalized correctly (e.g. :sum inside :expressions) should get dropped"
    (mu/disable-enforcement
      (let [query {"database" 1
                   "type"     "query"
                   "query"    {"source-table" 2
                               "expressions"  {"booking" ["sum" ["field" 3 {"base-type" "type/BigInteger"}]]}}}
            mp    (lib.tu/mock-metadata-provider {})]
        (is (= {:lib/type               :mbql/query,
                :stages                 [{:lib/type :mbql.stage/mbql, :source-table 2}]
                :database               1
                :lib.convert/converted? true
                :lib/metadata           (lib.metadata.cached-provider/cached-metadata-provider mp)}
               (lib.query/query mp query)))))))
