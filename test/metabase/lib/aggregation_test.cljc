(ns metabase.lib.aggregation-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.set :as set]
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel aggregation-test
  (let [venues-category-id-metadata (meta/field-metadata :venues :category-id)
        venue-field-check [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]]
    (testing "count"
      (is (=? [:count {:lib/uuid string?}]
              (lib/count)))
      (is (=? [:count {:lib/uuid string?} venue-field-check]
              (lib/count venues-category-id-metadata))))
    (testing "single arg aggregations"
      (doseq [[op tag] [[lib/avg :avg]
                        [lib/max :max]
                        [lib/min :min]
                        [lib/median :median]
                        [lib/sum :sum]
                        [lib/stddev :stddev]
                        [lib/distinct :distinct]
                        [lib/var :var]]]
        (is (=? [tag {:lib/uuid string?} venue-field-check]
                (op venues-category-id-metadata)))))))

(defn- aggregation-display-name [aggregation-clause]
  (lib/display-name (lib.tu/venues-query) -1 aggregation-clause))

(defn- aggregation-column-name [aggregation-clause]
  (lib/column-name (lib.tu/venues-query) -1 aggregation-clause))

(deftest ^:parallel aggregation-names-test
  (are [aggregation-clause expected] (= expected
                                        {:column-name  (aggregation-column-name aggregation-clause)
                                         :display-name (aggregation-display-name aggregation-clause)})
    [:count {}]
    {:column-name "count", :display-name "Count"}

    [:distinct {} (lib.tu/field-clause :venues :id)]
    {:column-name "count", :display-name "Distinct values of ID"}

    [:sum {} (lib.tu/field-clause :venues :id)]
    {:column-name "sum", :display-name "Sum of ID"}

    [:+ {} [:count {}] 1]
    {:column-name "expression", :display-name "Count + 1"}

    [:+
     {}
     [:min {} (lib.tu/field-clause :venues :id)]
     [:* {} 2 [:avg {} (lib.tu/field-clause :venues :price)]]]
    {:column-name  "expression"
     :display-name "Min of ID + (2 × Average of Price)"}

    [:+
     {}
     [:min {} (lib.tu/field-clause :venues :id)]
     [:*
      {}
      2
      [:avg {} (lib.tu/field-clause :venues :price)]
      3
      [:- {} [:max {} (lib.tu/field-clause :venues :category-id)] 4]]]
    {:column-name  "expression"
     :display-name "Min of ID + (2 × Average of Price × 3 × (Max of Category ID - 4))"}

    ;; user-specified names
    [:+
     {:name "generated_name", :display-name "User-specified Name"}
     [:min {} (lib.tu/field-clause :venues :id)]
     [:* {} 2 [:avg {} (lib.tu/field-clause :venues :price)]]]
    {:column-name "generated_name", :display-name "User-specified Name"}

    [:+
     {:name "generated_name"}
     [:min {} (lib.tu/field-clause :venues :id)]
     [:* {} 2 [:avg {} (lib.tu/field-clause :venues :price)]]]
    {:column-name "generated_name", :display-name "Min of ID + (2 × Average of Price)"}

    [:+
     {:display-name "User-specified Name"}
     [:min {} (lib.tu/field-clause :venues :id)]
     [:* {} 2 [:avg {} (lib.tu/field-clause :venues :price)]]]
    {:column-name  "expression"
     :display-name "User-specified Name"}

    [:percentile {} (lib.tu/field-clause :venues :id) 0.95]
    {:column-name "percentile", :display-name "0.95th percentile of ID"}

    [:case {} [[[:> (lib.tu/field-clause :venues :price) 10] "A"]]]
    {:column-name "case", :display-name "Case"}

    [:if {} [[[:> (lib.tu/field-clause :venues :price) 10] "A"]]]
    {:column-name "if", :display-name "If"}))

;;; the following tests use raw legacy MBQL because they're direct ports of JavaScript tests from MLv1 and I wanted to
;;; make sure that given an existing query, the expected description was generated correctly.

(defn- describe-legacy-query [query]
  (lib/describe-query (lib.query/query meta/metadata-provider (lib.convert/->pMBQL query))))

(deftest ^:parallel describe-multiple-aggregations-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :aggregation  [[:count]
                                         [:sum [:field (meta/id :venues :id) nil]]]}}]
    (is (= "Venues, Count and Sum of ID"
           (describe-legacy-query query)))))

(deftest ^:parallel describe-named-aggregations-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :aggregation  [[:aggregation-options
                                          [:sum [:field (meta/id :venues :id) nil]]
                                          {:display-name "Revenue"}]]}}]
    (is (= "Venues, Revenue"
           (describe-legacy-query query)))))

(defn- col-info-for-aggregation-clause
  ([clause]
   (col-info-for-aggregation-clause (lib.tu/venues-query) clause))

  ([query clause]
   (col-info-for-aggregation-clause query -1 clause))

  ([query stage clause]
   (lib/metadata query stage clause)))

(deftest ^:parallel col-info-for-aggregation-clause-test
  (are [clause expected] (=? expected
                             (col-info-for-aggregation-clause clause))
    ;; :count, no field
    [:/ {} [:count {}] 2]
    {:base-type    :type/Float
     :name         "expression"
     :display-name "Count ÷ 2"}

    ;; :sum
    [:sum {} [:+ {} (lib.tu/field-clause :venues :price) 1]]
    {:base-type    :type/Integer
     :name         "sum"
     :display-name "Sum of Price + 1"}

    ;; options map
    [:sum
     {:name "sum_2", :display-name "My custom name", :base-type :type/BigInteger}
     (lib.tu/field-clause :venues :price)]
    {:base-type    :type/BigInteger
     :name         "sum_2"
     :display-name "My custom name"}))

(deftest ^:parallel col-info-named-aggregation-test
  (testing "col info for an `expression` aggregation w/ a named expression should work as expected"
    (is (=? {:base-type    :type/Integer
             :name         "sum"
             :display-name "Sum of double-price"}
            (col-info-for-aggregation-clause
             (lib.tu/venues-query-with-last-stage
              {:expressions [[:*
                              {:lib/uuid (str (random-uuid))
                               :lib/expression-name "double-price"}
                              (lib.tu/field-clause :venues :price {:base-type :type/Integer})
                              2]]})
             [:sum
              {:lib/uuid (str (random-uuid))}
              [:expression {:base-type :type/Integer, :lib/uuid (str (random-uuid))} "double-price"]])))))

(deftest ^:parallel aggregate-test
  (let [q (lib.tu/venues-query)
        result-query
        {:lib/type :mbql/query
         :database (meta/id)
         :stages [{:lib/type :mbql.stage/mbql
                   :source-table (meta/id :venues)
                   :aggregation [[:sum {:lib/uuid string?}
                                  [:field
                                   {:base-type :type/Integer, :lib/uuid string?}
                                   (meta/id :venues :category-id)]]]}]}]

    (testing "with helper function"
      (is (=? result-query
              (-> q
                  (lib/aggregate (lib/sum (meta/field-metadata :venues :category-id)))
                  (dissoc :lib/metadata)))))
    (testing "with external format"
      (is (=? result-query
              (-> q
                  (lib/aggregate {:operator :sum
                                  :lib/type :lib/external-op
                                  :args [(lib/ref (meta/field-metadata :venues :category-id))]})
                  (dissoc :lib/metadata)))))))

(deftest ^:parallel type-of-sum-test
  (is (= :type/BigInteger
         (lib/type-of
          (lib.tu/venues-query)
          [:sum
           {:lib/uuid (str (random-uuid))}
           [:field {:lib/uuid (str (random-uuid))} (meta/id :venues :id)]]))))

(deftest ^:parallel type-of-test
  (testing "Make sure we can calculate correct type information for an aggregation clause like"
    (doseq [tag  [:max
                  :median
                  :percentile
                  :sum
                  :sum-where]
            arg  (let [field [:field {:lib/uuid (str (random-uuid))} (meta/id :venues :id)]]
                   [field
                    [:+ {:lib/uuid (str (random-uuid))} field 1]
                    [:- {:lib/uuid (str (random-uuid))} field 1]
                    [:* {:lib/uuid (str (random-uuid))} field 1]])
            :let [clause [tag
                          {:lib/uuid (str (random-uuid))}
                          arg]]]
      (testing (str \newline (pr-str clause))
        (is (= :type/Number
               (lib.schema.expression/type-of clause)))
        (is (= (condp = (first arg)
                 :field :type/BigInteger
                 :type/Integer)
               (lib/type-of (lib.tu/venues-query) clause)))))))

(deftest ^:parallel expression-ref-inside-aggregation-type-of-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "double-price" (lib/* (meta/field-metadata :venues :price) 2))
                  (lib/aggregate (lib/sum [:expression {:lib/uuid (str (random-uuid))} "double-price"])))]
    (is (=? [{:lib/type     :metadata/column
              :base-type    :type/Integer
              :name         "sum"
              :display-name "Sum of double-price"}]
            (lib/aggregations-metadata query)))
    (is (= :type/Integer
           (lib/type-of query (first (lib/aggregations-metadata query)))))))

(def ^:private op-test-summable-cols
  [{:display-name   "Latitude"
    :effective-type :type/Float
    :semantic-type  :type/Latitude
    :lib/source     :source/table-defaults}
   {:display-name   "Longitude"
    :effective-type :type/Float
    :semantic-type  :type/Longitude
    :lib/source     :source/table-defaults}
   {:display-name   "Price"
    :effective-type :type/Integer
    :semantic-type  :type/Category
    :lib/source     :source/table-defaults}
   {:display-name   "double-price"
    :effective-type :type/Integer
    :lib/source     :source/expressions}])

(def ^:private op-test-all-cols
  [{:display-name   "ID"
    :effective-type :type/BigInteger
    :semantic-type  :type/PK
    :lib/source     :source/table-defaults}
   {:display-name   "Name"
    :effective-type :type/Text
    :semantic-type  :type/Name
    :lib/source     :source/table-defaults}
   {:display-name   "Category ID"
    :effective-type :type/Integer
    :semantic-type  :type/FK
    :lib/source     :source/table-defaults}
   {:display-name   "Latitude"
    :effective-type :type/Float
    :semantic-type  :type/Latitude
    :lib/source     :source/table-defaults}
   {:display-name   "Longitude"
    :effective-type :type/Float
    :semantic-type  :type/Longitude
    :lib/source     :source/table-defaults}
   {:display-name   "Price"
    :effective-type :type/Integer
    :semantic-type  :type/Category
    :lib/source     :source/table-defaults}
   {:display-name   "double-price"
    :effective-type :type/Integer
    :lib/source     :source/expressions}
   {:display-name   "budget?"
    :effective-type :type/Boolean
    :lib/source     :source/expressions}
   {:display-name   "ID"
    :effective-type :type/BigInteger
    :semantic-type  :type/PK
    :lib/source     :source/implicitly-joinable}
   {:display-name   "Name"
    :effective-type :type/Text
    :semantic-type  :type/Name
    :lib/source     :source/implicitly-joinable}])

(deftest ^:parallel aggregation-clause-test
  (let [query (lib.tu/venues-query)
        aggregation-operators (lib/available-aggregation-operators query)
        count-op (first aggregation-operators)
        sum-op (second aggregation-operators)]
    (is (=? [:sum {} [:field {} (meta/id :venues :price)]]
            (lib/aggregation-clause sum-op (meta/field-metadata :venues :price))))
    (is (=? [:count {}]
            (lib/aggregation-clause count-op)))
    (is (=? [:count {} [:field {} (meta/id :venues :price)]]
            (lib/aggregation-clause count-op (meta/field-metadata :venues :price))))
    (is (thrown-with-msg?
         #?(:clj Exception :cljs :default)
         #"aggregation operator :sum requires an argument"
         (lib/aggregation-clause sum-op)))))

(deftest ^:parallel aggregation-operator-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "double-price" (lib/* (meta/field-metadata :venues :price) 2))
                  (lib/expression "budget?" (lib/< (meta/field-metadata :venues :price) 2))
                  (lib/aggregate (lib/sum [:expression {:lib/uuid (str (random-uuid))} "double-price"])))
        scope-cols op-test-all-cols
        aggregation-operators (lib/available-aggregation-operators query)
        count-op (first aggregation-operators)
        sum-op (second aggregation-operators)]
    (testing "available aggregation operators"
      (is (=? [{:short :count
                :requires-column? false}
               {:short :sum
                :requires-column? true
                :columns op-test-summable-cols}
               {:short :avg
                :requires-column? true
                :columns op-test-summable-cols}
               {:short :distinct
                :requires-column? true
                :columns op-test-all-cols}
               {:short :cum-sum
                :requires-column? true
                :columns op-test-summable-cols}
               {:short :cum-count
                :requires-column? false}
               {:short :stddev
                :requires-column? true
                :columns op-test-summable-cols}
               {:short :min
                :requires-column? true
                :columns scope-cols}
               {:short :max
                :requires-column? true
                :columns scope-cols}]
              aggregation-operators)))
    (testing "aggregation operator display info"
      (is (=? [{:display-name "Count of rows"
                :column-name "Count"
                :description "Total number of rows in the answer."
                :short-name "count"
                :requires-column false}
               {:display-name "Sum of ..."
                :column-name "Sum"
                :description "Sum of all the values of a column."
                :short-name "sum"
                :requires-column true}
               {:display-name "Average of ..."
                :column-name "Average"
                :description "Average of all the values of a column"
                :short-name "avg"
                :requires-column true}
               {:display-name "Number of distinct values of ..."
                :column-name "Distinct values"
                :description "Number of unique values of a column among all the rows in the answer."
                :short-name "distinct"
                :requires-column true}
               {:display-name "Cumulative sum of ..."
                :column-name "Sum"
                :description "Additive sum of all the values of a column.\ne.x. total revenue over time."
                :short-name "cum-sum"
                :requires-column true}
               {:display-name "Cumulative count of rows"
                :column-name "Count"
                :description "Additive count of the number of rows.\ne.x. total number of sales over time."
                :short-name "cum-count"
                :requires-column false}
               {:display-name "Standard deviation of ..."
                :column-name "SD"
                :description "Number which expresses how much the values of a column vary among all rows in the answer."
                :short-name "stddev"
                :requires-column true}
               {:display-name "Minimum of ..."
                :column-name "Min"
                :description "Minimum value of a column"
                :short-name "min"
                :requires-column true}
               {:display-name "Maximum of ..."
                :column-name "Max"
                :description "Maximum value of a column"
                :short-name "max"
                :requires-column true}]
              (map #(lib/display-info query %) aggregation-operators))))
    (testing "display name"
      (is (= "Count of rows" (lib/display-name query (first aggregation-operators)))))
    (testing "testing getting the available columns for an aggregation operator"
      (is (nil? (lib/aggregation-operator-columns count-op)))
      (is (=? op-test-summable-cols (lib/aggregation-operator-columns sum-op))))
    (testing "aggregation operators can be added as aggregates"
      (let [price-col (-> sum-op lib/aggregation-operator-columns pop peek)
            agg-query (-> query
                          (lib/aggregate (lib/aggregation-clause count-op))
                          (lib/aggregate (lib/aggregation-clause sum-op price-col)))]
        (is (=? {:lib/type :mbql/query
                 :stages
                 [{:lib/type :mbql.stage/mbql
                   :source-table int?
                   :expressions
                   [[:* {:lib/expression-name "double-price"} [:field {:base-type :type/Integer, :effective-type :type/Integer} int?] 2]
                    [:< {:lib/expression-name "budget?"} [:field {:base-type :type/Integer, :effective-type :type/Integer} int?] 2]]
                   :aggregation
                   [[:sum {} [:expression {} "double-price"]]
                    [:count {}]
                    [:sum {} [:field {:base-type :type/Integer, :effective-type :type/Integer} int?]]]}]}
                agg-query))
        (is (=? [{:lib/type       :metadata/column
                  :effective-type :type/Integer
                  :name           "sum"
                  :display-name   "Sum of double-price"
                  :lib/source     :source/aggregations}
                 {:lib/type       :metadata/column
                  :effective-type :type/Integer
                  :name           "count"
                  :display-name   "Count"
                  :lib/source     :source/aggregations}
                 {:settings       {:is_priceless true}
                  :lib/type       :metadata/column
                  :effective-type :type/Integer
                  :name           "sum"
                  :display-name   "Sum of Price"
                  :lib/source     :source/aggregations}]
                (lib/aggregations-metadata agg-query)))))))

(deftest ^:parallel available-aggregation-operators-missing-feature-test
  (let [provider-without-feature  (meta/updated-metadata-provider
                                   update :features disj :basic-aggregations :percentile-aggregations)
        query-without-feature     (lib/query provider-without-feature (meta/table-metadata :venues))
        operators-without-feature (lib/available-aggregation-operators query-without-feature)]
    (is (=? [{:short :stddev
              :driver-feature :standard-deviation-aggregations}]
            operators-without-feature))))

(deftest ^:parallel selected-aggregation-operator-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "double-price" (lib/* (meta/field-metadata :venues :price) 2))
                  (lib/expression "budget?" (lib/< (meta/field-metadata :venues :price) 2)))
        query (-> query
                  (lib/aggregate (lib/sum (first (lib/expressions-metadata query))))
                  (lib/aggregate (lib/count)))
        aggregations (lib/aggregations query)
        aggregation-operators (lib/available-aggregation-operators query)
        scope-cols op-test-all-cols]
    (testing "aggregations"
      (is (=? [[:sum {} [:expression {} "double-price"]]
               [:count {}]]
              aggregations)))
    (testing "selected-aggregation-operators w/o column"
      (is (=? [{:short :count
                :requires-column? false
                :selected? true}
               {:short :sum
                :requires-column? true
                :columns op-test-summable-cols}
               {:short :avg
                :requires-column? true
                :columns op-test-summable-cols}
               {:short :distinct
                :requires-column? true
                :columns op-test-all-cols}
               {:short :cum-sum
                :requires-column? true
                :columns op-test-summable-cols}
               {:short :cum-count
                :requires-column? false}
               {:short :stddev
                :requires-column? true
                :columns op-test-summable-cols}
               {:short :min
                :requires-column? true
                :columns scope-cols}
               {:short :max
                :requires-column? true
                :columns scope-cols}]
              (lib/selected-aggregation-operators aggregation-operators (second aggregations)))))
    (testing "selected-aggregation-operators w/ column"
      (let [selected-operators (lib/selected-aggregation-operators
                                aggregation-operators (first aggregations))]
        (is (=? [{:short :count
                  :requires-column? false}
                 {:short :sum
                  :requires-column? true
                  :columns (mapv (fn [col]
                                   (cond-> col
                                     (= (:display-name col) "double-price")
                                     (assoc :selected? true)))
                                 op-test-summable-cols)
                  :selected? true}
                 {:short :avg
                  :requires-column? true
                  :columns op-test-summable-cols}
                 {:short :distinct
                  :requires-column? true
                  :columns op-test-all-cols}
                 {:short :cum-sum
                  :requires-column? true
                  :columns op-test-summable-cols}
                 {:short :cum-count
                  :requires-column? false}
                 {:short :stddev
                  :requires-column? true
                  :columns op-test-summable-cols}
                 {:short :min
                  :requires-column? true
                  :columns scope-cols}
                 {:short :max
                  :requires-column? true
                  :columns scope-cols}]
                selected-operators))
        (is (= [{:display-name "Count of rows"
                 :column-name "Count"
                 :description "Total number of rows in the answer."
                 :short-name "count"
                 :requires-column false}
                {:display-name "Sum of ..."
                 :column-name "Sum"
                 :description "Sum of all the values of a column."
                 :short-name "sum"
                 :requires-column true
                 :selected true}]
               (take 2 (map #(lib/display-info query %) selected-operators))))
        (is (=? [{:display-name "Latitude"}
                 {:display-name "Longitude"}
                 {:display-name "Price"}
                 {:display-name "double-price"
                  :selected true}]
                (map #(lib/display-info query %) (-> selected-operators second :columns))))))))

(deftest ^:parallel selected-aggregation-operator-with-temporal-bucket-test
  (testing "aggregating temporal bucketed fields keeps temporal bucket and selectedness info (#31555)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                    (lib/aggregate (lib/max (lib/with-temporal-bucket (meta/field-metadata :checkins :date) :quarter))))
          aggregations (lib/aggregations query)
          aggregation-operators (lib/available-aggregation-operators query)]
      (testing "selected-aggregation-operators w/o column"
        (is (=? [{:lib/type :operator/aggregation
                  :short :max
                  :selected? true
                  :columns
                  [{:display-name "ID"
                    :effective-type :type/BigInteger
                    :semantic-type :type/PK
                    :lib/source :source/table-defaults}
                   {:display-name "Date"
                    :effective-type :type/Date
                    :lib/source :source/table-defaults
                    :metabase.lib.field/temporal-unit :quarter
                    :selected? true}
                   {:display-name "User ID"
                    :effective-type :type/Integer
                    :semantic-type :type/FK
                    :lib/source :source/table-defaults}
                   {:display-name "Venue ID"
                    :effective-type :type/Integer
                    :semantic-type :type/FK
                    :lib/source :source/table-defaults}
                   {:display-name "ID"
                    :effective-type :type/BigInteger
                    :semantic-type :type/PK
                    :lib/source :source/implicitly-joinable}
                   {:display-name "Name"
                    :effective-type :type/Text
                    :semantic-type :type/Name
                    :lib/source :source/implicitly-joinable}
                   {:display-name "Last Login"
                    :effective-type :type/DateTime
                    :semantic-type nil
                    :lib/source :source/implicitly-joinable}
                   {:display-name "ID"
                    :effective-type :type/BigInteger
                    :semantic-type :type/PK
                    :lib/source :source/implicitly-joinable}
                   {:display-name "Name"
                    :effective-type :type/Text
                    :semantic-type :type/Name
                    :lib/source :source/implicitly-joinable}
                   {:display-name "Category ID"
                    :effective-type :type/Integer
                    :semantic-type :type/FK
                    :lib/source :source/implicitly-joinable}
                   {:display-name "Latitude"
                    :effective-type :type/Float
                    :semantic-type :type/Latitude
                    :lib/source :source/implicitly-joinable}
                   {:display-name "Longitude"
                    :effective-type :type/Float
                    :semantic-type :type/Longitude
                    :lib/source :source/implicitly-joinable}
                   {:display-name "Price"
                    :effective-type :type/Integer
                    :semantic-type :type/Category
                    :lib/source :source/implicitly-joinable}]}]
                (->> (lib/selected-aggregation-operators aggregation-operators (first aggregations))
                     (filterv :selected?))))))))

(deftest ^:parallel preserve-field-settings-metadata-test
  (testing "Aggregation metadata should return the `:settings` for the field being aggregated, for some reason."
    (let [query (-> (lib.tu/venues-query)
                    (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))]
      (is (=? {:settings       {:is_priceless true}
               :lib/type       :metadata/column
               :effective-type :type/Integer
               :name           "sum"
               :display-name   "Sum of Price"
               :lib/source     :source/aggregations}
              (lib/metadata query (first (lib/aggregations-metadata query -1))))))))

(deftest ^:parallel count-aggregation-type-test
  (testing "Count aggregation should produce numeric columns"
    (let [query (-> (lib.tu/venues-query)
                    (lib/aggregate (lib/count)))
          count-meta (first (lib/aggregations-metadata query -1))]
      (is (=? {:lib/type       :metadata/column
               :effective-type :type/Integer
               :name           "count"
               :display-name   "Count"
               :lib/source     :source/aggregations}
              count-meta))
      (is (lib.types.isa/numeric? count-meta)))))

(deftest ^:parallel var-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/aggregate (lib/var (meta/field-metadata :venues :price))))]
    (is (=? {:stages [{:aggregation [[:var {} [:field {} (meta/id :venues :price)]]]}]}
            query))
    (is (= "Venues, Variance of Price"
           (lib/describe-query query)))))

(deftest ^:parallel aggregation-ref-display-info-test
  (let [query  (-> (lib.tu/venues-query)
                   (lib/aggregate (lib/avg (lib/+ (meta/field-metadata :venues :price) 1))))
        ag-uuid (:lib/source-uuid (first (lib/aggregations-metadata query)))
        ag-ref [:aggregation {:lib/uuid "8e76cd35-465d-4a2b-a03a-55857f07c4e0", :effective-type :type/Float} ag-uuid]]
    (is (= :type/Float
           (lib/type-of query ag-ref)))
    (is (= "Average of Price + 1"
           (lib/display-name query ag-ref)))
    (is (=? {:lib/type        :metadata/column
             :lib/source      :source/aggregations
             :display-name    "Average of Price + 1"
             :effective-type  :type/Float
             :lib/source-uuid ag-uuid}
            (lib/metadata query ag-ref)))
    (is (=? {:display-name   "Average of Price + 1"
             :effective-type :type/Float}
            (lib/display-info query ag-ref)))))

(deftest ^:parallel aggregate-should-drop-invalid-parts
  (let [query (-> (lib.tu/venues-query)
                  (lib/with-fields [(meta/field-metadata :venues :price)])
                  (lib/order-by (meta/field-metadata :venues :price))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :categories)
                                                 [(lib/=
                                                   (meta/field-metadata :venues :category-id)
                                                   (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                (lib/with-join-fields [(meta/field-metadata :categories :id)])))
                  lib/append-stage
                  (lib/with-fields [(meta/field-metadata :venues :price)])
                  (lib/aggregate 0 (lib/sum (meta/field-metadata :venues :category-id))))
        first-stage (lib.util/query-stage query 0)
        first-join (first (lib/joins query 0))]
    (is (= 1 (count (:stages query))))
    (is (not (contains? first-stage :fields)))
    (is (not (contains? first-stage :order-by)))
    (is (= 1 (count (lib/joins query 0))))
    (is (not (contains? first-join :fields))))
  (testing "Already summarized query should be left alone"
    (let [query (-> (lib.tu/venues-query)
                    (lib/breakout (meta/field-metadata :venues :category-id))
                    (lib/order-by (meta/field-metadata :venues :category-id))
                    (lib/append-stage)
                    (lib/aggregate 0 (lib/sum (meta/field-metadata :venues :category-id))))
          first-stage (lib.util/query-stage query 0)]
      (is (= 2 (count (:stages query))))
      (is (contains? first-stage :order-by)))))

(deftest ^:parallel aggregation-with-case-expression-metadata-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/limit 4)
                  (lib/breakout (meta/field-metadata :venues :category-id))
                  (lib/aggregate (lib/sum (lib/case [[(lib/< (meta/field-metadata :venues :price) 2)
                                                      (meta/field-metadata :venues :price)]]
                                            0))))]
    (is (=? [{:lib/type                 :metadata/column
              :table-id                 (meta/id :venues)
              :name                     "CATEGORY_ID"
              :base-type                :type/Integer
              :semantic-type            :type/FK
              :database-type            "INTEGER"
              :effective-type           :type/Integer
              :lib/source               :source/table-defaults
              :lib/breakout?            true
              :lib/source-column-alias  "CATEGORY_ID"
              :lib/source-uuid          string?
              :fk-target-field-id       (meta/id :categories :id)
              :custom-position          0
              :active                   true
              :id                       (meta/id :venues :category-id)
              :visibility-type          :normal
              :lib/desired-column-alias "CATEGORY_ID"
              :display-name             "Category ID"
              :has-field-values         :none
              :preview-display          true
              :fingerprint              {:global {:distinct-count 28, :nil% 0.0}}}
             {:lib/type                 :metadata/column
              :base-type                :type/Integer
              :name                     "sum"
              :display-name             "Sum of Case"
              :lib/source               :source/aggregations
              :lib/source-uuid          string?
              :lib/source-column-alias  "sum"
              :lib/desired-column-alias "sum"}]
            (lib/returned-columns query)))))

(deftest ^:parallel count-display-name-test
  (testing "#31255"
    (doseq [{:keys [k f expected]} [{:k        :cum-count
                                     :f        lib/cum-count
                                     :expected {:with-field    "Cumulative count of ID"
                                                :without-field "Cumulative count"}}
                                    {:k        :count
                                     :f        lib/count
                                     :expected {:with-field    "Count of ID"
                                                :without-field "Count"}}]]
      (testing k
        (doseq [field? [true false]]
          (testing (if field? "with field" "without field")
            (let [query (-> (lib.tu/venues-query)
                            (lib/aggregate (if field?
                                             (f (meta/field-metadata :venues :id))
                                             (f))))]
              (is (=? {:stages [{:aggregation [(if field?
                                                 [k {} [:field {} integer?]]
                                                 [k {}])]}]}
                      query)
                  "query")
              (is (= [(expected (if field? :with-field :without-field))]
                     (map (partial lib/display-name query)
                          (lib/returned-columns query)))
                  "display name"))))))))

(deftest ^:parallel aggregation-name-from-previous-stage-test
  (testing "Maintain the column names in refs from the QP/MLv1 (#31266)"
    (let [query         (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                            (lib/expression "Half Price" (lib// (meta/field-metadata :products :price) 2))
                            (as-> <> (lib/aggregate <> (lib/avg (lib/expression-ref <> "Half Price"))))
                            (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :products :created-at) :month))
                            lib/append-stage)
          ag-op         (m/find-first #(= (:short %) :max)
                                      (lib/available-aggregation-operators query))
          expr-metadata (last (lib/aggregation-operator-columns ag-op))]
      (is (=? {:stages [{:lib/type    :mbql.stage/mbql
                         :aggregation [[:avg {} [:expression
                                                 {:base-type :type/Float, :effective-type :type/Float}
                                                 "Half Price"]]]}
                        {:lib/type :mbql.stage/mbql}]}
              query))
      (is (=? [:field {:lib/uuid string?, :base-type :type/Float} "avg"]
              (lib/ref expr-metadata))))))

(deftest ^:parallel aggregate-by-coalesce-test
  (testing "Converted query returns same columns as built query (#33680)"
    (let [built-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/expression "Zero" (lib/+ 0 0))
                          (lib/expression "Total of Zero" (lib/coalesce (meta/field-metadata :orders :total) 0)))
          converted-query (lib/query meta/metadata-provider
                                     (lib.convert/->pMBQL
                                      (lib.tu.macros/mbql-query orders
                                        {:expressions {"Zero"          [:+ 0 0]
                                                       "Total of Zero" [:coalesce $total 0]}})))
          clean (fn [query]
                  (->> query
                       lib/available-aggregation-operators
                       (m/find-first #(= (:short %) :sum))
                       lib/aggregation-operator-columns))]
      (is (= (clean built-query)
             (clean converted-query))))))

(deftest ^:parallel aggregation-at-index-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/aggregate (lib/count))
                  (lib/aggregate (lib/count)))]
    (are [index expected] (=? expected
                              (lib.aggregation/aggregation-at-index query -1 index))
      0 [:count {}]
      1 [:count {}]
      2 nil)))

(deftest ^:parallel aggregation-operators-update-after-join
  (testing "available operators includes avg and sum once numeric fields are present (#31384)"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :categories))]
      (is (not (set/subset?
                #{:avg :sum}
                (set (mapv :short (lib/available-aggregation-operators query)))))
          (is (set/subset?
               #{:avg :sum}
               (set (mapv :short (-> query
                                     (lib/join (meta/table-metadata :venues))
                                     lib/available-aggregation-operators)))))))))

(deftest ^:synchronized selected-aggregation-operators-skip-marking-columns-for-non-refs-test
  (testing "when the aggregation's argument is not a column ref, don't try to mark selected columns"
    ;; See https://metaboat.slack.com/archives/C05MPF0TM3L/p1702039952166409 for details.
    (let [query     (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/aggregate (lib/distinct (lib/case
                                                      [[(lib/= (meta/field-metadata :products :category) "Gizmo") 2]]
                                                       3))))
          available (lib/available-aggregation-operators query)]
      (is (=? (for [op available]
                (cond-> op
                  ;; Hawk's =? will think these are predicates and try to run them!
                  true                      (dissoc :display-info)
                  (= (:short op) :distinct) (assoc :selected? true)))
              (lib/selected-aggregation-operators available (first (lib/aggregations query)))))
      (is (thrown? #?(:clj Exception :cljs js/Error)
                   (with-redefs [lib.util/ref-clause? (constantly true)]
                     (lib/selected-aggregation-operators available (first (lib/aggregations query)))))))))

(deftest ^:parallel aggregable-columns-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/aggregate (lib/distinct (meta/field-metadata :venues :price))))]
    (is (=? [{:name "ID",          :effective-type :type/BigInteger, :lib/source :source/table-defaults}
             {:name "NAME",        :effective-type :type/Text,       :lib/source :source/table-defaults}
             {:name "CATEGORY_ID", :effective-type :type/Integer,    :lib/source :source/table-defaults}
             {:name "LATITUDE",    :effective-type :type/Float,      :lib/source :source/table-defaults}
             {:name "LONGITUDE",   :effective-type :type/Float,      :lib/source :source/table-defaults}
             {:name "PRICE",       :effective-type :type/Integer,    :lib/source :source/table-defaults}
             {:name "ID",          :effective-type :type/BigInteger, :lib/source :source/implicitly-joinable}
             {:name "NAME",        :effective-type :type/Text,       :lib/source :source/implicitly-joinable}
             {:name "count",       :effective-type :type/Integer,    :lib/source :source/aggregations}]
            (lib/aggregable-columns query nil)))))

(deftest ^:parallel aggregable-columns-e2e-test
  (let [by-name (fn [col-name cols]
                  (m/find-first (comp #{col-name} :name) cols))
        add-aggregate (fn add-aggregate
                        [query source-name target-name]
                        (lib/aggregate query (lib/with-expression-name
                                               (->> (lib/aggregable-columns query nil)
                                                    (by-name source-name)
                                                    lib/ref)
                                               target-name)))
        aggregate-column-names (fn aggregate-column-names
                                 ([query] (aggregate-column-names query nil))
                                 ([query pos]
                                  (keep #(when (= (:lib/source %) :source/aggregations)
                                           (:name %))
                                        (lib/aggregable-columns query pos))))
        query0 (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                   (lib/aggregate (lib/distinct (meta/field-metadata :venues :price))))
        query1 (add-aggregate query0 "count" "a")
        query2 (add-aggregate query1 "a" "b")
        query3 (add-aggregate query2 "b" "c")
        all-aggregates ["count" "a" "b" "c"]]
    (is (=? [{:name "ID", :lib/source :source/table-defaults}
             {:name "NAME", :lib/source :source/table-defaults}
             {:name "CATEGORY_ID", :lib/source :source/table-defaults}
             {:name "LATITUDE", :lib/source :source/table-defaults}
             {:name "LONGITUDE", :lib/source :source/table-defaults}
             {:name "PRICE", :lib/source :source/table-defaults}
             {:name "ID", :lib/source :source/implicitly-joinable}
             {:name "NAME", :lib/source :source/implicitly-joinable}
             {:name "count", :lib/source :source/aggregations}]
            (lib/aggregable-columns query0 nil)))
    (is (= ["count" "a"]
           (aggregate-column-names query1)))
    (is (= ["count" "a" "b"]
           (aggregate-column-names query2)))
    (is (= all-aggregates
           (aggregate-column-names query3)))
    (doseq [pos (range (count all-aggregates))]
      (is (= (keep-indexed #(when (not= %1 pos) %2) all-aggregates)
             (aggregate-column-names query3 pos))))))

(deftest ^:parallel aggregation-ref-type-of-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/aggregate (lib/distinct (meta/field-metadata :venues :price))))]
    (is (=? :type/Integer
            (lib/type-of query (first (lib/aggregations query)))))))
