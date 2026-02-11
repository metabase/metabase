(ns metabase.lib-metric.binning-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.metadata.provider :as lib-metric.metadata.provider]
   [metabase.lib-metric.projection :as lib-metric.projection]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-numeric "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-latitude "550e8400-e29b-41d4-a716-446655440002")
(def ^:private uuid-longitude "550e8400-e29b-41d4-a716-446655440003")
(def ^:private uuid-no-fingerprint "550e8400-e29b-41d4-a716-446655440004")
(def ^:private uuid-text "550e8400-e29b-41d4-a716-446655440005")
(def ^:private uuid-fk "550e8400-e29b-41d4-a716-446655440006")

(def ^:private numeric-dimension
  {:lib/type       :metadata/dimension
   :id             uuid-numeric
   :name           "amount"
   :display-name   "Amount"
   :effective-type :type/Number
   :semantic-type  nil
   :sources        [{:type :field, :field-id 1, :binning true}]
   :source-type    :metric
   :source-id      1})

(def ^:private latitude-dimension
  {:lib/type       :metadata/dimension
   :id             uuid-latitude
   :name           "latitude"
   :display-name   "Latitude"
   :effective-type :type/Number
   :semantic-type  :type/Latitude
   :sources        [{:type :field, :field-id 2, :binning true}]
   :source-type    :metric
   :source-id      1})

(def ^:private longitude-dimension
  {:lib/type       :metadata/dimension
   :id             uuid-longitude
   :name           "longitude"
   :display-name   "Longitude"
   :effective-type :type/Number
   :semantic-type  :type/Longitude
   :sources        [{:type :field, :field-id 3, :binning true}]
   :source-type    :metric
   :source-id      1})

(def ^:private no-sources-dimension
  {:lib/type       :metadata/dimension
   :id             uuid-no-fingerprint
   :name           "score"
   :display-name   "Score"
   :effective-type :type/Number
   :semantic-type  nil
   :sources        []
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

(def ^:private fk-dimension
  {:lib/type       :metadata/dimension
   :id             uuid-fk
   :name           "user_id"
   :display-name   "User ID"
   :effective-type :type/Integer
   :semantic-type  :type/FK
   :sources        [{:type :field, :field-id 6, :binning true}]
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
  [numeric-dimension latitude-dimension longitude-dimension no-sources-dimension text-dimension fk-dimension])

(def ^:private definition
  {:lib/type          :metric/definition
   :source            {:type     :source/metric
                       :id       1
                       :metadata {:lib/type :metadata/metric :id 1 :name "Test Metric"}}
   :filters           []
   :projections       []
   :metadata-provider (make-mock-provider sample-dimensions)})

;;; -------------------------------------------------- available-binning-strategies --------------------------------------------------

(deftest ^:parallel available-binning-strategies-numeric-test
  (testing "Numeric dimension with binning sources returns numeric binning strategies"
    (let [strategies (lib-metric.projection/available-binning-strategies definition numeric-dimension)]
      (is (sequential? strategies))
      (is (pos? (count strategies)))
      ;; All strategies should have :lib/type and :display-name
      (is (every? #(= :option/binning (:lib/type %)) strategies))
      (is (every? #(contains? % :display-name) strategies))
      ;; Should include auto bin and num-bins options
      (is (some #(= :default (get-in % [:mbql :strategy])) strategies)))))

(deftest ^:parallel available-binning-strategies-coordinate-test
  (testing "Coordinate dimension returns coordinate binning strategies"
    (let [lat-strategies (lib-metric.projection/available-binning-strategies definition latitude-dimension)
          lon-strategies (lib-metric.projection/available-binning-strategies definition longitude-dimension)]
      (is (sequential? lat-strategies))
      (is (pos? (count lat-strategies)))
      (is (sequential? lon-strategies))
      (is (pos? (count lon-strategies)))
      ;; Coordinate binning uses bin-width strategy
      (is (some #(= :bin-width (get-in % [:mbql :strategy])) lat-strategies)))))

(deftest ^:parallel available-binning-strategies-no-sources-test
  (testing "Dimension without field-backed sources returns nil"
    (let [strategies (lib-metric.projection/available-binning-strategies definition no-sources-dimension)]
      (is (nil? strategies)))))

(deftest ^:parallel available-binning-strategies-non-numeric-test
  (testing "Non-numeric dimension returns nil"
    (let [strategies (lib-metric.projection/available-binning-strategies definition text-dimension)]
      (is (nil? strategies)))))

(deftest ^:parallel available-binning-strategies-fk-test
  (testing "Foreign key dimension returns nil despite being numeric"
    (let [strategies (lib-metric.projection/available-binning-strategies definition fk-dimension)]
      ;; FK is :Relation/* which should be excluded
      (is (nil? strategies)))))

(deftest ^:parallel available-binning-strategies-marks-selected-test
  (testing "Selected binning is marked when projection has binning"
    (let [binning {:strategy :num-bins :num-bins 10}
          projection [:dimension {:binning binning} uuid-numeric]
          def-with-proj (assoc definition :projections [projection])
          strategies (lib-metric.projection/available-binning-strategies def-with-proj numeric-dimension)]
      ;; The matching strategy should be marked as selected
      (is (some #(and (= 10 (get-in % [:mbql :num-bins])) (:selected %)) strategies)))))

;;; -------------------------------------------------- binning --------------------------------------------------

(deftest ^:parallel binning-extracts-binning-test
  (testing "binning extracts binning options from projection"
    (let [binning {:strategy :num-bins :num-bins 10}
          projection [:dimension {:binning binning} uuid-numeric]
          result (lib-metric.projection/binning projection)]
      (is (= :num-bins (:strategy result)))
      (is (= 10 (:num-bins result))))))

(deftest ^:parallel binning-returns-nil-when-no-binning-test
  (testing "binning returns nil when no binning in options"
    (let [projection [:dimension {} uuid-numeric]
          result (lib-metric.projection/binning projection)]
      (is (nil? result)))))

(deftest ^:parallel binning-handles-various-strategies-test
  (testing "binning works with various binning strategies"
    (doseq [binning [{:strategy :default}
                     {:strategy :num-bins :num-bins 10}
                     {:strategy :num-bins :num-bins 50}
                     {:strategy :bin-width :bin-width 1.0}]]
      (let [projection [:dimension {:binning binning} uuid-numeric]
            result (lib-metric.projection/binning projection)]
        (is (= (:strategy binning) (:strategy result))
            (str "Failed for strategy: " (:strategy binning)))))))

;;; -------------------------------------------------- with-binning --------------------------------------------------

(deftest ^:parallel with-binning-adds-binning-test
  (testing "with-binning adds binning to projection"
    (let [projection [:dimension {} uuid-numeric]
          binning {:strategy :num-bins :num-bins 10}
          result (lib-metric.projection/with-binning projection binning)]
      (is (= :dimension (first result)))
      (is (= binning (:binning (second result))))
      (is (= uuid-numeric (nth result 2))))))

(deftest ^:parallel with-binning-replaces-existing-binning-test
  (testing "with-binning replaces existing binning"
    (let [projection [:dimension {:binning {:strategy :num-bins :num-bins 10}} uuid-numeric]
          new-binning {:strategy :num-bins :num-bins 50}
          result (lib-metric.projection/with-binning projection new-binning)]
      (is (= 50 (:num-bins (:binning (second result))))))))

(deftest ^:parallel with-binning-removes-binning-with-nil-test
  (testing "with-binning removes binning when passed nil"
    (let [projection [:dimension {:binning {:strategy :num-bins :num-bins 10}} uuid-numeric]
          result (lib-metric.projection/with-binning projection nil)]
      (is (nil? (:binning (second result)))))))

(deftest ^:parallel with-binning-accepts-binning-option-test
  (testing "with-binning accepts binning option with :mbql key"
    (let [projection [:dimension {} uuid-numeric]
          binning-option {:lib/type :option/binning
                          :display-name "10 bins"
                          :mbql {:strategy :num-bins :num-bins 10}}
          result (lib-metric.projection/with-binning projection binning-option)]
      (is (= {:strategy :num-bins :num-bins 10} (:binning (second result)))))))

(deftest ^:parallel with-binning-preserves-other-options-test
  (testing "with-binning preserves other options"
    (let [projection [:dimension {:lib/uuid "test-uuid" :display-name "Test"} uuid-numeric]
          binning {:strategy :default}
          result (lib-metric.projection/with-binning projection binning)]
      (is (= "test-uuid" (:lib/uuid (second result))))
      (is (= "Test" (:display-name (second result))))
      (is (= binning (:binning (second result)))))))

;;; -------------------------------------------------- DimensionMetadata acceptance --------------------------------------------------

(deftest ^:parallel binning-accepts-dimension-metadata-test
  (testing "binning accepts a DimensionMetadata map and returns nil (no binning on bare dimension)"
    (is (nil? (lib-metric.projection/binning numeric-dimension)))))

(deftest ^:parallel with-binning-accepts-dimension-metadata-test
  (testing "with-binning accepts a DimensionMetadata map and produces a properly formed dimension reference"
    (let [binning {:strategy :num-bins :num-bins 10}
          result (lib-metric.projection/with-binning numeric-dimension binning)]
      (is (= :dimension (first result)))
      (is (= uuid-numeric (nth result 2)))
      (is (= binning (:binning (second result)))))))

(deftest ^:parallel with-binning-dimension-metadata-roundtrip-test
  (testing "apply binning to a dimension metadata, then extract it back"
    (let [binning {:strategy :num-bins :num-bins 10}
          result (lib-metric.projection/with-binning numeric-dimension binning)
          extracted (lib-metric.projection/binning result)]
      (is (= :num-bins (:strategy extracted)))
      (is (= 10 (:num-bins extracted))))))
