(ns metabase.lib-metric.clause-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.clause :as lib-metric.clause]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")
(def ^:private uuid-3 "550e8400-e29b-41d4-a716-446655440003")
(def ^:private uuid-4 "550e8400-e29b-41d4-a716-446655440004")

(def ^:private filter-1 [:= {:lib/uuid uuid-1} [:dimension {} "dim-a"] "value-a"])
(def ^:private filter-2 [:> {:lib/uuid uuid-2} [:dimension {} "dim-b"] 100])
(def ^:private filter-3 [:contains {:lib/uuid uuid-3} [:dimension {} "dim-c"] "search"])

(def ^:private projection-1 [:dimension {:lib/uuid uuid-1} "dim-a"])
(def ^:private projection-2 [:dimension {:lib/uuid uuid-2} "dim-b"])
(def ^:private projection-3 [:dimension {:lib/uuid uuid-3} "dim-c"])

(def ^:private base-definition
  {:lib/type          :metric/definition
   :source            {:type :source/metric :id 1}
   :filters           []
   :projections       []
   :metadata-provider nil})

;;; -------------------------------------------------- replace-clause --------------------------------------------------

(deftest ^:parallel replace-clause-filter-test
  (testing "replace-clause replaces a filter by UUID match"
    (let [definition (assoc base-definition :filters [filter-1 filter-2])
          new-filter [:!= {:lib/uuid uuid-1} [:dimension {} "dim-a"] "new-value"]
          result     (lib-metric.clause/replace-clause definition filter-1 new-filter)]
      (is (= [new-filter filter-2] (:filters result)))
      (is (= [] (:projections result))))))

(deftest ^:parallel replace-clause-projection-test
  (testing "replace-clause replaces a projection by UUID match"
    (let [definition     (assoc base-definition :projections [projection-1 projection-2])
          new-projection [:dimension {:lib/uuid uuid-1 :temporal-unit :month} "dim-a"]
          result         (lib-metric.clause/replace-clause definition projection-1 new-projection)]
      (is (= [] (:filters result)))
      (is (= [new-projection projection-2] (:projections result))))))

(deftest ^:parallel replace-clause-middle-element-test
  (testing "replace-clause replaces middle element correctly"
    (let [definition (assoc base-definition :filters [filter-1 filter-2 filter-3])
          new-filter [:between {:lib/uuid uuid-2} [:dimension {} "dim-b"] 0 200]
          result     (lib-metric.clause/replace-clause definition filter-2 new-filter)]
      (is (= [filter-1 new-filter filter-3] (:filters result))))))

(deftest ^:parallel replace-clause-not-found-test
  (testing "replace-clause returns original definition when clause not found"
    (let [definition      (assoc base-definition :filters [filter-1])
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
    (let [definition (assoc base-definition :filters [filter-1 filter-2])
          result     (lib-metric.clause/remove-clause definition filter-1)]
      (is (= [filter-2] (:filters result)))
      (is (= [] (:projections result))))))

(deftest ^:parallel remove-clause-projection-test
  (testing "remove-clause removes a projection by UUID match"
    (let [definition (assoc base-definition :projections [projection-1 projection-2])
          result     (lib-metric.clause/remove-clause definition projection-1)]
      (is (= [] (:filters result)))
      (is (= [projection-2] (:projections result))))))

(deftest ^:parallel remove-clause-middle-element-test
  (testing "remove-clause removes middle element correctly"
    (let [definition (assoc base-definition :filters [filter-1 filter-2 filter-3])
          result     (lib-metric.clause/remove-clause definition filter-2)]
      (is (= [filter-1 filter-3] (:filters result))))))

(deftest ^:parallel remove-clause-last-element-test
  (testing "remove-clause removes last element leaving empty vector"
    (let [definition (assoc base-definition :filters [filter-1])
          result     (lib-metric.clause/remove-clause definition filter-1)]
      (is (= [] (:filters result))))))

(deftest ^:parallel remove-clause-not-found-test
  (testing "remove-clause returns original definition when clause not found"
    (let [definition     (assoc base-definition :filters [filter-1])
          unknown-filter [:= {:lib/uuid uuid-4} [:dimension {} "unknown"] "x"]
          result         (lib-metric.clause/remove-clause definition unknown-filter)]
      (is (= definition result)))))

(deftest ^:parallel remove-clause-empty-vectors-test
  (testing "remove-clause returns original when vectors are empty"
    (let [result (lib-metric.clause/remove-clause base-definition filter-1)]
      (is (= base-definition result)))))

(deftest ^:parallel remove-clause-first-of-many-test
  (testing "remove-clause removes first element of many"
    (let [definition (assoc base-definition :projections [projection-1 projection-2 projection-3])
          result     (lib-metric.clause/remove-clause definition projection-1)]
      (is (= [projection-2 projection-3] (:projections result))))))

(deftest ^:parallel remove-clause-last-of-many-test
  (testing "remove-clause removes last element of many"
    (let [definition (assoc base-definition :projections [projection-1 projection-2 projection-3])
          result     (lib-metric.clause/remove-clause definition projection-3)]
      (is (= [projection-1 projection-2] (:projections result))))))

;;; -------------------------------------------------- swap-clauses --------------------------------------------------

(deftest ^:parallel swap-clauses-within-filters-test
  (testing "swap-clauses swaps two filters"
    (let [definition (assoc base-definition :filters [filter-1 filter-2 filter-3])
          result     (lib-metric.clause/swap-clauses definition filter-1 filter-3)]
      (is (= [filter-3 filter-2 filter-1] (:filters result))))))

(deftest ^:parallel swap-clauses-within-projections-test
  (testing "swap-clauses swaps two projections"
    (let [definition (assoc base-definition :projections [projection-1 projection-2 projection-3])
          result     (lib-metric.clause/swap-clauses definition projection-1 projection-2)]
      (is (= [projection-2 projection-1 projection-3] (:projections result))))))

(deftest ^:parallel swap-clauses-across-vectors-test
  (testing "swap-clauses swaps filter with projection"
    (let [definition (assoc base-definition
                            :filters [filter-1 filter-2]
                            :projections [projection-3])
          result     (lib-metric.clause/swap-clauses definition filter-1 projection-3)]
      (is (= [projection-3 filter-2] (:filters result)))
      (is (= [filter-1] (:projections result))))))

(deftest ^:parallel swap-clauses-adjacent-test
  (testing "swap-clauses swaps adjacent elements"
    (let [definition (assoc base-definition :filters [filter-1 filter-2])
          result     (lib-metric.clause/swap-clauses definition filter-1 filter-2)]
      (is (= [filter-2 filter-1] (:filters result))))))

(deftest ^:parallel swap-clauses-source-not-found-test
  (testing "swap-clauses returns original when source clause not found"
    (let [definition     (assoc base-definition :filters [filter-1])
          unknown-filter [:= {:lib/uuid uuid-4} [:dimension {} "unknown"] "x"]
          result         (lib-metric.clause/swap-clauses definition unknown-filter filter-1)]
      (is (= definition result)))))

(deftest ^:parallel swap-clauses-target-not-found-test
  (testing "swap-clauses returns original when target clause not found"
    (let [definition     (assoc base-definition :filters [filter-1])
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
    (let [definition (assoc base-definition :filters [filter-1 filter-2])
          result     (lib-metric.clause/swap-clauses definition filter-1 filter-1)]
      (is (= [filter-1 filter-2] (:filters result))))))
