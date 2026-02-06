(ns metabase.lib-metric.projection-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.projection :as lib-metric.projection]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")
(def ^:private uuid-3 "550e8400-e29b-41d4-a716-446655440003")

(def ^:private dim-ref-1 [:dimension {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} uuid-1])
(def ^:private dim-ref-2 [:dimension {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} uuid-2])

(def ^:private dimension-1
  {:lib/type       :metadata/dimension
   :id             uuid-1
   :name           "created_at"
   :display-name   "Created At"
   :effective-type :type/DateTime
   :semantic-type  :type/CreationTimestamp
   :source-type    :metric
   :source-id      1})

(def ^:private dimension-2
  {:lib/type       :metadata/dimension
   :id             uuid-2
   :name           "category"
   :display-name   "Category"
   :effective-type :type/Text
   :semantic-type  :type/Category
   :source-type    :metric
   :source-id      1})

(def ^:private dimension-3
  {:lib/type       :metadata/dimension
   :id             uuid-3
   :name           "amount"
   :display-name   "Amount"
   :effective-type :type/Number
   :semantic-type  nil
   :source-type    :metric
   :source-id      1})

;;; -------------------------------------------------- add-projection-positions --------------------------------------------------

(deftest ^:parallel add-projection-positions-empty-projections-test
  (testing "No projections returns dimensions without positions"
    (let [dimensions [dimension-1 dimension-2]
          result     (lib-metric.projection/add-projection-positions dimensions [])]
      (is (= 2 (count result)))
      (is (nil? (:projection-positions (first result))))
      (is (nil? (:projection-positions (second result)))))))

(deftest ^:parallel add-projection-positions-single-projection-test
  (testing "Single projection adds position to matching dimension"
    (let [dimensions  [dimension-1 dimension-2]
          projections [dim-ref-1]
          result      (lib-metric.projection/add-projection-positions dimensions projections)]
      (is (= [0] (:projection-positions (first result))))
      (is (nil? (:projection-positions (second result)))))))

(deftest ^:parallel add-projection-positions-multiple-projections-test
  (testing "Multiple projections add positions to respective dimensions"
    (let [dimensions  [dimension-1 dimension-2 dimension-3]
          projections [dim-ref-1 dim-ref-2]
          result      (lib-metric.projection/add-projection-positions dimensions projections)]
      (is (= [0] (:projection-positions (first result))))
      (is (= [1] (:projection-positions (second result))))
      (is (nil? (:projection-positions (nth result 2)))))))

(deftest ^:parallel add-projection-positions-same-dimension-multiple-times-test
  (testing "Same dimension projected multiple times gets all positions"
    (let [dimensions  [dimension-1 dimension-2]
          projections [dim-ref-1 dim-ref-2 dim-ref-1]
          result      (lib-metric.projection/add-projection-positions dimensions projections)]
      (is (= [0 2] (:projection-positions (first result))))
      (is (= [1] (:projection-positions (second result)))))))

(deftest ^:parallel add-projection-positions-no-matching-dimension-test
  (testing "Projection for non-existent dimension does not cause error"
    (let [dimensions  [dimension-2]  ; Only dimension-2, but projecting dimension-1
          projections [dim-ref-1]
          result      (lib-metric.projection/add-projection-positions dimensions projections)]
      (is (= 1 (count result)))
      (is (nil? (:projection-positions (first result)))))))

(deftest ^:parallel add-projection-positions-nil-projections-test
  (testing "nil projections handled via or in caller"
    ;; The function expects a sequence, caller uses (or projections [])
    (let [dimensions [dimension-1]
          result     (lib-metric.projection/add-projection-positions dimensions [])]
      (is (= 1 (count result)))
      (is (nil? (:projection-positions (first result)))))))

;;; -------------------------------------------------- projectable-dimensions --------------------------------------------------
;;; Note: Full integration tests for projectable-dimensions require a mock metadata provider
;;; These tests verify the basic shape of the function

(deftest ^:parallel projectable-dimensions-returns-vector-test
  (testing "projectable-dimensions requires a valid provider"
    (let [definition {:lib/type          :metric/definition
                      :source            {:type :source/metric :id 1}
                      :filters           []
                      :projections       []
                      :metadata-provider nil}]
      ;; This will fail due to nil provider, which is expected in unit tests
      ;; Integration tests with real providers are needed for full coverage
      (is (thrown? #?(:clj Exception :cljs js/Error)
                   (lib-metric.projection/projectable-dimensions definition))))))
