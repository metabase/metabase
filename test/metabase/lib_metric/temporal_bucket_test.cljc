(ns metabase.lib-metric.temporal-bucket-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.metadata.provider :as lib-metric.metadata.provider]
   [metabase.lib-metric.projection :as lib-metric.projection]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-datetime "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-date "550e8400-e29b-41d4-a716-446655440002")
(def ^:private uuid-time "550e8400-e29b-41d4-a716-446655440003")
(def ^:private uuid-text "550e8400-e29b-41d4-a716-446655440004")

(def ^:private datetime-dimension
  {:lib/type       :metadata/dimension
   :id             uuid-datetime
   :name           "created_at"
   :display-name   "Created At"
   :effective-type :type/DateTime
   :semantic-type  :type/CreationTimestamp
   :source-type    :metric
   :source-id      1})

(def ^:private date-dimension
  {:lib/type       :metadata/dimension
   :id             uuid-date
   :name           "order_date"
   :display-name   "Order Date"
   :effective-type :type/Date
   :semantic-type  nil
   :source-type    :metric
   :source-id      1})

(def ^:private time-dimension
  {:lib/type       :metadata/dimension
   :id             uuid-time
   :name           "time_of_day"
   :display-name   "Time of Day"
   :effective-type :type/Time
   :semantic-type  nil
   :source-type    :metric
   :source-id      1})

(def ^:private text-dimension
  {:lib/type       :metadata/dimension
   :id             uuid-text
   :name           "category"
   :display-name   "Category"
   :effective-type :type/Text
   :semantic-type  :type/Category
   :source-type    :metric
   :source-id      1})

(defn- make-mock-provider
  "Create a mock metadata provider that returns the given dimensions for metric-id queries."
  [dimensions]
  (lib-metric.metadata.provider/metric-context-metadata-provider
   ;; metric-fetcher-fn
   (fn [_metadata-spec] [])
   ;; measure-fetcher-fn
   nil
   ;; dimension-fetcher-fn
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

(def ^:private sample-dimensions
  [datetime-dimension date-dimension time-dimension text-dimension])

(def ^:private definition
  {:lib/type          :metric/definition
   :source            {:type     :source/metric
                       :id       1
                       :metadata {:lib/type :metadata/metric :id 1 :name "Test Metric"}}
   :filters           []
   :projections       []
   :metadata-provider (make-mock-provider sample-dimensions)})

;;; -------------------------------------------------- available-temporal-buckets --------------------------------------------------

(deftest ^:parallel available-temporal-buckets-datetime-test
  (testing "DateTime dimension returns datetime bucket options"
    (let [buckets (lib-metric.projection/available-temporal-buckets definition datetime-dimension)]
      (is (sequential? buckets))
      (is (pos? (count buckets)))
      ;; All buckets should have :unit and :lib/type
      (is (every? #(contains? % :unit) buckets))
      (is (every? #(= :option/temporal-bucketing (:lib/type %)) buckets))
      ;; Should include common datetime units
      (is (some #(= :day (:unit %)) buckets))
      (is (some #(= :month (:unit %)) buckets))
      (is (some #(= :year (:unit %)) buckets)))))

(deftest ^:parallel available-temporal-buckets-date-test
  (testing "Date dimension returns date bucket options"
    (let [buckets (lib-metric.projection/available-temporal-buckets definition date-dimension)]
      (is (sequential? buckets))
      (is (pos? (count buckets)))
      ;; Should include date units
      (is (some #(= :day (:unit %)) buckets))
      (is (some #(= :month (:unit %)) buckets)))))

(deftest ^:parallel available-temporal-buckets-time-test
  (testing "Time dimension returns time bucket options"
    (let [buckets (lib-metric.projection/available-temporal-buckets definition time-dimension)]
      (is (sequential? buckets))
      (is (pos? (count buckets)))
      ;; Should include time units
      (is (some #(= :hour (:unit %)) buckets))
      (is (some #(= :minute (:unit %)) buckets)))))

(deftest ^:parallel available-temporal-buckets-non-temporal-test
  (testing "Non-temporal dimension returns empty list"
    (let [buckets (lib-metric.projection/available-temporal-buckets definition text-dimension)]
      (is (sequential? buckets))
      (is (zero? (count buckets))))))

(deftest ^:parallel available-temporal-buckets-marks-selected-test
  (testing "Selected unit is marked when projection has temporal-unit"
    (let [projection [:dimension {:temporal-unit :month} uuid-datetime]
          def-with-proj (assoc definition :projections [projection])
          buckets (lib-metric.projection/available-temporal-buckets def-with-proj datetime-dimension)]
      (is (some #(and (= :month (:unit %)) (:selected %)) buckets)))))

;;; -------------------------------------------------- temporal-bucket --------------------------------------------------

(deftest ^:parallel temporal-bucket-extracts-unit-test
  (testing "temporal-bucket extracts unit from projection options"
    (let [projection [:dimension {:temporal-unit :month} uuid-datetime]
          result (lib-metric.projection/temporal-bucket projection)]
      (is (= :option/temporal-bucketing (:lib/type result)))
      (is (= :month (:unit result))))))

(deftest ^:parallel temporal-bucket-returns-nil-when-no-unit-test
  (testing "temporal-bucket returns nil when no temporal-unit in options"
    (let [projection [:dimension {} uuid-datetime]
          result (lib-metric.projection/temporal-bucket projection)]
      (is (nil? result)))))

(deftest ^:parallel temporal-bucket-handles-various-units-test
  (testing "temporal-bucket works with various temporal units"
    (doseq [unit [:day :week :month :quarter :year :hour :minute]]
      (let [projection [:dimension {:temporal-unit unit} uuid-datetime]
            result (lib-metric.projection/temporal-bucket projection)]
        (is (= unit (:unit result)) (str "Failed for unit: " unit))))))

;;; -------------------------------------------------- with-temporal-bucket --------------------------------------------------

(deftest ^:parallel with-temporal-bucket-adds-unit-test
  (testing "with-temporal-bucket adds temporal-unit to projection"
    (let [projection [:dimension {} uuid-datetime]
          result (lib-metric.projection/with-temporal-bucket projection :month)]
      (is (= :dimension (first result)))
      (is (= :month (:temporal-unit (second result))))
      (is (= uuid-datetime (nth result 2))))))

(deftest ^:parallel with-temporal-bucket-replaces-existing-unit-test
  (testing "with-temporal-bucket replaces existing temporal-unit"
    (let [projection [:dimension {:temporal-unit :day} uuid-datetime]
          result (lib-metric.projection/with-temporal-bucket projection :month)]
      (is (= :month (:temporal-unit (second result)))))))

(deftest ^:parallel with-temporal-bucket-removes-unit-with-nil-test
  (testing "with-temporal-bucket removes temporal-unit when passed nil"
    (let [projection [:dimension {:temporal-unit :month} uuid-datetime]
          result (lib-metric.projection/with-temporal-bucket projection nil)]
      (is (nil? (:temporal-unit (second result)))))))

(deftest ^:parallel with-temporal-bucket-accepts-option-map-test
  (testing "with-temporal-bucket accepts option map with :unit"
    (let [projection [:dimension {} uuid-datetime]
          bucket {:lib/type :option/temporal-bucketing :unit :week}
          result (lib-metric.projection/with-temporal-bucket projection bucket)]
      (is (= :week (:temporal-unit (second result)))))))

(deftest ^:parallel with-temporal-bucket-preserves-other-options-test
  (testing "with-temporal-bucket preserves other options"
    (let [projection [:dimension {:lib/uuid "test-uuid" :display-name "Test"} uuid-datetime]
          result (lib-metric.projection/with-temporal-bucket projection :month)]
      (is (= "test-uuid" (:lib/uuid (second result))))
      (is (= "Test" (:display-name (second result))))
      (is (= :month (:temporal-unit (second result)))))))
