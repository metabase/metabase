(ns metabase.lib-metric.dimension-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.dimension :as lib-metric.dimension]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")
(def ^:private uuid-3 "550e8400-e29b-41d4-a716-446655440003")
(def ^:private uuid-4 "550e8400-e29b-41d4-a716-446655440004")
(def ^:private uuid-orphaned "550e8400-e29b-41d4-a716-446655440099")

(def ^:private target-1 [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 1])
(def ^:private target-2 [:field {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 2])
(def ^:private target-99 [:field {:lib/uuid "cccccccc-cccc-cccc-cccc-cccccccccccc"} 99])

(defn- make-computed-pair
  "Helper to create a computed pair for testing."
  ([name target]
   {:dimension {:id nil :name name}
    :mapping   {:type :table :target target}})
  ([name target table-id]
   {:dimension {:id nil :name name}
    :mapping   {:type :table :table-id table-id :target target}}))

;;; -------------------------------------------------- Target Comparison --------------------------------------------------

(deftest ^:parallel targets-equal?-same-field-id-test
  (let [target-a [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 100]
        target-b [:field {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 100]]
    (is (lib-metric.dimension/targets-equal? target-a target-b)
        "targets with same field ID are equal regardless of lib/uuid")))

(deftest ^:parallel targets-equal?-different-field-ids-test
  (let [target-a [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 100]
        target-b [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 101]]
    (is (not (lib-metric.dimension/targets-equal? target-a target-b))
        "targets with different field IDs are not equal")))

(deftest ^:parallel targets-equal?-different-join-aliases-test
  (let [target-base [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 100]
        target-with-alias [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" :join-alias "Products"} 100]]
    (is (not (lib-metric.dimension/targets-equal? target-base target-with-alias))
        "targets with different join aliases are not equal")))

(deftest ^:parallel targets-equal?-expression-targets-test
  (let [target-a [:expression {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} "my_expr"]
        target-b [:expression {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} "my_expr"]]
    (is (lib-metric.dimension/targets-equal? target-a target-b)
        "expression targets are compared correctly")))

(deftest ^:parallel targets-equal?-ignores-types-test
  (let [target-a [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" :effective-type :type/Integer} 100]
        target-b [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" :effective-type :type/Text :base-type :type/BigInteger} 100]]
    (is (lib-metric.dimension/targets-equal? target-a target-b)
        "effective-type and base-type are ignored")))

;;; -------------------------------------------------- Reconciliation --------------------------------------------------

(deftest ^:parallel reconcile-new-dimensions-get-random-uuids-test
  (let [computed-pairs [(make-computed-pair "col1" target-1)
                        (make-computed-pair "col2" target-2)]
        {:keys [dimensions dimension-mappings]}
        (lib-metric.dimension/reconcile-dimensions-and-mappings computed-pairs nil nil)]
    (is (= 2 (count dimensions)))
    (is (every? #(re-matches #"[a-f0-9-]{36}" (:id %)) dimensions))
    (is (= 2 (count dimension-mappings)))
    (is (= (set (map :id dimensions))
           (set (map :dimension-id dimension-mappings))))))

(deftest ^:parallel reconcile-matched-dimensions-preserve-id-test
  (let [computed-pairs [(make-computed-pair "col1" target-1)]
        persisted-dims [{:id uuid-1 :name "col1" :status :status/active}]
        persisted-mappings [{:type :table :table-id 1 :dimension-id uuid-1 :target target-1}]
        {:keys [dimensions]}
        (lib-metric.dimension/reconcile-dimensions-and-mappings
         computed-pairs persisted-dims persisted-mappings)]
    (is (= uuid-1 (:id (first dimensions))))))

(deftest ^:parallel reconcile-matched-dimensions-preserve-modifications-test
  (let [computed-pairs [(make-computed-pair "col1" target-1)]
        persisted-dims [{:id uuid-1 :name "col1" :display-name "Custom Name"
                         :semantic-type :type/Category :status :status/active}]
        persisted-mappings [{:type :table :table-id 1 :dimension-id uuid-1 :target target-1}]
        {:keys [dimensions]}
        (lib-metric.dimension/reconcile-dimensions-and-mappings
         computed-pairs persisted-dims persisted-mappings)
        dim (first dimensions)]
    (is (= "Custom Name" (:display-name dim)))
    (is (= :type/Category (:semantic-type dim)))
    (is (= :status/active (:status dim)))))

(deftest ^:parallel reconcile-matching-ignores-lib-uuid-test
  (let [target-different-uuid [:field {:lib/uuid "dddddddd-dddd-dddd-dddd-dddddddddddd"} 1]
        computed-pairs [(make-computed-pair "col1" target-different-uuid)]
        persisted-dims [{:id uuid-1 :name "col1" :display-name "Persisted Name" :status :status/active}]
        persisted-mappings [{:type :table :table-id 1 :dimension-id uuid-1 :target target-1}]
        {:keys [dimensions]}
        (lib-metric.dimension/reconcile-dimensions-and-mappings
         computed-pairs persisted-dims persisted-mappings)]
    (is (= uuid-1 (:id (first dimensions))) "should match despite different lib/uuid")
    (is (= "Persisted Name" (:display-name (first dimensions))))))

(deftest ^:parallel reconcile-orphaned-dimensions-detected-test
  (let [computed-pairs [(make-computed-pair "col1" target-1)]
        persisted-dims [{:id uuid-1 :name "col1" :status :status/active}
                        {:id uuid-orphaned :name "old_column" :status :status/active}]
        persisted-mappings [{:type :table :table-id 1 :dimension-id uuid-1 :target target-1}
                            {:type :table :table-id 1 :dimension-id uuid-orphaned :target target-99}]
        {:keys [dimensions dimension-mappings]}
        (lib-metric.dimension/reconcile-dimensions-and-mappings
         computed-pairs persisted-dims persisted-mappings)
        orphaned (first (filter #(= uuid-orphaned (:id %)) dimensions))]
    (is (= 2 (count dimensions)) "should have 2 dimensions")
    (is (= :status/orphaned (:status orphaned)))
    (is (= "Column 'old_column' no longer exists in the data source" (:status-message orphaned)))
    (is (= 1 (count dimension-mappings)) "orphaned dimensions have no mappings")))

(deftest ^:parallel reconcile-non-persisted-dims-not-tracked-as-orphaned-test
  (let [computed-pairs [(make-computed-pair "col1" target-1)]
        persisted-dims [{:id uuid-2 :name "col2"}]
        persisted-mappings [{:type :table :table-id 1 :dimension-id uuid-2 :target target-2}]
        {:keys [dimensions]}
        (lib-metric.dimension/reconcile-dimensions-and-mappings
         computed-pairs persisted-dims persisted-mappings)]
    (is (= 1 (count dimensions)) "only the computed dimension should exist")))

(deftest ^:parallel reconcile-orphaned-becomes-active-if-target-reappears-test
  (let [computed-pairs [(make-computed-pair "col1" target-1)]
        persisted-dims [{:id uuid-1 :name "col1" :display-name "Custom Name"
                         :status :status/orphaned
                         :status-message "Column 'col1' no longer exists"}]
        persisted-mappings [{:type :table :table-id 1 :dimension-id uuid-1 :target target-1}]
        {:keys [dimensions]}
        (lib-metric.dimension/reconcile-dimensions-and-mappings
         computed-pairs persisted-dims persisted-mappings)
        dim (first dimensions)]
    (is (= 1 (count dimensions)))
    (is (= uuid-1 (:id dim)))
    (is (= :status/active (:status dim)))
    (is (nil? (:status-message dim)))
    (is (= "Custom Name" (:display-name dim)))))

;;; -------------------------------------------------- Persistence Helpers --------------------------------------------------

(deftest ^:parallel extract-persisted-dimensions-filters-by-status-test
  (let [dimensions [{:id uuid-1 :name "col1" :status :status/active}
                    {:id uuid-2 :name "col2"}
                    {:id uuid-3 :name "col3" :status :status/orphaned}
                    {:id uuid-4 :name "col4" :status :status/active}]]
    (is (= [{:id uuid-1 :name "col1" :status :status/active}
            {:id uuid-3 :name "col3" :status :status/orphaned}
            {:id uuid-4 :name "col4" :status :status/active}]
           (lib-metric.dimension/extract-persisted-dimensions dimensions)))))

(deftest ^:parallel extract-persisted-dimensions-empty-when-no-status-test
  (let [dimensions [{:id uuid-1 :name "col1"}
                    {:id uuid-2 :name "col2"}]]
    (is (= [] (lib-metric.dimension/extract-persisted-dimensions dimensions)))))

(deftest ^:parallel dimensions-changed?-true-when-dimensions-differ-test
  (is (lib-metric.dimension/dimensions-changed?
       [{:id uuid-1 :name "old" :status :status/active}]
       [{:id uuid-1 :name "new" :status :status/active}])))

(deftest ^:parallel dimensions-changed?-true-when-dimension-added-test
  (is (lib-metric.dimension/dimensions-changed?
       [{:id uuid-1 :status :status/active}]
       [{:id uuid-1 :status :status/active} {:id uuid-2 :status :status/active}])))

(deftest ^:parallel dimensions-changed?-true-when-dimension-removed-test
  (is (lib-metric.dimension/dimensions-changed?
       [{:id uuid-1 :status :status/active} {:id uuid-2 :status :status/active}]
       [{:id uuid-1 :status :status/active}])))

(deftest ^:parallel dimensions-changed?-true-when-status-changes-test
  (is (lib-metric.dimension/dimensions-changed?
       [{:id uuid-1 :name "col1" :status :status/active}]
       [{:id uuid-1 :name "col1" :status :status/orphaned}])))

(deftest ^:parallel dimensions-changed?-false-when-equal-test
  (is (not (lib-metric.dimension/dimensions-changed?
            [{:id uuid-1 :name "col1" :status :status/active}]
            [{:id uuid-1 :name "col1" :status :status/active}]))))

(deftest ^:parallel dimensions-changed?-false-when-order-differs-test
  (is (not (lib-metric.dimension/dimensions-changed?
            [{:id uuid-1 :status :status/active} {:id uuid-2 :status :status/active}]
            [{:id uuid-2 :status :status/active} {:id uuid-1 :status :status/active}]))))

(deftest ^:parallel dimensions-changed?-ignores-extra-keys-test
  (is (not (lib-metric.dimension/dimensions-changed?
            [{:id uuid-1 :name "col1" :status :status/active :lib/source :source/table}]
            [{:id uuid-1 :name "col1" :status :status/active :lib/source :source/other}]))))

(deftest ^:parallel dimensions-changed?-handles-nil-old-dimensions-test
  (is (lib-metric.dimension/dimensions-changed?
       nil
       [{:id uuid-1 :status :status/active}])))

(deftest ^:parallel dimensions-changed?-handles-empty-dimensions-test
  (is (not (lib-metric.dimension/dimensions-changed? [] [])))
  (is (lib-metric.dimension/dimensions-changed? [] [{:id uuid-1 :status :status/active}]))
  (is (lib-metric.dimension/dimensions-changed? [{:id uuid-1 :status :status/active}] [])))

(deftest ^:parallel mappings-changed?-true-when-mappings-differ-test
  (is (lib-metric.dimension/mappings-changed?
       [{:type :table :table-id 1 :dimension-id uuid-1 :target target-1}]
       [{:type :table :table-id 1 :dimension-id uuid-1 :target target-2}])))

(deftest ^:parallel mappings-changed?-false-when-only-lib-uuid-differs-test
  (let [target-a [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 1]
        target-b [:field {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 1]]
    (is (not (lib-metric.dimension/mappings-changed?
              [{:type :table :table-id 1 :dimension-id uuid-1 :target target-a}]
              [{:type :table :table-id 1 :dimension-id uuid-1 :target target-b}])))))

(deftest ^:parallel mappings-changed?-handles-nil-old-mappings-test
  (is (lib-metric.dimension/mappings-changed?
       nil
       [{:type :table :table-id 1 :dimension-id uuid-1 :target target-1}])))

;;; -------------------------------------------------- Always Save Behavior --------------------------------------------------

(deftest ^:parallel reconcile-new-dimensions-get-active-status-test
  (testing "New computed dimensions should always get :status/active so they are persisted"
    (let [computed-pairs [(make-computed-pair "col1" target-1)
                          (make-computed-pair "col2" target-2)]
          {:keys [dimensions]}
          (lib-metric.dimension/reconcile-dimensions-and-mappings computed-pairs nil nil)]
      (is (= 2 (count dimensions)))
      (is (every? #(= :status/active (:status %)) dimensions)
          "All new dimensions should have :status/active"))))

(deftest ^:parallel reconcile-all-dimensions-have-status-for-persistence-test
  (testing "After reconciliation, all active dimensions should be extractable for persistence"
    (let [computed-pairs [(make-computed-pair "col1" target-1)
                          (make-computed-pair "col2" target-2)]
          {:keys [dimensions]}
          (lib-metric.dimension/reconcile-dimensions-and-mappings computed-pairs nil nil)
          persisted (lib-metric.dimension/extract-persisted-dimensions dimensions)]
      (is (= 2 (count persisted))
          "All dimensions should be extracted for persistence since they all have :status/active"))))
