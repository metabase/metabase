(ns metabase.lib.field-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.composed-provider
    :as lib.metadata.composed-provider]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel field-from-results-metadata-test
  (let [field-metadata (lib.metadata/stage-column (lib/saved-question-query
                                                   meta/metadata-provider
                                                   meta/saved-question)
                                                  "ID")]
    (is (=? {:lib/type :metadata/column
             :name     "ID"}
            field-metadata))
    (is (=? [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]
            (lib/ref field-metadata)))))

(defn- grandparent-parent-child-id [field]
  (+ (meta/id :venues :id)
     (case field
       :grandparent 50
       :parent      60
       :child       70)))

(def ^:private grandparent-parent-child-metadata-provider
  "A MetadataProvider for a Table that nested Fields: grandparent, parent, and child"
  (let [grandparent {:lib/type  :metadata/column
                     :name      "grandparent"
                     :id        (grandparent-parent-child-id :grandparent)
                     :base-type :type/Text}
        parent      {:lib/type  :metadata/column
                     :name      "parent"
                     :parent-id (grandparent-parent-child-id :grandparent)
                     :id        (grandparent-parent-child-id :parent)
                     :base-type :type/Text}
        child       {:lib/type  :metadata/column
                     :name      "child"
                     :parent-id (grandparent-parent-child-id :parent)
                     :id        (grandparent-parent-child-id :child)
                     :base-type :type/Text}]
    (lib.tu/mock-metadata-provider
     {:database meta/metadata
      :tables   [(meta/table-metadata :venues)]
      :fields   (mapv (fn [field-metadata]
                        (merge {:visibility-type :normal
                                :table-id        (meta/id :venues)}
                               field-metadata))
                      [grandparent parent child])})))

(deftest ^:parallel col-info-combine-parent-field-names-test
  (letfn [(col-info [a-field-clause]
            (lib.metadata.calculation/metadata
             {:lib/type     :mbql/query
              :lib/metadata grandparent-parent-child-metadata-provider
              :database     (meta/id)
              :stages       [{:lib/type     :mbql.stage/mbql
                              :lib/options  {:lib/uuid (str (random-uuid))}
                              :source-table (meta/id :venues)}]}
             -1
             a-field-clause))]
    (testing "For fields with parents we should return them with a combined name including parent's name"
      (is (=? {:table-id          (meta/id :venues)
               :name              "grandparent.parent"
               :parent-id         (grandparent-parent-child-id :grandparent)
               :id                (grandparent-parent-child-id :parent)
               :visibility-type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (grandparent-parent-child-id :parent)]))))
    (testing "nested-nested fields should include grandparent name (etc)"
      (is (=? {:table-id          (meta/id :venues)
               :name              "grandparent.parent.child"
               :parent-id         (grandparent-parent-child-id :parent)
               :id                (grandparent-parent-child-id :child)
               :visibility-type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (grandparent-parent-child-id :child)]))))))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:lib/stage-metadata` if it was supplied"
    (is (=? {:name          "sum"
             :display-name  "sum of User ID"
             :base-type     :type/Integer
             :semantic-type :type/FK}
            (lib.metadata.calculation/metadata
             (lib.tu/native-query)
             -1
             [:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "sum"])))))

(deftest ^:parallel joined-field-display-name-test
  (let [query {:lib/type     :mbql/query
               :stages       [{:lib/type     :mbql.stage/mbql
                               :lib/options  {:lib/uuid "fdcfaa06-8e65-471d-be5a-f1e821022482"}
                               :source-table (meta/id :venues)
                               :fields       [[:field
                                               {:join-alias "Categories"
                                                :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
                                               (meta/id :categories :name)]]
                               :joins        [{:lib/type    :mbql/join
                                               :lib/options {:lib/uuid "490a5abb-54c2-4e62-9196-7e9e99e8d291"}
                                               :alias       "Categories"
                                               :conditions  [[:=
                                                              {:lib/uuid "cc5f6c43-1acb-49c2-aeb5-e3ff9c70541f"}
                                                              (lib.tu/field-clause :venues :category-id)
                                                              (lib.tu/field-clause :categories :id {:join-alias "Categories"})]]
                                               :strategy    :left-join
                                               :fk-field-id (meta/id :venues :category-id)
                                               :stages      [{:lib/type     :mbql.stage/mbql
                                                              :lib/options  {:lib/uuid "bbbae500-c972-4550-b100-e0584eb72c4d"}
                                                              :source-table (meta/id :categories)}]}]}]
               :database     (meta/id)
               :lib/metadata meta/metadata-provider}
        field [:field
               {:join-alias "Categories"
                :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
               (meta/id :categories :name)]]
    (are [style expected] (= expected
                             (lib/display-name query -1 field style))
      :default "Name"
      :long    "Categories → Name")
    (is (=? {:display-name "Name"}
            (lib.metadata.calculation/metadata query -1 field)))))

(deftest ^:parallel legacy-query-joined-field-display-name-test
  (testing "Should calculate correct display names for joined fields when source query is a legacy MBQL query (#31368)"
    (let [card-query      {:database (meta/id)
                           :type     :query
                           :query    {:source-table (meta/id :orders)
                                      :joins        [{:fields       :all
                                                      :source-table (meta/id :products)
                                                      :alias        "Products"
                                                      :condition    [:=
                                                                     [:field (meta/id :orders :product-id) nil]
                                                                     [:field (meta/id :products :id) {:join-alias "Products"}]]}]}}
          card-def        {:id            1
                           :name          "Card 1"
                           :dataset-query card-query}
          ;; legacy result metadata will already include the Join name in the `:display-name`, so simulate that. Make
          ;; sure we're not including it twice.
          result-metadata (for [col (lib.metadata.calculation/metadata
                                     (lib/saved-question-query
                                      meta/metadata-provider
                                      {:dataset-query card-query}))]
                            (cond-> col
                              (:source-alias col)
                              (update :display-name (fn [display-name]
                                                      (str (:source-alias col) " → " display-name)))))]
      (doseq [[message card-def] {"Card with no result metadata"
                                  card-def

                                  "Card with result metadata"
                                  (assoc card-def :result-metadata result-metadata)}]
        (testing (str \newline message)
          (let [metadata-provider (lib.metadata.composed-provider/composed-metadata-provider
                                   (lib.tu/mock-metadata-provider
                                    {:cards [card-def]})
                                   meta/metadata-provider)
                legacy-query      {:database (meta/id)
                                   :type     :query
                                   :query    {:source-table "card__1"}}
                query             (lib/query metadata-provider legacy-query)
                breakoutable-cols (lib/breakoutable-columns query)
                breakout-col      (m/find-first (fn [col]
                                                  (= (:id col) (meta/id :products :category)))
                                                breakoutable-cols)]
            (testing (str "\nbreakoutable-cols =\n" (u/pprint-to-str breakoutable-cols))
              (is (some? breakout-col)))
            (when breakout-col
              (is (=? {:long-display-name "Products → Category"}
                      (lib/display-info query breakout-col)))
              (let [query' (lib/breakout query breakout-col)]
                (is (=? {:stages
                         [{:lib/type     :mbql.stage/mbql
                           :source-table "card__1"
                           :breakout     [[:field {:join-alias "Products"} "CATEGORY"]]}]}
                        query'))
                (is (=? [{:name              "CATEGORY"
                          :display-name      "Category"
                          :long-display-name "Products → Category"
                          :effective-type    :type/Text}]
                        (map (partial lib/display-info query')
                             (lib/breakouts query'))))))
            (when (:result-metadata card-def)
              (testing "\nwith broken breakout from broken drill-thru (#31482)"
                ;; this is a bad field reference, it does not contain a `:join-alias`. For some reason the FE is
                ;; generating these in drill thrus (in MLv1). We need to figure out how to make stuff work anyway even
                ;; tho this is technically wrong.
                (let [query' (lib/breakout query [:field {:lib/uuid (str (random-uuid))} (meta/id :products :category)])]
                  (is (=? [{:name              "CATEGORY"
                            :display-name      "Category"
                            :long-display-name "Products → Category"
                            :effective-type    :type/Text}]
                          (map (partial lib/display-info query')
                               (lib/breakouts query'))))
                  (is (=? {:display-name      "Products → Category"
                           :breakout-position 0}
                          (m/find-first #(= (:id %) (meta/id :products :category))
                                        (lib/breakoutable-columns query')))))))))))))

(deftest ^:parallel field-with-temporal-bucket-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :checkins))
        field (lib/ref (lib/with-temporal-bucket (meta/field-metadata :checkins :date) :day-of-month))]
    (is (=? [:field {:temporal-unit :day-of-month} (meta/id :checkins :date)]
            field))
    (testing "(lib/temporal-bucket <field-ref>)"
      (is (= {:lib/type :type/temporal-bucketing-option
              :unit     :day-of-month}
             (lib/temporal-bucket field))))
    (is (= "Date: Day of month"
           (lib.metadata.calculation/display-name query -1 field)))))

(def ^:private temporal-bucketing-mock-metadata
  "Mock metadata for testing temporal bucketing stuff.

  * Includes a date field where the `:base-type` is `:type/Text`, but `:effective-type` is `:type/Date` because of a
    `:Coercion/ISO8601->Date`, so we can test that `:effective-type` is preserved properly

  * Includes a mocked Field with `:type/Time`"
  (let [date-field        (assoc (meta/field-metadata :people :birth-date)
                                 :base-type         :type/Text
                                 :effective-type    :type/Date
                                 :coercion-strategy :Coercion/ISO8601->Date)
        time-field        (assoc (meta/field-metadata :orders :created-at)
                                 :base-type      :type/Time
                                 :effective-type :type/Time)
        metadata-provider (lib.metadata.composed-provider/composed-metadata-provider
                           (lib.tu/mock-metadata-provider
                            {:fields [date-field
                                      time-field]})
                           meta/metadata-provider)
        query             (lib/query metadata-provider (meta/table-metadata :venues))]
    {:fields            {:date     date-field
                         :datetime (meta/field-metadata :reviews :created-at)
                         :time     time-field}
     :metadata-provider metadata-provider
     :query             query}))

(deftest ^:parallel with-temporal-bucket-test
  (doseq [[unit effective-type] {:month         :type/Date
                                 :month-of-year :type/Integer}
          :let                  [field-metadata (get-in temporal-bucketing-mock-metadata [:fields :date])]
          [what x]              {"column metadata" field-metadata
                                 "field ref"       (lib/ref field-metadata)}
          :let                  [x' (lib/with-temporal-bucket x unit)]]
    (testing (str what " unit = " unit "\n\n" (u/pprint-to-str x') "\n")
      (testing "should calculate correct effective type"
        (is (= effective-type
               (lib.metadata.calculation/type-of (:query temporal-bucketing-mock-metadata) x'))))
      (testing "lib/temporal-bucket should return the option"
        (is (= {:lib/type :type/temporal-bucketing-option
                :unit     unit}
               (lib/temporal-bucket x')))
        (testing "should generate a :field ref with correct :temporal-unit"
          (is (=? [:field
                   {:lib/uuid       string?
                    :base-type      :type/Text
                    :effective-type effective-type
                    :temporal-unit  unit}
                   integer?]
                  (lib/ref x')))))
      (testing "remove the temporal unit"
        (let [x'' (lib/with-temporal-bucket x' nil)]
          (is (nil? (lib/temporal-bucket x'')))
          (is (= x
                 x''))))
      (testing "change the temporal unit, THEN remove it"
        (let [x''  (lib/with-temporal-bucket x' :quarter-of-year)
              x''' (lib/with-temporal-bucket x'' nil)]
          (is (nil? (lib/temporal-bucket x''')))
          (is (= x
                 x''')))))))

(deftest ^:parallel available-temporal-buckets-test
  (doseq [{:keys [metadata expected-options selected-index selected-unit]}
          [{:metadata         (get-in temporal-bucketing-mock-metadata [:fields :date])
            :selected-unit    :month-of-year
            :selected-index   9
            :expected-options (-> lib.temporal-bucket/date-bucket-options
                                  (update 0 dissoc :default)
                                  (assoc-in [2 :default] true))}
           {:metadata         (get-in temporal-bucketing-mock-metadata [:fields :datetime])
            :selected-unit    :month-of-year
            :selected-index   13
            :expected-options (-> lib.temporal-bucket/datetime-bucket-options
                                  (update 2 dissoc :default)
                                  (assoc-in [4 :default] true))}
           {:metadata         (get-in temporal-bucketing-mock-metadata [:fields :time])
            :selected-unit    :minute
            :selected-index   0
            :expected-options lib.temporal-bucket/time-bucket-options}]]
    (testing (str (:base-type metadata) " Field")
      (doseq [[what x] {"column metadata" metadata, "field ref" (lib/ref metadata)}]
        (testing (str what "\n\n" (u/pprint-to-str x))
          (is (= expected-options
                 (lib/available-temporal-buckets (:query temporal-bucketing-mock-metadata) x)))
          (testing "Bucketing with any of the options should work"
            (doseq [expected-option expected-options]
              (is (= {:lib/type :type/temporal-bucketing-option
                     :unit      (:unit expected-option)}
                     (lib/temporal-bucket (lib/with-temporal-bucket x expected-option))))))
          (let [bucketed (lib/with-temporal-bucket x selected-unit)
                query2   (lib/breakout (:query temporal-bucketing-mock-metadata) bucketed)]
            (testing "Bucket it, should still return the same available units, with :selected"
              (is (= (assoc-in expected-options [selected-index :selected] true)
                     (lib/available-temporal-buckets query2 bucketed))))
            (testing "shows :selected in display-info"
              (let [options (lib/available-temporal-buckets query2 bucketed)]
                (is (= (-> (count options)
                           (repeat nil)
                           vec
                           (assoc selected-index true))
                       (for [option options]
                         (:selected (lib/display-info query2 option)))))))))))))

(deftest ^:parallel field-with-binning-test
  (let [query         (lib/query meta/metadata-provider (meta/table-metadata :orders))
        binning       {:strategy :num-bins
                       :num-bins 10}
        binning-typed (assoc binning
                             :lib/type    ::lib.binning/binning
                             :metadata-fn fn?)
        field         (lib/ref (lib/with-binning (meta/field-metadata :orders :subtotal) binning))]
    (is (=? [:field {:binning binning} (meta/id :orders :subtotal)]
            field))
    (testing "(lib/binning <column-metadata>)"
      (is (=? binning-typed
              (lib/binning (lib.metadata.calculation/metadata query -1 field)))))
    (testing "(lib/binning <field-ref>)"
      (is (=? binning-typed
              (lib/binning field))))
    #?(:clj
       ;; i18n/trun doesn't work in the CLJS tests, only in proper FE, so this test is JVM-only.
       (is (= "Subtotal: 10 bins"
              (lib.metadata.calculation/display-name query -1 field))))))

(deftest ^:parallel with-binning-test
  (doseq [[binning1 binning2] (partition 2 1 [{:strategy :default}
                                              {:strategy :num-bins  :num-bins  10}
                                              {:strategy :bin-width :bin-width 1.0}
                                              {:strategy :default}])
          :let                  [field-metadata (lib.metadata/field meta/metadata-provider "PUBLIC" "ORDERS" "SUBTOTAL")]
          [what x]              {"column metadata" field-metadata
                                 "field ref"       (lib/ref field-metadata)}
          :let                  [x' (lib/with-binning x binning1)]]
    (testing (str what " strategy = " (:strategy binning2) "\n\n" (u/pprint-to-str x') "\n")
      (testing "lib/binning should return the binning settings"
        (is (=? (merge binning1
                       {:lib/type    ::lib.binning/binning
                        :metadata-fn fn?})
                (lib/binning x'))))
      (testing "should generate a :field ref with correct :binning"
        (is (=? [:field
                 {:lib/uuid string?
                  :binning  binning1}
                 integer?]
                (lib/ref x'))))
      (testing "remove the binning setting"
        (let [x'' (lib/with-binning x' nil)]
          (is (nil? (lib/binning x'')))
          (is (= x
                 x''))))
      (testing "change the binning setting, THEN remove it"
        (let [x''  (lib/with-binning x' binning2)
              x''' (lib/with-binning x'' nil)]
          (is (=? (merge binning2
                         {:lib/type    ::lib.binning/binning
                          :metadata-fn fn?})
                  (lib/binning x'')))
          (is (nil? (lib/binning x''')))
          (is (= x
                 x''')))))))

(deftest ^:parallel available-binning-strategies-test
  (doseq [{:keys [expected-options field-metadata query]}
          [{:query            (lib/query meta/metadata-provider (meta/table-metadata :orders))
            :field-metadata   (lib.metadata/field meta/metadata-provider "PUBLIC" "ORDERS" "SUBTOTAL")
            :expected-options (lib.binning/numeric-binning-strategies)}
           {:query            (lib/query meta/metadata-provider (meta/table-metadata :people))
            :field-metadata   (lib.metadata/field meta/metadata-provider "PUBLIC" "PEOPLE" "LATITUDE")
            :expected-options (lib.binning/coordinate-binning-strategies)}]]
    (testing (str (:semantic-type field-metadata) " Field")
      (doseq [[what x] [["column metadata" field-metadata]
                        ["field ref"       (lib/ref field-metadata)]]]
        (testing (str what "\n\n" (u/pprint-to-str x))
          (is (= expected-options
                 (lib/available-binning-strategies query x)))
          (let [binned (lib/with-binning x (second expected-options))
                query2 (lib/breakout query binned)]
            (testing "when binned, should return the same available units, with :selected"
              (is (= (-> expected-options second :mbql)
                     (-> binned lib/binning (dissoc :lib/type :metadata-fn))))
              (is (= (assoc-in expected-options [1 :selected] true)
                     (lib/available-binning-strategies query2 binned))))
            (testing "shows :selected in display-info"
              (let [options (lib/available-binning-strategies query2 binned)]
                (is (= (-> options
                           count
                           (repeat nil)
                           vec
                           (assoc 1 true))
                       (for [option options]
                         (:selected (lib/display-info query2 option)))))))))))))

(deftest ^:parallel available-binning-strategies-expressions-test
  (testing "There should be no binning strategies for expressions as they are not supported (#31367)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/expression "myadd" (lib/+ 1 (meta/field-metadata :venues :category-id))))]
      (is (empty? (->> (lib.metadata.calculation/metadata query)
                       (m/find-first (comp #{"myadd"} :name))
                       (lib/available-binning-strategies query)))))))

(deftest ^:parallel binning-display-info-test
  (testing "numeric binning"
    (let [query          (lib/query meta/metadata-provider (meta/table-metadata :orders))
          field-metadata (lib.metadata/field meta/metadata-provider "PUBLIC" "ORDERS" "SUBTOTAL")
          strategies     (lib.binning/numeric-binning-strategies)]
      (doseq [[strat exp] (zipmap strategies [{:display-name "Auto binned" :default true}
                                              {:display-name "10 bins"}
                                              {:display-name "50 bins"}
                                              {:display-name "100 bins"}
                                              nil])]
        (is (= exp
               (some->> strat
                        (lib.binning/with-binning field-metadata)
                        lib.binning/binning
                        (lib/display-info query)))))))

  (testing "coordinate binning"
    (let [query          (lib/query meta/metadata-provider (meta/table-metadata :people))
          field-metadata (lib.metadata/field meta/metadata-provider "PUBLIC" "PEOPLE" "LATITUDE")
          strategies     (lib.binning/coordinate-binning-strategies)]
      (doseq [[strat exp] (zipmap strategies [{:display-name "Auto binned" :default true}
                                              {:display-name "0.1°"}
                                              {:display-name "1°"}
                                              {:display-name "10°"}
                                              {:display-name "20°"}
                                              nil])]
        (is (= exp
               (some->> strat
                        (lib.binning/with-binning field-metadata)
                        lib.binning/binning
                        (lib/display-info query))))))))

(deftest ^:parallel joined-field-column-name-test
  (let [card  {:dataset-query {:database (meta/id)
                               :type     :query
                               :query    {:source-table (meta/id :venues)
                                          :joins        [{:fields       :all
                                                          :source-table (meta/id :categories)
                                                          :conditions   [[:=
                                                                          [:field (meta/id :venues :category-id) nil]
                                                                          [:field (meta/id :categories :id) {:join-alias "Cat"}]]]
                                                          :alias        "Cat"}]}}}
        query (lib/saved-question-query
               meta/metadata-provider
               card)]
    (is (=? [{:lib/desired-column-alias "ID"}
             {:lib/desired-column-alias "NAME"}
             {:lib/desired-column-alias "CATEGORY_ID"}
             {:lib/desired-column-alias "LATITUDE"}
             {:lib/desired-column-alias "LONGITUDE"}
             {:lib/desired-column-alias "PRICE"}
             {:lib/desired-column-alias "Cat__ID"}
             {:lib/desired-column-alias "Cat__NAME"}]
            (lib.metadata.calculation/metadata query)))))

(deftest ^:parallel field-ref-type-of-test
  (testing "Make sure we can calculate field ref type information correctly"
    (let [clause [:field {:lib/uuid (str (random-uuid))} (meta/id :venues :id)]]
      (is (= ::lib.schema.expression/type.unknown
             (lib.schema.expression/type-of clause)))
      (is (= :type/BigInteger
             (lib.metadata.calculation/type-of lib.tu/venues-query clause))))))

(deftest ^:parallel implicitly-joinable-field-display-name-test
  (testing "Should be able to calculate a display name for an implicitly joinable Field"
    (let [query           (lib/query meta/metadata-provider (meta/table-metadata :venues))
          categories-name (m/find-first #(= (:id %) (meta/id :categories :name))
                                        (lib/orderable-columns query))]
      (are [style expected] (= expected
                               (lib/display-name query -1 categories-name style))
        :default "Name"
        :long    "Category → Name")
      (let [query' (lib/order-by query categories-name)]
        (testing "Implicitly joinable columns should NOT be given a join alias"
          (is (=? {:stages [{:order-by [[:asc {} [:field
                                                  (complement :join-alias)
                                                  (meta/id :categories :name)]]]}]}
                  query')))
        (is (= "Venues, Sorted by Category → Name ascending"
               (lib/describe-query query'))))
      (testing "inside aggregations"
        (let [query'        (lib/aggregate query (lib/distinct categories-name))
              [aggregation] (lib/aggregations query')]
          (is (= "Venues, Distinct values of Category → Name"
                 (lib/describe-query query')))
          (are [style expected] (= expected
                                   (lib/display-name query' -1 aggregation style))
            :long    "Distinct values of Category → Name"
            :default "Distinct values of Name"))))))

(deftest ^:parallel source-card-table-display-info-test
  (let [query (assoc lib.tu/venues-query :lib/metadata lib.tu/metadata-provider-with-card)
        field (lib.metadata.calculation/metadata query (assoc (lib.metadata/field query (meta/id :venues :name))
                                                              :table-id "card__1"))]
    (is (=? {:name           "NAME"
             :display-name   "Name"
             :semantic-type  :type/Name
             :effective-type :type/Text
             :table          {:name "My Card", :display-name "My Card"}}
            (lib/display-info query field)))))

(deftest ^:parallel resolve-column-name-in-join-test
  (testing ":field refs with string names should work if the Field comes from a :join"
    (let [card-1            {:name          "My Card"
                             :id            1
                             :dataset-query {:database (meta/id)
                                             :type     :query
                                             :query    {:source-table (meta/id :checkins)
                                                        :aggregation  [[:count]]
                                                        :breakout     [[:field (meta/id :checkins :user-id) nil]]}}}
          metadata-provider (lib.metadata.composed-provider/composed-metadata-provider
                             meta/metadata-provider
                             (lib.tu/mock-metadata-provider
                              {:cards [card-1]}))
          query             {:lib/type     :mbql/query
                             :lib/metadata metadata-provider
                             :database     (meta/id)
                             :stages       [{:lib/type     :mbql.stage/mbql
                                             :source-table (meta/id :checkins)
                                             :joins        [{:lib/type    :mbql/join
                                                             :lib/options {:lib/uuid "d7ebb6bd-e7ac-411a-9d09-d8b18329ad46"}
                                                             :stages      [{:lib/type     :mbql.stage/mbql
                                                                            :source-table "card__1"}]
                                                             :alias       "checkins_by_user"
                                                             :conditions  [[:=
                                                                            {:lib/uuid "1cb124b0-757f-4717-b8ee-9cf12a7c3f62"}
                                                                            [:field
                                                                             {:lib/uuid "a2eb96a0-420b-4465-817d-f3c9f789eff4"}
                                                                             (meta/id :users :id)]
                                                                            [:field
                                                                             {:base-type  :type/Integer
                                                                              :join-alias "checkins_by_user"
                                                                              :lib/uuid   "b23a769d-774a-4eb5-8fb8-1f6a33c9a8d5"}
                                                                             "USER_ID"]]]
                                                             :fields      :all}]
                                             :breakout     [[:field
                                                             {:temporal-unit :month, :lib/uuid "90c646e8-ed1c-42d3-b50c-c51b21286852"}
                                                             (meta/id :users :last-login)]]
                                             :aggregation  [[:avg
                                                             {:lib/uuid "2e97a042-5eec-4c18-acda-e5485f794c60"}
                                                             [:field
                                                              {:base-type  :type/Float
                                                               :join-alias "checkins_by_user"
                                                               :lib/uuid   "222b407e-ca3f-4bce-81cb-0ddfb1c6a79c"}
                                                              "count"]]]}]}]
      (is (=? [{:id                       (meta/id :users :last-login)
                :name                     "LAST_LOGIN"
                :lib/source               :source/breakouts
                :lib/source-column-alias  "LAST_LOGIN"
                :lib/desired-column-alias "LAST_LOGIN"}
               {:name                     "avg"
                :lib/source               :source/aggregations
                :lib/source-column-alias  "avg"
                :lib/desired-column-alias "avg"}]
              (lib.metadata.calculation/metadata query))))))

(deftest ^:parallel with-fields-test
  (let [query           (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                            (lib/expression "myadd" (lib/+ 1 (meta/field-metadata :venues :category-id)))
                            (lib/with-fields [(meta/field-metadata :venues :id) (meta/field-metadata :venues :name)]))
        fields-metadata (fn [query]
                          (map (partial lib.metadata.calculation/metadata query)
                               (lib/fields query)))
        metadatas       (fields-metadata query)]
    (testing "Expressions should be included in :fields by default (#31236)"
      (is (=? [{:name "ID"}
               {:name "NAME"}
               {:name "myadd"}]
              metadatas)))
    (testing "Set fields with metadatas"
      (let [fields' [(second metadatas)]
            query'  (lib/with-fields query fields')]
        (is (=? [{:name "NAME"}
                 {:name "myadd"}]
                (fields-metadata query')))))
    (testing "remove fields by passing"
      (doseq [new-fields [nil []]]
        (testing (pr-str new-fields)
          (let [query' (lib/with-fields query new-fields)]
            (is (empty? (fields-metadata query')))
            (letfn [(has-fields? [query]
                      (get-in query [:stages 0 :fields]))]
              (is (has-fields? query)
                  "sanity check")
              (is (not (has-fields? query'))))))))))

(deftest ^:parallel with-fields-plus-expression-test
  (let [query           (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                            (lib/with-fields [(meta/field-metadata :venues :id)])
                            (lib/expression "myadd" (lib/+ 1 (meta/field-metadata :venues :category-id))))
        fields-metadata (fn [query]
                          (map (partial lib.metadata.calculation/metadata query)
                               (lib/fields query)))
        metadatas       (fields-metadata query)]
    (testing "Expressions should be included in :fields by default (#31236)"
      (is (=? [{:name "ID"}
               {:name "myadd"}]
              metadatas)))))

(deftest ^:parallel fieldable-columns-test
  (testing "query with no :fields"
    (is (=? [{:lib/desired-column-alias "ID", :selected? true}
             {:lib/desired-column-alias "NAME", :selected? true}
             {:lib/desired-column-alias "CATEGORY_ID", :selected? true}
             {:lib/desired-column-alias "LATITUDE", :selected? true}
             {:lib/desired-column-alias "LONGITUDE", :selected? true}
             {:lib/desired-column-alias "PRICE", :selected? true}]
            (lib/fieldable-columns (lib/query meta/metadata-provider (meta/table-metadata :venues)))))))

(deftest ^:parallel fieldable-columns-query-with-fields-test
  (testing "query with :fields"
    (is (=? [{:lib/desired-column-alias "ID", :selected? true}
             {:lib/desired-column-alias "NAME", :selected? true}
             {:lib/desired-column-alias "CATEGORY_ID", :selected? false}
             {:lib/desired-column-alias "LATITUDE", :selected? false}
             {:lib/desired-column-alias "LONGITUDE", :selected? false}
             {:lib/desired-column-alias "PRICE", :selected? false}]
            (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                (lib/with-fields [(meta/field-metadata :venues :id)
                                  (meta/field-metadata :venues :name)])
                lib/fieldable-columns)))))

(deftest ^:parallel fallback-metadata-from-saved-question-when-missing-from-metadata-provider-test
  (testing "Handle missing column metadata from the metadata provider; should still work if in Card result metadata (#31624)"
    (let [provider (lib.tu/mock-metadata-provider
                    {:database {:id   1
                                :name "My Database"}
                     :tables   [{:id   2
                                 :name "My Table"}]
                     :cards    [{:id              3
                                 :name            "Card 3"
                                 :dataset-query   {:lib/type :mbql/query
                                                   :database 1
                                                   :stages   [{:lib/type     :mbql.stage/mbql
                                                               :source-table 2}]}
                                 :result-metadata [{:id   4
                                                    :name "Field 4"}]}]})
          query    (lib/query provider {:lib/type :mbql/query
                                        :database 1
                                        :stages   [{:lib/type     :mbql.stage/mbql
                                                    :source-table "card__3"}]})]
      (is (= [{:lib/type                 :metadata/column
               :base-type                :type/*
               :id                       4
               :name                     "Field 4"
               :lib/source               :source/card
               :lib/card-id              3
               :lib/source-column-alias  "Field 4"
               :lib/desired-column-alias "Field 4"}]
             (lib.metadata.calculation/metadata query)))
      (is (= {:lib/type                :metadata/column
              :base-type               :type/Text
              :effective-type          :type/Text
              :id                      4
              :name                    "Field 4"
              :display-name            "Field 4"
              :lib/card-id             3
              :lib/source              :source/card
              :lib/source-column-alias "Field 4"
              :lib/source-uuid         "aa0e13af-29b3-4c27-a880-a10c33e55a3e"}
             (lib.metadata.calculation/metadata
              query
              [:field {:lib/uuid "aa0e13af-29b3-4c27-a880-a10c33e55a3e", :base-type :type/Text} 4]))))))
