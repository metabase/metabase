(ns metabase.lib.aggregation-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- is-fn? [op tag args expected-args]
  (let [f (apply op args)]
    (is (fn? f))
    (is (=? {:operator tag, :args expected-args}
            (f {:lib/metadata meta/metadata} -1)))))

(deftest ^:parallel aggregation-test
  (let [q1 (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
        venue-field-check [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]]
    (testing "count"
      (is-fn? lib/count :count [] [])
      (is-fn? lib/count :count [venues-category-id-metadata] [venue-field-check]))
    (testing "single arg aggregations"
      (doseq [[op tag] [[lib/avg :avg]
                        [lib/max :max]
                        [lib/min :min]
                        [lib/median :median]
                        [lib/sum :sum]
                        [lib/stddev :stddev]
                        [lib/distinct :distinct]]]
        (is-fn? op tag [venues-category-id-metadata] [venue-field-check])))))

(defn- aggregation-display-name [aggregation-clause]
  (lib.metadata.calculation/display-name lib.tu/venues-query -1 aggregation-clause))

(defn- aggregation-column-name [aggregation-clause]
  (lib.metadata.calculation/column-name lib.tu/venues-query -1 aggregation-clause))

(deftest ^:parallel aggregation-names-test
  (are [aggregation-clause expected] (= expected
                                        {:column-name  (aggregation-column-name aggregation-clause)
                                         :display-name (aggregation-display-name aggregation-clause)})
    [:count {}]
    {:column-name "count", :display-name "Count"}

    [:distinct {} (lib.tu/field-clause :venues :id)]
    {:column-name "distinct_id", :display-name "Distinct values of ID"}

    [:sum {} (lib.tu/field-clause :venues :id)]
    {:column-name "sum_id", :display-name "Sum of ID"}

    [:+ {} [:count {}] 1]
    {:column-name "count_plus_1", :display-name "Count + 1"}

    [:+
     {}
     [:min {} (lib.tu/field-clause :venues :id)]
     [:* {} 2 [:avg {} (lib.tu/field-clause :venues :price)]]]
    {:column-name  "min_id_plus_2_times_avg_price"
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
    {:column-name  "min_id_plus_2_times_avg_price_times_3_times_max_category_id_minus_4"
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
    {:column-name  "min_id_plus_2_times_avg_price"
     :display-name "User-specified Name"}))

;;; the following tests use raw legacy MBQL because they're direct ports of JavaScript tests from MLv1 and I wanted to
;;; make sure that given an existing query, the expected description was generated correctly.

(defn- describe-legacy-query [query]
  (lib.metadata.calculation/describe-query (lib.query/query meta/metadata-provider (lib.convert/->pMBQL query))))

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
   (col-info-for-aggregation-clause lib.tu/venues-query clause))

  ([query clause]
   (col-info-for-aggregation-clause query -1 clause))

  ([query stage clause]
   (lib.metadata.calculation/metadata query stage clause)))

(deftest ^:parallel col-info-for-aggregation-clause-test
  (are [clause expected] (=? expected
                             (col-info-for-aggregation-clause clause))
    ;; :count, no field
    [:/ {} [:count {}] 2]
    {:base_type    :type/Float
     :name         "count_divided_by_2"
     :display_name "Count ÷ 2"}

    ;; :sum
    [:sum {} [:+ {} (lib.tu/field-clause :venues :price) 1]]
    {:base_type    :type/Integer
     :name         "sum_price_plus_1"
     :display_name "Sum of Price + 1"}

    ;; options map
    [:sum
     {:name "sum_2", :display-name "My custom name", :base-type :type/BigInteger}
     (lib.tu/field-clause :venues :price)]
    {:base_type     :type/BigInteger
     :name          "sum_2"
     :display_name  "My custom name"}))

(deftest ^:parallel col-info-named-aggregation-test
  (testing "col info for an `expression` aggregation w/ a named expression should work as expected"
    (is (=? {:base_type    :type/Integer
             :name         "sum_double-price"
             :display_name "Sum of double-price"}
            (col-info-for-aggregation-clause
             (lib.tu/venues-query-with-last-stage
              {:expressions {"double-price" [:*
                                             {:lib/uuid (str (random-uuid))}
                                             (lib.tu/field-clause :venues :price {:base-type :type/Integer})
                                             2]}})
             [:sum
              {:lib/uuid (str (random-uuid))}
              [:expression {:base-type :type/Integer, :lib/uuid (str (random-uuid))} "double-price"]])))))

(deftest ^:parallel aggregate-test
  (let [q (lib/query-for-table-name meta/metadata-provider "VENUES")
        result-query
        {:lib/type :mbql/query,
         :database (meta/id) ,
         :type :pipeline,
         :stages [{:lib/type :mbql.stage/mbql,
                   :source-table (meta/id :venues) ,
                   :lib/options {:lib/uuid string?},
                   :aggregation [[:sum {:lib/uuid string?}
                                  [:field
                                   {:base-type :type/Integer, :lib/uuid string?}
                                   (meta/id :venues :category-id)]]]}]}]

    (testing "with helper function"
      (is (=? result-query
              (-> q
                  (lib/aggregate (lib/sum (lib/field "VENUES" "CATEGORY_ID")))
                  (dissoc :lib/metadata)))))
    (testing "with external format"
      (is (=? result-query
              (-> q
                  (lib/aggregate {:operator :sum
                                  :args [(lib/ref (lib.metadata/field q nil "VENUES" "CATEGORY_ID"))]})
                  (dissoc :lib/metadata)))))))

(deftest ^:parallel type-of-sum-test
  (is (= :type/BigInteger
         (lib.metadata.calculation/type-of
          lib.tu/venues-query
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
        (is (= (condp = (first arg)
                 :field :metabase.lib.schema.expression/type.unknown
                 :type/*)
               (lib.schema.expression/type-of clause)))
        (is (= (condp = (first arg)
                 :field :type/BigInteger
                 :type/Integer)
               (lib.metadata.calculation/type-of lib.tu/venues-query clause)))))))

(deftest ^:parallel expression-ref-inside-aggregation-type-of-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "double-price" (lib/* (lib/field (meta/id :venues :price)) 2))
                  (lib/aggregate (lib/sum [:expression {:lib/uuid (str (random-uuid))} "double-price"])))]
    (is (=? [{:lib/type     :metadata/field
              :base_type    :type/Integer
              :name         "sum_double-price"
              :display_name "Sum of double-price"}]
            (lib/aggregations query)))
    (is (= :type/Integer
           (lib/type-of query (first (lib/aggregations query)))))))

(deftest ^:parallel preserve-field-settings-metadata-test
  (testing "Aggregation metadata should return the `:settings` for the field being aggregated, for some reason."
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/aggregate (lib/sum (lib/field (meta/id :venues :price)))))]
      (is (=? {:settings     {:is_priceless true}
               :lib/type     :metadata/field
               :base_type    :type/Integer
               :name         "sum_price"
               :display_name "Sum of Price"
               :lib/source   :source/aggregations}
              (lib.metadata.calculation/metadata query (first (lib/aggregations query -1))))))))
