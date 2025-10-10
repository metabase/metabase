(ns metabase.lib.js-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [goog.object :as gobject]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.js :as lib.js]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.test-runner.assert-exprs.approximately-equal]
   [metabase.test.util.js :as test.js]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel query=-test
  (doseq [q1 [nil js/undefined]
          q2 [nil js/undefined]]
    (is (lib.js/query= q1 q2))))

(deftest ^:parallel query=-test-2
  (testing "explicit fields vs. implied fields"
    (let [q1 #js {"query" #js {"source-table" 1}}
          q2 #js {"query" #js {"source-table" 1
                               "fields" #js [#js ["field" 1 nil]
                                             #js ["field" 2 nil]
                                             #js ["field" 3 nil]
                                             #js ["field" 4 nil]
                                             #js ["field" 4 nil] ; duplicates are okay
                                             #js ["field" 4 nil]
                                             #js ["field" 5 nil]
                                             #js ["field" 6 nil]
                                             #js ["field" 7 nil]]}}
            ;; Note that the order is not relevant; they get grouped.
            ;; Duplicates are okay, and are tracked.
          field-ids #js [1 2 6 7 3 5 4 4 4]]
      (is (not (lib.js/query= q1 q2))
          "the field-ids must be provided to populate q1")
      (is (lib.js/query= q1 q1 field-ids))
      (is (not (lib.js/query= q1 q2 (conj (vec field-ids) 2)))
          "duplicates are tracked, so an extra dupe breaks it"))))

(deftest ^:parallel query=-test-3
  (testing "missing and extra fields"
    (let [q1 #js {"query" #js {"source-table" 1
                               "fields" #js [#js ["field" 1 nil]
                                             #js ["field" 2 nil]]}}

          ;; Same fields, different order.
          q2 #js {"query" #js {"source-table" 1
                               "fields" #js [#js ["field" 2 nil]
                                             #js ["field" 1 nil]]}}
          ;; Different fields
          q3 #js {"query" #js {"source-table" 1
                               "fields" #js [#js ["field" 3 nil]
                                             #js ["field" 1 nil]]}}]
      (is (lib.js/query= q1 q2))
      (is (not (lib.js/query= q1 q3)))
      (is (not (lib.js/query= q2 q3))))))

(deftest ^:parallel query=-test-4
  (testing "lib/uuids are ignored for query="
    (testing "sanity check: legacy queries should be equal"
      (let [q1 #js {"query" #js {"source-table" 1
                                 "aggregation"  #js [#js ["count"]]
                                 "breakout"     #js [#js ["field" 3 nil]]
                                 "expressions"  #js {"some_expr" #js ["field" 12 nil]}}}
            q2 #js {"query" #js {"source-table" 1
                                 "aggregation"  #js [#js ["count"]]
                                 "breakout"     #js [#js ["field" 3 nil]]
                                 "expressions"  #js {"some_expr" #js ["field" 12 nil]}}}]
        (is (lib.js/query= q1 q2))))
    (testing "on pMBQL queries"
      (let [q1 (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                   (lib/expression "some_expr" (lib/+ (meta/field-metadata :orders :subtotal) 1))
                   (lib/aggregate (lib/count))
                   (lib/breakout (meta/field-metadata :products :category)))
            q2 (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                   (lib/expression "some_expr" (lib/+ (meta/field-metadata :orders :subtotal) 1))
                   (lib/aggregate (lib/count))
                   (lib/breakout (meta/field-metadata :products :category)))]
        (is (lib.js/query= q1 q2))))))

(deftype FakeJoin [guts]
  Object
  (raw [_this] guts))

(deftest ^:parallel query=-unwrapping-test
  (testing "JS wrapper types like Join get unwrapped"
    ;; This doesn't use the real Join classes, just pretends it has one.
    (let [join         #js {"alias" "Products"
                            "condition" #js ["=" #js ["field" 7 nil] #js ["field" 19 nil]]}
          join-class   (FakeJoin. join)
          basic-query  #js {"type"  "query"
                            "query" #js {"joins" #js [join]}}
          classy-query #js {"type"  "query"
                            "query" #js {"joins" #js [join-class]}}]
      (is (not= join join-class))
      (is (not= (js->clj join) (js->clj join-class)))
      (is (lib.js/query= basic-query classy-query)))))

(defn- query-with-field-opts [opts]
  #js {"type" "query"
       "query" #js {"source-table" 1
                    "filter" #js ["=" #js ["field" 12 opts] 7]}})

(deftest ^:parallel query=-field-types-test
  (testing "equal field types are equal"
    (is (lib.js/query= (query-with-field-opts #js {"base-type" "type/Text"})
                       (query-with-field-opts #js {"base-type" "type/Text"})))
    (is (lib.js/query= (query-with-field-opts #js {"effective-type" "type/Float"})
                       (query-with-field-opts #js {"effective-type" "type/Float"}))))

  (testing "mismatched field types are not equal"
    (is (not (lib.js/query= (query-with-field-opts #js {"base-type" "type/Text"})
                            (query-with-field-opts #js {"base-type" "type/Float"}))))
    (is (not (lib.js/query= (query-with-field-opts #js {"effective-type" "type/Text"})
                            (query-with-field-opts #js {"effective-type" "type/Float"})))))

  (testing "missing field types are equal"
    (is (lib.js/query= (query-with-field-opts #js {"base-type" "type/Text"})
                       (query-with-field-opts #js {})))
    (is (lib.js/query= (query-with-field-opts #js {})
                       (query-with-field-opts #js {"base-type" "type/Text"})))
    (is (lib.js/query= (query-with-field-opts #js {"effective-type" "type/Text"})
                       (query-with-field-opts nil)))
    (is (lib.js/query= (query-with-field-opts #js {})
                       (query-with-field-opts #js {"effective-type" "type/Text"})))
    (is (lib.js/query= (query-with-field-opts #js {})
                       (query-with-field-opts nil)))))

(deftest ^:parallel available-join-strategies-test
  (testing "available-join-strategies returns an array of opaque strategy objects (#32089)"
    (let [strategies (lib.js/available-join-strategies (lib.tu/query-with-join) -1)]
      (is (array? strategies))
      (is (= [{:lib/type :option/join.strategy, :strategy :left-join, :default true}
              {:lib/type :option/join.strategy, :strategy :right-join}
              {:lib/type :option/join.strategy, :strategy :inner-join}]
             (vec strategies))))))

(deftest ^:parallel required-native-extras-test
  (let [db                (update meta/database :features conj :native-requires-specified-collection)
        metadata-provider (lib.tu/mock-metadata-provider {:database db})
        extras            (lib.js/required-native-extras (:id db) metadata-provider)]
    ;; apparently #js ["collection"] is not equal to #js ["collection"]
    (is (= js/Array
           (type extras))
        "should be a JS array")
    (is (= ["collection"]
           (js->clj extras)))))

(defn- add-undefined-params
  "This simulates the FE setting some parameters to js/undefined."
  [template-tags param-name]
  (doto (gobject/get template-tags param-name)
    (gobject/add "options" js/undefined)
    (gobject/add "default" js/undefined))
  template-tags)

(deftest ^:parallel template-tags-test
  (testing "Snippets in template tags round trip correctly (#33546)"
    (let [db meta/database
          snippet-name "snippet: my snippet"
          snippets {snippet-name
                    {:type :snippet
                     :name "snippet: my snippet"
                     :id "fd5e96f7-08f8-486b-9919-b2ab72857db4"
                     :display-name "Snippet: My Snippet"
                     :snippet-name "my snippet"
                     :snippet-id 1}}
          query (lib.js/with-template-tags
                  (lib.js/native-query (:id db) meta/metadata-provider "select * from foo {{snippet: my snippet}}")
                  (add-undefined-params (clj->js snippets) snippet-name))]
      (is (= snippets
             (get-in query [:stages 0 :template-tags])))
      (is (test.js/= (clj->js snippets)
                     (lib.js/template-tags query))))))

(deftest ^:parallel column-metadata?-test
  (is (true? (lib.js/column-metadata? (meta/field-metadata :venues :id))))
  (is (false? (lib.js/column-metadata? 1))))

(deftest ^:parallel cljs-key->js-key-test
  (is (= "isManyPks"
         (#'lib.js/cljs-key->js-key :many-pks?))))

(deftest ^:parallel string-filter-clauses-test
  (doseq [tag                          [:contains :starts-with :ends-with :does-not-contain]
          opts                         [{} {:case-sensitive false}]
          :let [field    [:field {} (meta/id :venues :name)]
                js-field #js ["field" (meta/id :venues :name) #js {"base-type" "type/Text"}]]
          [label legacy-expr exp-form] [["binary"
                                         (apply array (name tag) js-field "hotel"
                                                (when (seq opts) [(clj->js opts)]))
                                         [tag opts field "hotel"]]
                                        ["varargs"
                                         #js [(name tag) (clj->js opts) js-field "hotel" "motel"]
                                         [tag opts field "hotel" "motel"]]]]
    (testing (str tag " in " label " form with" (when (empty? opts) "out") " options")
      (let [legacy-query      #js {:type  "query"
                                   :query #js {:source_table (meta/id :venues)
                                               :filter       legacy-expr}}
            query             (lib.js/query (meta/id) meta/metadata-provider legacy-query)
            returned          (lib.js/legacy-query query)]
        (is (=? {:lib/type :mbql/query
                 :stages [{:lib/type     :mbql.stage/mbql
                           :filters      [exp-form]
                           :source-table (meta/id :venues)}]}
                query))
        ;; TODO: Use =? JS support once it exists (metabase/hawk #24)
        (is (=? (js->clj legacy-expr)
                (-> returned js->clj (get "query") (get "filter"))))))))

(deftest ^:parallel filter-drill-details-test
  (testing ":value field on the filter drill"
    (testing "returns directly for most values"
      (is (=? 7
              (.-value (lib.js/filter-drill-details {:value 7}))))
      (is (=? "some string"
              (.-value (lib.js/filter-drill-details {:value "some string"})))))
    (testing "converts :null keyword used by drill-thrus back to JS null"
      (is (=? nil
              (.-value (lib.js/filter-drill-details {:value :null})))))))

(deftest ^:parallel legacy-ref-test
  (let [segment-id 100

        segment-definition
        {:source-table (meta/id :venues)
         :aggregation  [[:count]]
         :filter       [:and
                        [:> [:field (meta/id :venues :id) nil] [:* [:field (meta/id :venues :price) nil] 11]]
                        [:contains [:field (meta/id :venues :name) nil] "BBQ" {:case-sensitive true}]]}

        metric-id 101

        metric-definition
        (-> (lib.tu/venues-query)
            (lib/filter (lib/= (meta/field-metadata :venues :price) 4))
            (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
            lib.convert/->legacy-MBQL)

        metadata-provider
        (lib.tu/mock-metadata-provider
         meta/metadata-provider
         {:segments [{:id          segment-id
                      :name        "PriceID-BBQ"
                      :table-id    (meta/id :venues)
                      :definition  segment-definition
                      :description "The ID is greater than 11 times the price and the name contains \"BBQ\"."}]
          :cards [{:id            metric-id
                   :name          "Sum of Cans"
                   :database-id   (meta/id)
                   :table-id      (meta/id :venues)
                   :dataset-query metric-definition
                   :description   "Number of toucans plus number of pelicans"
                   :type          :metric}]})

        query (lib/query metadata-provider (meta/table-metadata :venues))

        metric-query (lib/query metadata-provider (lib.metadata/card metadata-provider metric-id))

        array-checker #(when (array? %) (js->clj %))
        to-legacy-refs (comp array-checker #(lib.js/legacy-ref query -1 %))]
    (testing "field refs come with options"
      (is (= [["field" (meta/id :venues :id) {"base-type" "type/BigInteger"}]
              ["field" (meta/id :venues :name) {"base-type" "type/Text"}]
              ["field" (meta/id :venues :category-id) {"base-type" "type/Integer"}]
              ["field" (meta/id :venues :latitude) {"base-type" "type/Float"}]
              ["field" (meta/id :venues :longitude) {"base-type" "type/Float"}]
              ["field" (meta/id :venues :price) {"base-type" "type/Integer"}]]
             (->> query lib/returned-columns (map to-legacy-refs)))))
    (testing "segment refs come without options"
      (is (= [["segment" segment-id]]
             (->> query lib/available-segments (map to-legacy-refs)))))
    (testing "metric refs come without options"
      (is (= [["metric" metric-id]]
             (->> metric-query lib/available-metrics (map to-legacy-refs)))))
    (testing "aggregation references (#37698)"
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                      (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
                      ;; The display-name set here gets lost when the corresponding column
                      ;; is converted to a ref. Currently there is no option that would
                      ;; survive the aggregation -> column -> ref -> legacy ref conversion
                      ;; (cf. column-metadata->aggregation-ref and options->legacy-MBQL).
                      #_(lib/aggregate (lib.options/update-options (lib/avg (meta/field-metadata :venues :price))
                                                                   assoc :display-name "avg price")))]
        (is (= [["aggregation" 0]
                ;; add this back when the second aggregation is added back
                #_["aggregation-options" ["aggregation 1"] {"display-name" "avg price"}]]
               (map (comp array-checker #(lib.js/legacy-ref query -1 %))
                    (lib.js/returned-columns query -1))))))
    (let [legacy-refs (->> query lib/available-segments (map #(lib.js/legacy-ref query -1 %)))]
      (testing "legacy segment refs come without options"
        (is (= [["segment" segment-id]] (map array-checker legacy-refs)))))
    (let [legacy-refs (->> metric-query lib/available-metrics (map #(lib.js/legacy-ref query -1 %)))]
      (testing "metric refs come without options"
        (is (= [["metric" metric-id]] (map array-checker legacy-refs)))))))

(deftest ^:parallel source-table-or-card-id-test
  (testing "returns the table-id as a number"
    (are [query] (= (meta/id :venues) (lib.js/source-table-or-card-id query))
      (lib.tu/venues-query)
      (lib/append-stage (lib.tu/venues-query))))
  (testing "returns the card-id in the legacy string form"
    (are [query] (= "card__1" (lib.js/source-table-or-card-id query))
      (lib.tu/query-with-source-card)
      (lib/append-stage (lib.tu/query-with-source-card))))
  (testing "returns nil for questions starting from a native query"
    (are [query] (nil? (lib.js/source-table-or-card-id query))
      (lib.tu/native-query)
      (lib/append-stage (lib.tu/native-query)))))

(deftest ^:parallel expression-clause-normalization-test
  (are [x y] (do
               (is (mr/validate :metabase.lib.schema.expression/expression y))
               (is (=? x y)))

    [:time-interval {} [:field {} int?] :current :day]
    (lib.js/expression-clause "time-interval" [(meta/field-metadata :products :created-at) "current" "day"] nil)

    [:time-interval {} [:field {} int?] 10 :day]
    (lib.js/expression-clause "time-interval" [(meta/field-metadata :products :created-at) 10 "day"] nil)

    [:relative-time-interval {} [:field {} int?] 10 :day 10 :month]
    (lib.js/expression-clause "relative-time-interval" [(meta/field-metadata :products :created-at) 10 "day" 10 "month"] nil)

    [:relative-datetime {} :current :day]
    (lib.js/expression-clause "relative-datetime" ["current" "day"] nil)

    [:relative-datetime {} 10 :day]
    (lib.js/expression-clause "relative-datetime" [10 "day"] nil)

    [:interval {} 10 :day]
    (lib.js/expression-clause "interval" [10 "day"] nil)

    [:datetime-add {} [:field {} int?] 10 :day]
    (lib.js/expression-clause "datetime-add" [(meta/field-metadata :products :created-at) 10 "day"] nil)

    [:datetime-subtract {} [:field {} int?] 10 :day]
    (lib.js/expression-clause "datetime-subtract" [(meta/field-metadata :products :created-at) 10 "day"] nil)

    [:get-week {} [:field {} int?] :iso]
    (lib.js/expression-clause "get-week" [(meta/field-metadata :products :created-at) "iso"] nil)

    [:get-week {} [:field {} int?]]
    (lib.js/expression-clause "get-week" [(meta/field-metadata :products :created-at)] nil)

    [:get-day-of-week {} [:field {} int?] :iso]
    (lib.js/expression-clause "get-day-of-week" [(meta/field-metadata :products :created-at) "iso"] nil)

    [:get-day-of-week {} [:field {} int?]]
    (lib.js/expression-clause "get-day-of-week" [(meta/field-metadata :products :created-at)] nil)

    [:temporal-extract {} [:field {} int?] :day-of-week]
    (lib.js/expression-clause "temporal-extract" [(meta/field-metadata :products :created-at) "day-of-week"] nil)

    [:temporal-extract {} [:field {} int?] :day-of-week :iso]
    (lib.js/expression-clause "temporal-extract" [(meta/field-metadata :products :created-at) "day-of-week" "iso"] nil)

    [:during {} [:field {} int?] "2024-12-05T22:13:54" :minute]
    (lib.js/expression-clause "during" [(meta/field-metadata :products :created-at) "2024-12-05T22:13:54" "minute"] nil)

    [:datetime-diff {} [:field {} int?] [:field {} int?] :day]
    (lib.js/expression-clause "datetime-diff" [(meta/field-metadata :products :created-at) (meta/field-metadata :products :created-at) "day"] nil))

  (testing "normalizes recursively"
    (is (=?
         [:time-interval {} [:field {} int?]
          [:interval {} 10 :day]
          :day]
         (lib.js/expression-clause "time-interval" [(meta/field-metadata :products :created-at)
                                                    (lib.js/expression-clause "interval" [10 "day"] nil) "day"] nil)))))

(defn- js= [a b]
  (cond
    ;; Compare objects recursively for each key. If either object contains keys the other does not, that's false.
    (and (object? a) (object? b))
    (and (every? (fn [k] (and (gobject/containsKey b k)
                              (js= (gobject/get a k) (gobject/get b k))))
                 (js-keys a))
         (every? (fn [k] (gobject/containsKey a k))
                 (js-keys b)))

    ;; Compare arrays by length and then pairwise recursively.
    (and (array? a) (array? b))
    (and (= (count a) (count b))
         (every? boolean (map js= (seq a) (seq b))))

    ;; Default to Clojure's = which will compare strings, numbers, Clojure values, etc.
    ;; That will return false for mismatched types as well.
    :else (= a b)))

(deftest ^:parallel js=-metatest
  (testing "check js= works correctly (who tests the tests?)"
    (testing "should be true"
      #_{:clj-kondo/ignore [:equals-true]}
      (are [a b] (= true (js= a b))
        7 7
        0 0
        -1 -1
        nil nil
        js/undefined nil
        nil js/undefined
        "foo" "foo"
        true true
        false false

           ;; Objects
        #js {:foo "bar"}
        #js {:foo "bar"}
        #js {:foo "bar", :baz "quux"}
        #js {:foo "bar", :baz "quux"}
           ;; Arrays
        #js ["foo" #js [1 2 3]]
        #js ["foo" #js [1 2 3]]
           ;; Nesting
        #js [#js {:foo "bar", :baz #js [4 5]}, #js [1 2 3]]
        #js [#js {:foo "bar", :baz #js [4 5]}, #js [1 2 3]]))

    (testing "should be false"
      (are [a b] (= false (js= a b))
        7 8
        0 1
        -1 1
        nil {}
        "foo" "bar"
        true false
        false 7

           ;; Objects
        #js {:foo "bar"} #js {:foo "baz"} ; Different value
        #js {:foo "bar"} #js {}           ; Missing an a key in b
        #js {}           #js {:foo "bar"} ; Missing a b key in a
        #js {:foo nil}   #js {}           ; Missing is not the same as present-but-nil
        #js {}           #js {:foo nil}   ; And likewise in reverse

           ;; Arrays
        #js ["foo" "bar"] #js ["foo" "baz"] ; Different values
        #js ["foo" "bar"] #js ["foo"]       ; Different lengths
        #js ["foo"]       #js ["foo" "bar"]

           ;; Nesting
        #js [#js {:foo "bar", :baz #js [4 5 6]}, #js [1 2 3]]
        #js [#js {:foo "bar", :baz #js [4 5]}, #js [1 2 3]]))))

(deftest ^:parallel display-info-test
  (let [query    (lib/query meta/metadata-provider (meta/table-metadata :orders))
        by-name  (m/index-by :name (lib/visible-columns query))
        discount (by-name "DISCOUNT")]
    (testing "description is present in the display-info for a column"
      (is (= (:description discount)
             (.-description (lib.js/display-info query -1 discount))))

      (testing "but if missing from the input, it's missing from the display-info"
        (let [di (lib.js/display-info query -1 (dissoc discount :fingerprint))]
          (is (not (gobject/containsKey di "description"))))))

    (testing "fingerprint is included in display-info"
      (let [query      (lib/query meta/metadata-provider (meta/table-metadata :orders))
            by-dca     (m/index-by :lib/desired-column-alias
                                   (into []
                                         (lib.field.util/add-source-and-desired-aliases-xform query)
                                         (lib/visible-columns query)))
            discount   (by-dca "DISCOUNT")
            vendor     (by-dca "PRODUCTS__via__PRODUCT_ID__VENDOR")
            created-at (by-dca "CREATED_AT")]
        (testing "for number columns"
          (is (js= #js {:global #js {:distinctCount 479
                                     :nil%          0.898}
                        :type   #js {"type/Number" #js {:avg 5.161009803921569
                                                        :min 0.17
                                                        :max 61.7
                                                        :q1  2.978591571097236
                                                        :q3  7.337323315325942
                                                        :sd  3.053736975739119}}}
                   (.-fingerprint (lib.js/display-info query -1 discount)))))
        (testing "for string columns"
          (is (js= #js {:global #js {:distinctCount 200
                                     :nil%          0}
                        :type   #js {"type/Text" #js {:percentJson   0
                                                      :percentUrl    0
                                                      :percentEmail  0
                                                      :percentState  0
                                                      :averageLength 20.6}}}
                   (.-fingerprint (lib.js/display-info query -1 vendor)))))
        (testing "for datetime columns"
          (is (js= #js {:global #js {:distinctCount 10000
                                     :nil%          0}
                        :type   #js {"type/DateTime" #js {:earliest "2016-04-30T18:56:13.352Z"
                                                          :latest   "2020-04-19T14:07:15.657Z"}}}
                   (.-fingerprint (lib.js/display-info query -1 created-at)))))
        (testing "unless it's missing in the input"
          (let [di (lib.js/display-info query -1 (dissoc discount :fingerprint))]
            (is (not (gobject/containsKey di "fingerprint")))))))))

(deftest ^:parallel returned-columns-unique-names-test
  (testing "returned-columns should ensure the :name fields are unique (#37517)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/join (lib/join-clause (meta/table-metadata :orders)
                                               [(lib/= (meta/field-metadata :orders :id)
                                                       (lib/with-join-alias (meta/field-metadata :orders :id)
                                                                            "Orders"))])))]
      (is (= #{1}
             (->> (lib.js/returned-columns query -1)
                  (map :name)
                  frequencies
                  vals
                  set))))))

(deftest ^:parallel diagnose-expression-test
  (let [exprs (update-vals {"a" 1
                            "c" [:+ 0 1]
                            "b" [:+ [:expression "a"] [:expression "c"]]
                            "x" [:+ [:expression "b"] 1]
                            "s" [:+ [:expression "a"] [:expression "b"] [:expression "c"]]}
                           lib.convert/->pMBQL)
        query (reduce-kv (fn [query expr-name expr]
                           (lib/expression query 0 expr-name expr))
                         (lib.tu/venues-query)
                         exprs)
        c-pos (some (fn [[i e]]
                      (when (= (-> e lib.options/options :lib/expression-name) "c")
                        i))
                    (m/indexed (lib/expressions query)))]
    (testing "correct expression are accepted silently"
      (are [mode expr] (nil? (lib.js/diagnose-expression query 0 mode expr js/undefined))
        "expression"  (lib/* (meta/field-metadata :venues :price) 100)
        "aggregation" (lib/sum (meta/field-metadata :venues :price))
        "filter"      (lib/=  (meta/field-metadata :venues :price) 3)))
    (testing "type errors are reported"
      (are [mode expr] (-> (lib.js/diagnose-expression query 0 mode expr js/undefined)
                           .-message
                           string?)
        "expression"  (lib/* (meta/field-metadata :people :address) 100)))
    (testing "circular definition"
      (is (= "Cycle detected: c → x → b → c"
             (-> (lib.js/diagnose-expression
                  query 0 "expression"  (lib/+ (lib/expression-ref query "x") 1) c-pos)
                 .-message))))))

;; TODO: This wants `=?` to work on JS values. See https://github.com/metabase/hawk/issues/24
(deftest ^:parallel as-returned-test
  (testing `as-returned
    (let [simple-query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
          ;; Two-stage query with no aggregations in second stage.
          base          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                            (lib/aggregate (lib/count))
                            (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month)))
          base-cols     (lib/returned-columns base)
          two-stage     (-> base
                            lib/append-stage
                            (lib/filter (lib/> (m/find-first #(= (:name "count") %) base-cols)
                                               100)))
          two-stage-agg (lib/aggregate two-stage (lib/count))]
      (testing "does not change a query with no aggregations or breakouts"
        (doseq [stage [0 -1]]
          (let [obj (lib.js/as-returned simple-query stage nil)]
            (is (=? simple-query (.-query obj)))
            (is (=? stage        (.-stageIndex obj)))))

        (testing "in the target stage"
          (doseq [stage [1 -1]]
            (let [obj (lib.js/as-returned two-stage stage nil)]
              (is (=? two-stage (.-query obj)))
              (is (=? stage     (.-stageIndex obj)))))))

      (testing "uses an existing later stage if it exists"
        (let [obj (lib.js/as-returned two-stage 0 nil)]
          (is (=? two-stage (.-query obj)))
          (is (=? 1         (.-stageIndex obj))))
        (let [obj   (lib.js/as-returned two-stage-agg 0 nil)]
          (is (=? two-stage-agg (.-query obj)))
          (is (=? 1             (.-stageIndex obj)))))

      (testing "appends a new stage if necessary"
        (let [obj (lib.js/as-returned two-stage-agg 1 nil)]
          (is (=? (lib/append-stage two-stage-agg)
                  (.-query obj)))
          (is (=? -1 (.-stageIndex obj)))))

      (testing "only breakouts"
        (let [brk-only  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                            (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month)))
              two-stage (-> brk-only
                            lib/append-stage
                            (lib/filter (lib/> (first (lib/returned-columns brk-only)) 100)))]
          (testing "uses an existing later stage if it exists"
            (let [obj (lib.js/as-returned two-stage 0 nil)]
              (is (=? two-stage (.-query obj)))
              (is (=? 1         (.-stageIndex obj)))))
          (testing "appends a new stage if necessary"
            (let [obj (lib.js/as-returned brk-only 0 nil)]
              (is (=? (lib/append-stage brk-only)
                      (.-query obj)))
              (is (=? -1 (.-stageIndex obj)))))))

      (testing "only aggregations"
        (let [agg-only  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                            (lib/aggregate (lib/count)))
              two-stage (-> agg-only
                            lib/append-stage
                            (lib/filter (lib/> (first (lib/returned-columns agg-only)) 100)))]
          (testing "uses an existing later stage if it exists"
            (let [obj (lib.js/as-returned two-stage 0 nil)]
              (is (=? two-stage (.-query obj)))
              (is (=? 1         (.-stageIndex obj)))))
          (testing "appends a new stage if necessary"
            (let [obj (lib.js/as-returned agg-only 0 nil)]
              (is (=? (lib/append-stage agg-only)
                      (.-query obj)))
              (is (=? -1 (.-stageIndex obj))))))))))

(deftest ^:parallel display-info->js-test
  (testing "all data structures are converted correctly"
    (let [input        {:arr [:a {:inner true}]
                        :string  "passed"
                        :keyword :too
                        :value   nil}
          expected #js {:arr #js ["a" #js {:inner true}]
                        :string  "passed"
                        :keyword "too"
                        :value   nil}]
      (is (js= expected (lib.js/display-info->js input))))))
