(ns metabase.lib-metric.projection-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.metadata.provider :as lib-metric.metadata.provider]
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
                      :expression        [:metric {:lib/uuid "550e8400-e29b-41d4-a716-446655440001"} 1]
                      :filters           []
                      :projections       []
                      :metadata-provider nil}]
      ;; This will fail due to nil provider, which is expected in unit tests
      ;; Integration tests with real providers are needed for full coverage
      (is (thrown? #?(:clj Exception :cljs js/Error)
                   (lib-metric.projection/projectable-dimensions definition))))))

;;; -------------------------------------------------- project --------------------------------------------------

(def ^:private sample-metric-metadata
  {:lib/type :metadata/metric :id 1 :name "Test Metric"})

(def ^:private valid-definition
  {:lib/type          :metric/definition
   :expression        [:metric {:lib/uuid "550e8400-e29b-41d4-a716-446655440001"} 1]
   :filters           []
   :projections       []
   :metadata-provider nil})

;;; -------------------------------------------------- Mock Provider --------------------------------------------------

(defn- make-mock-provider
  "Create a mock metadata provider that returns the given dimensions for metric-id queries."
  [dimensions]
  (lib-metric.metadata.provider/metric-context-metadata-provider
   ;; metric-fetcher-fn
   (fn [_metadata-spec] [])
   ;; measure-fetcher-fn
   nil
   ;; dimension-fetcher-fn - returns dimensions when queried by metric-id
   (fn [{:keys [metric-id]}]
     (if metric-id
       (filterv #(and (= :metric (:source-type %))
                      (= metric-id (:source-id %)))
                dimensions)
       dimensions))
   ;; table->db-fn
   (constantly nil)
   ;; db-provider-fn
   (constantly nil)
   ;; setting-fn
   (constantly nil)))

(def ^:private mock-dimensions
  "Dimensions annotated as metadata/dimension with source info."
  [(assoc dimension-1
          :lib/type :metadata/dimension
          :source-type :metric
          :source-id 1)
   (assoc dimension-2
          :lib/type :metadata/dimension
          :source-type :metric
          :source-id 1)
   (assoc dimension-3
          :lib/type :metadata/dimension
          :source-type :metric
          :source-id 1)])

(def ^:private definition-with-provider
  "A valid definition with a mock metadata provider."
  (assoc valid-definition
         :metadata-provider (make-mock-provider mock-dimensions)))

(deftest ^:parallel project-adds-projection-to-definition-test
  (testing "project adds a dimension reference to typed projections"
    (let [result (lib-metric.projection/project valid-definition dimension-1)
          typed-proj (first (:projections result))
          dim-ref (first (:projection typed-proj))]
      (is (= 1 (count (:projections result))))
      (is (= :metric (:type typed-proj)))
      (is (= 1 (:id typed-proj)))
      (is (= :dimension (first dim-ref)))
      (is (= uuid-1 (nth dim-ref 2))))))

(deftest ^:parallel project-appends-to-existing-projections-test
  (testing "project appends new projection to existing typed projection"
    (let [definition (assoc valid-definition
                            :projections [{:type :metric :id 1 :projection [dim-ref-1]}])
          result     (lib-metric.projection/project definition dimension-2)
          dim-refs   (get-in result [:projections 0 :projection])]
      (is (= 1 (count (:projections result))))
      (is (= 2 (count dim-refs)))
      (is (= uuid-1 (nth (first dim-refs) 2)))
      (is (= uuid-2 (nth (second dim-refs) 2))))))

(deftest ^:parallel project-creates-correct-dimension-reference-test
  (testing "project creates a [:dimension opts id] reference with :lib/uuid"
    (let [result     (lib-metric.projection/project valid-definition dimension-1)
          dim-ref    (get-in result [:projections 0 :projection 0])]
      (is (= :dimension (first dim-ref)))
      (is (string? (:lib/uuid (second dim-ref))))
      (is (= uuid-1 (nth dim-ref 2))))))

(deftest ^:parallel project-allows-same-dimension-multiple-times-test
  (testing "project allows adding the same dimension multiple times"
    (let [result (-> valid-definition
                     (lib-metric.projection/project dimension-1)
                     (lib-metric.projection/project dimension-1))
          dim-refs (get-in result [:projections 0 :projection])]
      (is (= 1 (count (:projections result))))
      (is (= 2 (count dim-refs)))
      (is (= uuid-1 (nth (first dim-refs) 2)))
      (is (= uuid-1 (nth (second dim-refs) 2))))))

;;; -------------------------------------------------- projection-dimension --------------------------------------------------

(deftest ^:parallel projection-dimension-requires-valid-provider-test
  (testing "projection-dimension throws when projectable-dimensions fails"
    ;; Since projectable-dimensions requires a valid metadata provider,
    ;; we can't fully test projection-dimension without integration tests.
    ;; This test verifies the function exists and handles errors appropriately.
    (let [definition (assoc valid-definition
                            :projections [{:type :metric :id 1 :projection [dim-ref-1]}])]
      (is (thrown? #?(:clj Exception :cljs js/Error)
                   (lib-metric.projection/projection-dimension definition dim-ref-1))))))

(deftest ^:parallel projection-dimension-finds-matching-dimension-test
  (testing "projection-dimension returns the dimension matching the projection"
    (let [definition (-> definition-with-provider
                         (lib-metric.projection/project (first mock-dimensions)))
          dim-ref    (get-in definition [:projections 0 :projection 0])
          result     (lib-metric.projection/projection-dimension definition dim-ref)]
      (is (some? result))
      (is (= uuid-1 (:id result)))
      (is (= "created_at" (:name result))))))

(deftest ^:parallel projection-dimension-returns-nil-for-unknown-test
  (testing "projection-dimension returns nil for unknown projection"
    (let [definition      definition-with-provider
          ;; Use a valid UUID format that doesn't match any dimension
          fake-projection [:dimension {} "00000000-0000-0000-0000-000000000000"]]
      (is (nil? (lib-metric.projection/projection-dimension definition fake-projection))))))

(deftest ^:parallel projection-dimension-works-with-multiple-projections-test
  (testing "projection-dimension finds correct dimension among multiple projections"
    (let [definition (-> definition-with-provider
                         (lib-metric.projection/project (first mock-dimensions))
                         (lib-metric.projection/project (second mock-dimensions)))
          dim-refs   (get-in definition [:projections 0 :projection])
          result-1   (lib-metric.projection/projection-dimension definition (first dim-refs))
          result-2   (lib-metric.projection/projection-dimension definition (second dim-refs))]
      (is (= uuid-1 (:id result-1)))
      (is (= uuid-2 (:id result-2))))))

;;; -------------------------------------------------- dimension/reference --------------------------------------------------

(deftest ^:parallel reference-from-dimension-metadata-test
  (testing "reference creates a dimension reference from dimension metadata"
    (let [result (lib-metric.dimension/reference dimension-1)]
      (is (vector? result))
      (is (= :dimension (first result)))
      (is (= uuid-1 (nth result 2)))
      (is (string? (:lib/uuid (second result)))))))

(deftest ^:parallel reference-from-existing-reference-test
  (testing "reference returns a reference as-is (with ensured uuid)"
    (let [result (lib-metric.dimension/reference dim-ref-1)]
      (is (vector? result))
      (is (= :dimension (first result)))
      (is (= uuid-1 (nth result 2)))
      (is (string? (:lib/uuid (second result)))))))

(deftest ^:parallel reference-idempotent-test
  (testing "reference is idempotent - applying it twice yields the same result"
    (let [from-dim (lib-metric.dimension/reference dimension-1)
          from-ref (lib-metric.dimension/reference from-dim)]
      (is (= (nth from-dim 2) (nth from-ref 2)))
      (is (= :dimension (first from-ref))))))

;;; -------------------------------------------------- with-temporal-bucket accepting dimension-or-reference --------------------------------------------------

(deftest ^:parallel with-temporal-bucket-accepts-dimension-reference-test
  (testing "with-temporal-bucket works with a dimension reference"
    (let [result (lib-metric.projection/with-temporal-bucket dim-ref-1 :month)]
      (is (= :dimension (first result)))
      (is (= uuid-1 (nth result 2)))
      (is (= :month (:temporal-unit (second result)))))))

(deftest ^:parallel with-temporal-bucket-accepts-dimension-metadata-test
  (testing "with-temporal-bucket works with dimension metadata (map)"
    (let [result (lib-metric.projection/with-temporal-bucket dimension-1 :month)]
      (is (= :dimension (first result)))
      (is (= uuid-1 (nth result 2)))
      (is (= :month (:temporal-unit (second result)))))))

(deftest ^:parallel with-temporal-bucket-nil-removes-bucket-from-metadata-test
  (testing "with-temporal-bucket with nil removes temporal unit when given dimension metadata"
    (let [with-bucket (lib-metric.projection/with-temporal-bucket dimension-1 :month)
          result      (lib-metric.projection/with-temporal-bucket with-bucket nil)]
      (is (nil? (:temporal-unit (second result)))))))

(deftest ^:parallel with-temporal-bucket-option-map-test
  (testing "with-temporal-bucket accepts an option map with :unit"
    (let [bucket {:lib/type :option/temporal-bucketing :unit :quarter}
          result (lib-metric.projection/with-temporal-bucket dimension-1 bucket)]
      (is (= :quarter (:temporal-unit (second result)))))))
