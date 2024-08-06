(ns metabase.lib.query-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   #_{:clj-kondo/ignore [:unused-namespace]}
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.metadata-providers.merged-mock :as merged-mock]
   [metabase.lib.util :as lib.util]
   [metabase.types :as types]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(comment lib/keep-me)

(deftest ^:parallel describe-query-test
  (let [query (-> lib.tu/venues-query
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
  (let [query (-> (lib/query lib.tu/metadata-provider-with-mock-cards (meta/table-metadata :venues))
                  (lib/filter (lib/= (meta/field-metadata :venues :name) "Toucannery"))
                  (lib/breakout (meta/field-metadata :venues :category-id))
                  (lib/limit 100)
                  (lib/append-stage))
        card-id (:id (lib.tu/mock-cards :orders))]
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
    (let [clause (as-> (lib/expression lib.tu/venues-query "CC" (lib/+ 1 1)) $q
                   (lib/join-clause $q [(lib/= (meta/field-metadata :venues :id)
                                               (lib/expression-ref $q "CC"))]))
          query (lib/join lib.tu/venues-query clause)
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

(deftest ^:parallel converted-query-leaves-stage-metadata-refs-alone
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                  (lib/expression "BirthMonth" (lib/+ 1 1))
                  (as-> $q (lib/breakout $q (m/find-first #(= (:name %) "BirthMonth") (lib/breakoutable-columns $q))))
                  (lib/aggregate (lib/count))
                  (lib/append-stage)
                  (lib/aggregate (lib/count)))]
    (is (=? {:stages [{:lib/stage-metadata {:columns [{:field-ref [:expression "BirthMonth" {:base-type :type/Integer}]} {}]}} {}]}
          (lib/query meta/metadata-provider (assoc-in (lib.convert/->pMBQL (lib.convert/->legacy-MBQL query))
                                                      [:stages 0 :lib/stage-metadata]
                                                      {:columns [{:base-type :type/Float,
                                                                  :display-name "BirthMonth",
                                                                  :field-ref [:expression
                                                                              "BirthMonth"
                                                                              {:base-type :type/Integer}],
                                                                  :name "BirthMonth",
                                                                  :lib/type :metadata/column}
                                                                 {:base-type :type/Integer,
                                                                  :display-name "Count",
                                                                  :field-ref [:aggregation 0],
                                                                  :name "count",
                                                                  :semantic-type :type/Quantity,
                                                                  :lib/type :metadata/column}],
                                                       :lib/type :metadata/results}))))))

(deftest ^:parallel stage-count-test
  (is (= 1 (lib/stage-count lib.tu/venues-query)))
  (is (= 2 (lib/stage-count (lib/append-stage lib.tu/venues-query))))
  (is (= 3 (lib/stage-count (lib/append-stage (lib/append-stage lib.tu/venues-query))))))

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
                       ; source-card not visible
                       (assoc :source-card 999999999)
                       (dissoc :source-table))))))
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
             :lib/metadata meta/metadata-provider
             :database     (meta/id)
             :stages       [{:lib/type    :mbql.stage/mbql
                             :source-card 1}]
             :info         {:card-id 1000}}
            (lib.query/query meta/metadata-provider (assoc (lib.tu.macros/mbql-query nil {:source-table "card__1"})
                                                           :info {:card-id 1000}))))))

(deftest ^:parallel convert-from-legacy-remove-type-test
  (testing "legacy keys like :type and :query should get removed"
    (is (= {:database               (meta/id)
            :lib/type               :mbql/query
            :lib/metadata           meta/metadata-provider
            :stages                 [{:lib/type :mbql.stage/mbql, :source-table 74040}]
            :lib.convert/converted? true}
           (lib.query/query meta/metadata-provider
             {:database 74001, :type :query, :query {:source-table 74040}})))))

(deftest ^:parallel can-save-test
  (mu/disable-enforcement
    (are [can-save? query]
      (= can-save?  (lib.query/can-save query))
      true lib.tu/venues-query
      false (assoc lib.tu/venues-query :database nil)           ; database unknown - no permissions
      true (lib/native-query meta/metadata-provider "SELECT")
      false (lib/native-query meta/metadata-provider ""))))

(deftest ^:parallel can-preview-test
  (mu/disable-enforcement
    (testing "can-preview"
      (is (= true (lib/can-preview lib.tu/venues-query)))
      (testing "with an offset expression"
        (let [offset-query (lib/expression lib.tu/venues-query "prev_price"
                                           (lib/offset (meta/field-metadata :venues :price) -1))]
          (testing "without order-by = false"
            (is (= false (lib/can-preview offset-query))))
          (testing "with order-by = true"
            (is (= true  (-> offset-query
                             (lib/order-by (meta/field-metadata :venues :latitude))
                             lib/can-preview))))))
      (testing "with an offset expression in an earlier stage"
        (let [offset-query (-> lib.tu/venues-query
                               (lib/expression "prev_price" (lib/offset (meta/field-metadata :venues :price) -1))
                               (lib/breakout (lib.options/ensure-uuid [:expression {} "prev_price"]))
                               (lib/aggregate (lib/count))
                               lib/append-stage)]
          (testing "without order-by in that stage = false"
            (is (= false (lib/can-preview offset-query)))
            ;; order by in the other stage doesn't help
            (is (= false (-> offset-query
                             (lib/order-by -1 (meta/field-metadata :venues :latitude) :asc)
                             lib/can-preview))))
          (testing "with order-by in that stage = true"
            (is (= true  (-> offset-query
                             (lib/order-by 0 (meta/field-metadata :venues :latitude) :asc)
                             lib/can-preview)))))))))

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
                              :source-table 1
                              :aggregation  [[:count {:lib/uuid string?}]]
                              :filters      [[:=
                                              {:lib/uuid string?}
                                              [:field {:lib/uuid string?} 1]
                                              4]]}]}
                 (lib/query meta/metadata-provider x))
      {"lib/type" "mbql/query"
       "database" (meta/id)
       "stages"   [{"lib/type"     "mbql.stage/mbql"
                    "source-table" 1
                    "aggregation"  [["count" {}]]
                    "filters"      [["=" {} ["field" {} 1] 4]]}]}

      {:lib/type :mbql/query
       :database (meta/id)
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 1
                   :aggregation  [[:count {}]]
                   :filters      [[:=
                                   {}
                                   [:field {} 1]
                                   4]]}]}

      ;; denormalized legacy query
      {"type"     "query"
       "database" (meta/id)
       "query"    {"source-table" 1
                   "aggregation"  [["count"]]
                   "filter"       ["=" ["field" 1 nil] 4]}})))

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

#?(:clj
   (deftest ^:synchronized cache-test
     (let [query      (lib/query meta/metadata-provider (meta/table-metadata :orders))
           viz-cols   lib.metadata.calculation/visible-columns-method
           calls      (atom 0)
           exp-fields (into #{} cat
                            [(map #(meta/id :orders %)   (meta/fields :orders))
                             (map #(meta/id :people %)   (meta/fields :people))
                             (map #(meta/id :products %) (meta/fields :products))])]
       (testing "CLJ query cache"
         (testing "is properly attached, and is maplike"
           (is (= {} (-> query meta :lib/__cache))))

         (testing "is effective for visible-columns on a whole stage"
           (with-redefs [lib.metadata.calculation/visible-columns-method
                         (fn [query stage-number x options]
                           (when (= x (lib.util/query-stage query stage-number))
                             (swap! calls inc))
                           (viz-cols query stage-number x options))]
             (is (= 0 @calls))
             (is (= exp-fields
                    (into #{} (map :id) (lib/visible-columns query))))
             (is (= 1 @calls))
             (is (= exp-fields
                    (into #{} (map :id) (lib/visible-columns query))))
             (is (= 1 @calls))

             (testing "gets overwritten when the query changes"
               (reset! calls 0)
               (let [query'     (-> query
                                    (lib/aggregate (lib/count))
                                    (lib/append-stage))
                     agg-fields [{:name       "count"
                                  :lib/source :source/previous-stage}]]
                 (is (= 0 @calls))
                 (is (=? agg-fields
                         (lib/visible-columns query')))
                 (is (= 1 @calls))
                 (is (=? agg-fields
                         (lib/visible-columns query')))
                 (is (= 1 @calls))))

             (testing "but treats duplicate queries separately"
               (reset! calls 0)
               (let [query2 (lib/query meta/metadata-provider (meta/table-metadata :orders))]
                 (is (= 0 @calls))
                 ;; Call for the original query twice - no new calls recorded since it's cached.
                 (is (= exp-fields
                        (into #{} (map :id) (lib/visible-columns query))))
                 (is (= exp-fields
                        (into #{} (map :id) (lib/visible-columns query))))
                 (is (= 0 @calls))
                 ;; Call for the new query; that adds a call.
                 (is (= exp-fields
                        (into #{} (map :id) (lib/visible-columns query2))))
                 (is (= 1 @calls))
                 (is (= exp-fields
                        (into #{} (map :id) (lib/visible-columns query2))))
                 (is (= 1 @calls))))))))))
