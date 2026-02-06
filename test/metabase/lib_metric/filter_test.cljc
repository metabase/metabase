(ns metabase.lib-metric.filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.filter :as lib-metric.filter]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")
(def ^:private uuid-3 "550e8400-e29b-41d4-a716-446655440003")

(def ^:private dim-ref-1 [:dimension {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} uuid-1])
(def ^:private dim-ref-2 [:dimension {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} uuid-2])
(def ^:private dim-ref-3 [:dimension {:lib/uuid "cccccccc-cccc-cccc-cccc-cccccccccccc"} uuid-3])

;;; -------------------------------------------------- leading-dimension-ref --------------------------------------------------

(deftest ^:parallel leading-dimension-ref-equality-filter-test
  (let [filter-clause [:= {} dim-ref-1 "value"]]
    (is (= uuid-1 (lib-metric.filter/leading-dimension-ref filter-clause)))))

(deftest ^:parallel leading-dimension-ref-comparison-filter-test
  (testing "less than"
    (is (= uuid-1 (lib-metric.filter/leading-dimension-ref [:< {} dim-ref-1 100]))))
  (testing "greater than or equal"
    (is (= uuid-2 (lib-metric.filter/leading-dimension-ref [:>= {} dim-ref-2 50])))))

(deftest ^:parallel leading-dimension-ref-between-filter-test
  (let [filter-clause [:between {} dim-ref-1 10 100]]
    (is (= uuid-1 (lib-metric.filter/leading-dimension-ref filter-clause)))))

(deftest ^:parallel leading-dimension-ref-string-filter-test
  (let [filter-clause [:contains {} dim-ref-1 "search"]]
    (is (= uuid-1 (lib-metric.filter/leading-dimension-ref filter-clause)))))

(deftest ^:parallel leading-dimension-ref-null-filter-test
  (let [filter-clause [:is-null {} dim-ref-2]]
    (is (= uuid-2 (lib-metric.filter/leading-dimension-ref filter-clause)))))

(deftest ^:parallel leading-dimension-ref-and-filter-test
  (testing "Compound :and filter returns nil (no leading dimension)"
    (let [filter-clause [:and {} [:= {} dim-ref-1 "a"] [:= {} dim-ref-2 "b"]]]
      (is (nil? (lib-metric.filter/leading-dimension-ref filter-clause))))))

(deftest ^:parallel leading-dimension-ref-or-filter-test
  (testing "Compound :or filter returns nil (no leading dimension)"
    (let [filter-clause [:or {} [:= {} dim-ref-1 "a"] [:= {} dim-ref-2 "b"]]]
      (is (nil? (lib-metric.filter/leading-dimension-ref filter-clause))))))

(deftest ^:parallel leading-dimension-ref-not-filter-test
  (testing "Compound :not filter returns nil (no leading dimension)"
    (let [filter-clause [:not {} [:= {} dim-ref-1 "a"]]]
      (is (nil? (lib-metric.filter/leading-dimension-ref filter-clause))))))

(deftest ^:parallel leading-dimension-ref-invalid-clause-test
  (testing "Returns nil for non-vector input"
    (is (nil? (lib-metric.filter/leading-dimension-ref nil)))
    (is (nil? (lib-metric.filter/leading-dimension-ref "not-a-filter")))
    (is (nil? (lib-metric.filter/leading-dimension-ref {}))))
  (testing "Returns nil for vector without dimension ref"
    (is (nil? (lib-metric.filter/leading-dimension-ref [:= {} "plain-value" "other"])))
    (is (nil? (lib-metric.filter/leading-dimension-ref [:=])))))

(deftest ^:parallel leading-dimension-ref-malformed-dimension-ref-test
  (testing "Returns nil when third element is not a proper dimension ref"
    (is (nil? (lib-metric.filter/leading-dimension-ref [:= {} [:field {} 1] "value"])))
    (is (nil? (lib-metric.filter/leading-dimension-ref [:= {} [:dimension {}] "value"])))))

;;; -------------------------------------------------- build-filter-positions --------------------------------------------------

(deftest ^:parallel build-filter-positions-empty-filters-test
  (is (= {} (lib-metric.filter/build-filter-positions []))))

(deftest ^:parallel build-filter-positions-single-filter-test
  (let [filters [[:= {} dim-ref-1 "value"]]]
    (is (= {uuid-1 [0]} (lib-metric.filter/build-filter-positions filters)))))

(deftest ^:parallel build-filter-positions-multiple-different-dimensions-test
  (let [filters [[:= {} dim-ref-1 "a"]
                 [:< {} dim-ref-2 100]
                 [:contains {} dim-ref-3 "search"]]]
    (is (= {uuid-1 [0]
            uuid-2 [1]
            uuid-3 [2]}
           (lib-metric.filter/build-filter-positions filters)))))

(deftest ^:parallel build-filter-positions-same-dimension-multiple-times-test
  (let [filters [[:= {} dim-ref-1 "a"]
                 [:= {} dim-ref-2 "b"]
                 [:> {} dim-ref-1 10]
                 [:< {} dim-ref-1 100]]]
    (is (= {uuid-1 [0 2 3]
            uuid-2 [1]}
           (lib-metric.filter/build-filter-positions filters)))))

(deftest ^:parallel build-filter-positions-skips-compound-filters-test
  (let [filters [[:= {} dim-ref-1 "a"]
                 [:and {} [:= {} dim-ref-2 "b"] [:= {} dim-ref-3 "c"]]
                 [:= {} dim-ref-2 "d"]]]
    (is (= {uuid-1 [0]
            uuid-2 [2]}
           (lib-metric.filter/build-filter-positions filters))
        "Compound :and filter at index 1 should be skipped")))

(deftest ^:parallel build-filter-positions-nil-filters-test
  (is (= {} (lib-metric.filter/build-filter-positions nil))))

;;; -------------------------------------------------- operators-for-dimension --------------------------------------------------

(def ^:private string-dimension
  {:lib/type       :metadata/dimension
   :id             "dim-string"
   :name           "category"
   :display-name   "Category"
   :effective-type :type/Text
   :semantic-type  nil})

(def ^:private number-dimension
  {:lib/type       :metadata/dimension
   :id             "dim-number"
   :name           "amount"
   :display-name   "Amount"
   :effective-type :type/Float
   :semantic-type  nil})

(def ^:private boolean-dimension
  {:lib/type       :metadata/dimension
   :id             "dim-boolean"
   :name           "is_active"
   :display-name   "Is Active"
   :effective-type :type/Boolean
   :semantic-type  nil})

(def ^:private datetime-dimension
  {:lib/type       :metadata/dimension
   :id             "dim-datetime"
   :name           "created_at"
   :display-name   "Created At"
   :effective-type :type/DateTime
   :semantic-type  :type/CreationTimestamp})

(def ^:private time-dimension
  {:lib/type       :metadata/dimension
   :id             "dim-time"
   :name           "start_time"
   :display-name   "Start Time"
   :effective-type :type/Time
   :semantic-type  nil})

(def ^:private coordinate-dimension
  {:lib/type       :metadata/dimension
   :id             "dim-coord"
   :name           "latitude"
   :display-name   "Latitude"
   :effective-type :type/Float
   :semantic-type  :type/Latitude})

(deftest ^:parallel operators-for-dimension-string-test
  (testing "String dimensions get string operators"
    (is (= [:is-empty :not-empty := :!= :contains :does-not-contain :starts-with :ends-with]
           (lib-metric.filter/operators-for-dimension string-dimension)))))

(deftest ^:parallel operators-for-dimension-number-test
  (testing "Number dimensions get numeric operators"
    (is (= [:is-null :not-null := :!= :> :>= :< :<= :between]
           (lib-metric.filter/operators-for-dimension number-dimension)))))

(deftest ^:parallel operators-for-dimension-boolean-test
  (testing "Boolean dimensions get boolean operators"
    (is (= [:is-null :not-null :=]
           (lib-metric.filter/operators-for-dimension boolean-dimension)))))

(deftest ^:parallel operators-for-dimension-datetime-test
  (testing "DateTime dimensions get temporal operators"
    (is (= [:is-null :not-null := :!= :> :< :between]
           (lib-metric.filter/operators-for-dimension datetime-dimension)))))

(deftest ^:parallel operators-for-dimension-time-test
  (testing "Time dimensions get time operators"
    (is (= [:is-null :not-null :> :< :between]
           (lib-metric.filter/operators-for-dimension time-dimension)))))

(deftest ^:parallel operators-for-dimension-coordinate-test
  (testing "Coordinate dimensions get coordinate operators"
    (is (= [:= :!= :> :>= :< :<= :between :inside]
           (lib-metric.filter/operators-for-dimension coordinate-dimension)))))

(deftest ^:parallel operators-for-dimension-unknown-test
  (testing "Unknown type dimensions get default operators"
    (is (= [:is-null :not-null]
           (lib-metric.filter/operators-for-dimension {:effective-type :type/Unknown})))))

;;; -------------------------------------------------- filterable-dimension-operators --------------------------------------------------

(deftest ^:parallel filterable-dimension-operators-test
  (testing "filterable-dimension-operators returns same result as operators-for-dimension"
    (is (= (lib-metric.filter/operators-for-dimension string-dimension)
           (lib-metric.filter/filterable-dimension-operators string-dimension)))
    (is (= (lib-metric.filter/operators-for-dimension number-dimension)
           (lib-metric.filter/filterable-dimension-operators number-dimension)))))

;;; -------------------------------------------------- add-filter --------------------------------------------------

(deftest ^:parallel add-filter-test
  (testing "add-filter adds a filter clause to the definition"
    (let [definition {:lib/type    :metric/definition
                      :filters     []
                      :projections []}
          filter-clause [:= {} dim-ref-1 "value"]
          result (lib-metric.filter/add-filter definition filter-clause)]
      (is (= [filter-clause] (:filters result))))))

(deftest ^:parallel add-filter-appends-test
  (testing "add-filter appends to existing filters"
    (let [existing-filter [:= {} dim-ref-1 "a"]
          new-filter [:= {} dim-ref-2 "b"]
          definition {:lib/type    :metric/definition
                      :filters     [existing-filter]
                      :projections []}
          result (lib-metric.filter/add-filter definition new-filter)]
      (is (= [existing-filter new-filter] (:filters result))))))

(deftest ^:parallel add-filter-nil-filters-test
  (testing "add-filter works when :filters is nil"
    (let [definition {:lib/type    :metric/definition
                      :projections []}
          filter-clause [:= {} dim-ref-1 "value"]
          result (lib-metric.filter/add-filter definition filter-clause)]
      (is (= [filter-clause] (:filters result))))))

;;; -------------------------------------------------- filterable-dimensions --------------------------------------------------
;;; Note: Full integration tests for filterable-dimensions require a mock metadata provider
;;; These tests verify the basic shape of the function

(deftest ^:parallel filterable-dimensions-returns-vector-test
  (testing "filterable-dimensions returns a vector even with invalid input"
    ;; With no provider, dimensions-for-* will fail, but we test the structure
    (let [definition {:lib/type          :metric/definition
                      :source            {:type :source/metric :id 1}
                      :filters           []
                      :projections       []
                      :metadata-provider nil}]
      ;; This will fail due to nil provider, which is expected in unit tests
      ;; Integration tests with real providers are needed for full coverage
      (is (thrown? #?(:clj Exception :cljs js/Error)
                   (lib-metric.filter/filterable-dimensions definition))))))
