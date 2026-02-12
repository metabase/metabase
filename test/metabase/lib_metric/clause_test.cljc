(ns metabase.lib-metric.clause-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.clause :as lib-metric.clause]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")
(def ^:private uuid-3 "550e8400-e29b-41d4-a716-446655440003")
(def ^:private uuid-4 "550e8400-e29b-41d4-a716-446655440004")

(def ^:private expr-uuid "550e8400-e29b-41d4-a716-446655440000")

(def ^:private filter-1 [:= {:lib/uuid uuid-1} [:dimension {} "dim-a"] "value-a"])
(def ^:private filter-2 [:> {:lib/uuid uuid-2} [:dimension {} "dim-b"] 100])
(def ^:private filter-3 [:contains {:lib/uuid uuid-3} [:dimension {} "dim-c"] "search"])

(def ^:private inst-filter-1 {:lib/uuid expr-uuid :filter filter-1})
(def ^:private inst-filter-2 {:lib/uuid expr-uuid :filter filter-2})
(def ^:private inst-filter-3 {:lib/uuid expr-uuid :filter filter-3})

(def ^:private projection-1 [:dimension {:lib/uuid uuid-1} "dim-a"])
(def ^:private projection-2 [:dimension {:lib/uuid uuid-2} "dim-b"])
(def ^:private projection-3 [:dimension {:lib/uuid uuid-3} "dim-c"])

(def ^:private typed-proj
  "A typed-projection entry with all three projections."
  {:type :metric :id 1 :projection [projection-1 projection-2 projection-3]})

(def ^:private base-definition
  {:lib/type          :metric/definition
   :expression        [:metric {:lib/uuid expr-uuid} 1]
   :filters           []
   :projections       []
   :metadata-provider nil})

;;; -------------------------------------------------- replace-clause --------------------------------------------------

(deftest ^:parallel replace-clause-filter-test
  (testing "replace-clause replaces a filter by UUID match"
    (let [definition (assoc base-definition :filters [inst-filter-1 inst-filter-2])
          new-filter [:!= {:lib/uuid uuid-1} [:dimension {} "dim-a"] "new-value"]
          result     (lib-metric.clause/replace-clause definition filter-1 new-filter)]
      (is (= new-filter (get-in result [:filters 0 :filter])))
      (is (= filter-2 (get-in result [:filters 1 :filter]))))))

(deftest ^:parallel replace-clause-projection-test
  (testing "replace-clause replaces a projection by UUID match"
    (let [definition     (assoc base-definition :projections [{:type :metric :id 1 :projection [projection-1 projection-2]}])
          new-projection [:dimension {:lib/uuid uuid-1 :temporal-unit :month} "dim-a"]
          result         (lib-metric.clause/replace-clause definition projection-1 new-projection)]
      (is (= new-projection (get-in result [:projections 0 :projection 0])))
      (is (= projection-2 (get-in result [:projections 0 :projection 1]))))))

(deftest ^:parallel replace-clause-middle-element-test
  (testing "replace-clause replaces middle element correctly"
    (let [definition (assoc base-definition :filters [inst-filter-1 inst-filter-2 inst-filter-3])
          new-filter [:between {:lib/uuid uuid-2} [:dimension {} "dim-b"] 0 200]
          result     (lib-metric.clause/replace-clause definition filter-2 new-filter)]
      (is (= filter-1 (get-in result [:filters 0 :filter])))
      (is (= new-filter (get-in result [:filters 1 :filter])))
      (is (= filter-3 (get-in result [:filters 2 :filter]))))))

(deftest ^:parallel replace-clause-not-found-test
  (testing "replace-clause returns original definition when clause not found"
    (let [definition      (assoc base-definition :filters [inst-filter-1])
          unknown-filter  [:= {:lib/uuid uuid-4} [:dimension {} "unknown"] "x"]
          new-filter      [:!= {:lib/uuid uuid-4} [:dimension {} "unknown"] "y"]
          result          (lib-metric.clause/replace-clause definition unknown-filter new-filter)]
      (is (= definition result)))))

(deftest ^:parallel replace-clause-empty-vectors-test
  (testing "replace-clause returns original when vectors are empty"
    (let [result (lib-metric.clause/replace-clause base-definition filter-1 filter-2)]
      (is (= base-definition result)))))

;;; -------------------------------------------------- remove-clause --------------------------------------------------

(deftest ^:parallel remove-clause-filter-test
  (testing "remove-clause removes a filter by UUID match"
    (let [definition (assoc base-definition :filters [inst-filter-1 inst-filter-2])
          result     (lib-metric.clause/remove-clause definition filter-1)]
      (is (= [inst-filter-2] (:filters result))))))

(deftest ^:parallel remove-clause-projection-test
  (testing "remove-clause removes a projection by UUID match"
    (let [definition (assoc base-definition :projections [{:type :metric :id 1 :projection [projection-1 projection-2]}])
          result     (lib-metric.clause/remove-clause definition projection-1)]
      (is (= [projection-2] (get-in result [:projections 0 :projection]))))))

(deftest ^:parallel remove-clause-middle-element-test
  (testing "remove-clause removes middle element correctly"
    (let [definition (assoc base-definition :filters [inst-filter-1 inst-filter-2 inst-filter-3])
          result     (lib-metric.clause/remove-clause definition filter-2)]
      (is (= [inst-filter-1 inst-filter-3] (:filters result))))))

(deftest ^:parallel remove-clause-last-element-test
  (testing "remove-clause removes last element leaving empty vector"
    (let [definition (assoc base-definition :filters [inst-filter-1])
          result     (lib-metric.clause/remove-clause definition filter-1)]
      (is (= [] (:filters result))))))

(deftest ^:parallel remove-clause-not-found-test
  (testing "remove-clause returns original definition when clause not found"
    (let [definition     (assoc base-definition :filters [inst-filter-1])
          unknown-filter [:= {:lib/uuid uuid-4} [:dimension {} "unknown"] "x"]
          result         (lib-metric.clause/remove-clause definition unknown-filter)]
      (is (= definition result)))))

(deftest ^:parallel remove-clause-empty-vectors-test
  (testing "remove-clause returns original when vectors are empty"
    (let [result (lib-metric.clause/remove-clause base-definition filter-1)]
      (is (= base-definition result)))))

(deftest ^:parallel remove-clause-first-of-many-test
  (testing "remove-clause removes first projection element of many"
    (let [definition (assoc base-definition :projections [{:type :metric :id 1 :projection [projection-1 projection-2 projection-3]}])
          result     (lib-metric.clause/remove-clause definition projection-1)]
      (is (= [projection-2 projection-3] (get-in result [:projections 0 :projection]))))))

(deftest ^:parallel remove-clause-last-of-many-test
  (testing "remove-clause removes last projection element of many"
    (let [definition (assoc base-definition :projections [{:type :metric :id 1 :projection [projection-1 projection-2 projection-3]}])
          result     (lib-metric.clause/remove-clause definition projection-3)]
      (is (= [projection-1 projection-2] (get-in result [:projections 0 :projection]))))))

;;; -------------------------------------------------- swap-clauses --------------------------------------------------

(deftest ^:parallel swap-clauses-within-filters-test
  (testing "swap-clauses swaps two filters"
    (let [definition (assoc base-definition :filters [inst-filter-1 inst-filter-2 inst-filter-3])
          result     (lib-metric.clause/swap-clauses definition filter-1 filter-3)]
      (is (= filter-3 (get-in result [:filters 0 :filter])))
      (is (= filter-2 (get-in result [:filters 1 :filter])))
      (is (= filter-1 (get-in result [:filters 2 :filter]))))))

(deftest ^:parallel swap-clauses-within-projections-test
  (testing "swap-clauses swaps two projections"
    (let [definition (assoc base-definition :projections [{:type :metric :id 1 :projection [projection-1 projection-2 projection-3]}])
          result     (lib-metric.clause/swap-clauses definition projection-1 projection-2)]
      (is (= [projection-2 projection-1 projection-3]
             (get-in result [:projections 0 :projection]))))))

(deftest ^:parallel swap-clauses-across-vectors-test
  (testing "swap-clauses swaps filter with projection"
    (let [definition (assoc base-definition
                            :filters [inst-filter-1 inst-filter-2]
                            :projections [{:type :metric :id 1 :projection [projection-3]}])
          result     (lib-metric.clause/swap-clauses definition filter-1 projection-3)]
      ;; filter-1's spot now has projection-3
      (is (= projection-3 (get-in result [:filters 0 :filter])))
      ;; projection-3's spot now has filter-1
      (is (= filter-1 (get-in result [:projections 0 :projection 0]))))))

(deftest ^:parallel swap-clauses-adjacent-test
  (testing "swap-clauses swaps adjacent elements"
    (let [definition (assoc base-definition :filters [inst-filter-1 inst-filter-2])
          result     (lib-metric.clause/swap-clauses definition filter-1 filter-2)]
      (is (= filter-2 (get-in result [:filters 0 :filter])))
      (is (= filter-1 (get-in result [:filters 1 :filter]))))))

(deftest ^:parallel swap-clauses-source-not-found-test
  (testing "swap-clauses returns original when source clause not found"
    (let [definition     (assoc base-definition :filters [inst-filter-1])
          unknown-filter [:= {:lib/uuid uuid-4} [:dimension {} "unknown"] "x"]
          result         (lib-metric.clause/swap-clauses definition unknown-filter filter-1)]
      (is (= definition result)))))

(deftest ^:parallel swap-clauses-target-not-found-test
  (testing "swap-clauses returns original when target clause not found"
    (let [definition     (assoc base-definition :filters [inst-filter-1])
          unknown-filter [:= {:lib/uuid uuid-4} [:dimension {} "unknown"] "x"]
          result         (lib-metric.clause/swap-clauses definition filter-1 unknown-filter)]
      (is (= definition result)))))

(deftest ^:parallel swap-clauses-both-not-found-test
  (testing "swap-clauses returns original when both clauses not found"
    (let [unknown-filter-a [:= {:lib/uuid "aaaa"} [:dimension {} "a"] "x"]
          unknown-filter-b [:= {:lib/uuid "bbbb"} [:dimension {} "b"] "y"]
          result           (lib-metric.clause/swap-clauses base-definition unknown-filter-a unknown-filter-b)]
      (is (= base-definition result)))))

(deftest ^:parallel swap-clauses-empty-vectors-test
  (testing "swap-clauses returns original when vectors are empty"
    (let [result (lib-metric.clause/swap-clauses base-definition filter-1 filter-2)]
      (is (= base-definition result)))))

(deftest ^:parallel swap-clauses-same-clause-test
  (testing "swap-clauses handles swapping clause with itself (no-op)"
    (let [definition (assoc base-definition :filters [inst-filter-1 inst-filter-2])
          result     (lib-metric.clause/swap-clauses definition filter-1 filter-1)]
      (is (= filter-1 (get-in result [:filters 0 :filter])))
      (is (= filter-2 (get-in result [:filters 1 :filter]))))))
