(ns metabase.channel.render.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.util :as render-util]))

;; Test data and expected results for scalar funnel visualization
(def scalar-funnel-definition
  {:display "funnel"
   :settings {:funnel.metric "METRIC"
              :funnel.dimension "DIMENSION"}})

(def scalar-funnel-series-data
  [{:data {:cols [{:base_type :type/Integer}]}}])

(def expected-scalar-funnel-columns
  [{:name "METRIC"
    :display_name "METRIC"
    :base_type :type/Integer
    :semantic_type :type/Quantity}
   {:name "DIMENSION"
    :display_name "DIMENSION"
    :base_type :type/Text
    :semantic_type :type/Category}])

;; Test data and expected results for standard column mappings
(def standard-mapping-definition
  {:columnValuesMapping
   {:COLUMN_1
    [{:sourceId "card:123"
      :originalName "count"
      :name "COLUMN_1"}]}})

(def standard-mapping-series-data
  [{:card {:id "123" :entity_id "123" :name "Test Card"} ;; Note: using string IDs for consistency
    :data {:cols [{:name "count"
                   :display_name "Count"
                   :base_type :type/Integer
                   :semantic_type :type/Quantity}]
           :rows [[42]]}}])

(def expected-standard-mapping-columns
  [{:name "COLUMN_1"
    :display_name "Test Card: Count"
    :base_type :type/Integer
    :semantic_type :type/Quantity}])

;; Test data and expected results for string mappings
(def string-mapping-definition
  {:columnValuesMapping
   {:COLUMN_1
    ["$_card:123_name" ; This should be ignored in get-visualization-columns
     {:sourceId "card:456"
      :originalName "sum"
      :name "COLUMN_1"}]}})

(def string-mapping-series-data
  [{:card {:id "456" :entity_id "456" :name "Another Test Card"} ;; Note: using string IDs for consistency
    :data {:cols [{:name "sum"
                   :display_name "Sum"
                   :base_type :type/Float
                   :semantic_type :type/Quantity}]
           :rows [[123.45]]}}])

(def expected-string-mapping-columns
  [{:name "COLUMN_1"
    :display_name "Another Test Card: Sum"
    :base_type :type/Float
    :semantic_type :type/Quantity}])

;; Test data for missing column case
(def missing-column-definition
  {:columnValuesMapping
   {:COLUMN_1
    [{:sourceId "card:789"
      :originalName "nonexistent_column"
      :name "COLUMN_1"}]}})

(def missing-column-series-data
  [{:card {:id "789" :entity_id "789" :name "Test Card"} ;; Note: using string IDs for consistency
    :data {:cols [{:name "different_column"
                   :display_name "Different Column"}]
           :rows [[0]]}}])

(deftest ^:parallel test-scalar-funnel-visualization
  (testing "scalar funnel visualization"
    (let [result (render-util/get-visualization-columns scalar-funnel-definition scalar-funnel-series-data)]
      (is (= expected-scalar-funnel-columns result)))))

(deftest ^:parallel test-standard-visualization-with-column-mappings
  (testing "standard visualization with column mappings"
    (let [result (render-util/get-visualization-columns standard-mapping-definition standard-mapping-series-data)]
      (is (= expected-standard-mapping-columns result)))))

(deftest ^:parallel test-ignores-string-mappings
  (testing "ignores string mappings which are name references"
    (let [result (render-util/get-visualization-columns string-mapping-definition string-mapping-series-data)]
      (is (= expected-string-mapping-columns result)))))

(deftest ^:parallel test-handles-missing-column-data
  (testing "handles missing column data gracefully"
    (let [result (render-util/get-visualization-columns missing-column-definition missing-column-series-data)]
      (is (empty? result) "Should return empty list when original column not found"))))

(def entity-id-string-mapping-definition
  {:columnValuesMapping
   {:DIMENSION
    ["$_card:UfzksyybSdOZv1wM7jYnn_name"]}})

(def entity-id-series-data
  [{:card {:id "123" :entity_id "UfzksyybSdOZv1wM7jYnn" :name "Entity ID Card"}
    :data {:cols [{:name "count"
                   :display_name "Count"
                   :base_type :type/Integer
                   :semantic_type :type/Quantity}]
           :rows [[42]]}}])

;; Combined test for both value and name sources in merge-visualizer-data
(def combined-entity-id-definition
  {:display "funnel"
   :columnValuesMapping
   {:METRIC
    [{:sourceId "card:UfzksyybSdOZv1wM7jYnn"
      :originalName "count"
      :name "COLUMN_1"}]
    :DIMENSION
    ["$_card:UfzksyybSdOZv1wM7jYnn_name"]}
   :settings {:funnel.metric "METRIC", :funnel.dimension "DIMENSION"}})

(def expected-merged-data
  {:viz-settings {:funnel.metric "METRIC", :funnel.dimension "DIMENSION"}
   :cols [{:name "METRIC"
           :display_name "METRIC"
           :base_type :type/Integer
           :semantic_type :type/Quantity}
          {:name "DIMENSION"
           :display_name "DIMENSION"
           :base_type :type/Text
           :semantic_type :type/Category}]
   :rows [[42 "Entity ID Card"]]})

(deftest test-merge-visualizer-data-with-entity-ids
  (testing "merge-visualizer-data handles entity IDs correctly"
    (let [result (render-util/merge-visualizer-data
                  entity-id-series-data
                  combined-entity-id-definition)]
      (is (= (:viz-settings expected-merged-data) (:viz-settings result)))
      (is (= (map #(select-keys % [:name :display_name]) (:cols expected-merged-data))
             (map #(select-keys % [:name :display_name]) (:cols result))))
      (is (= (:rows expected-merged-data) (:rows result))))))
