(ns metabase.lib-metric.js-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.js :as lib-metric.js]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private sample-metric-metadata
  {:lib/type           :metadata/metric
   :id                 42
   :name               "Total Revenue"
   :dimensions         []
   :dimension-mappings []
   :dataset-query      {:database 1 :type :query :query {:source-table 1}}})

(def ^:private sample-measure-metadata
  {:lib/type           :metadata/measure
   :id                 99
   :name               "Average Order Value"
   :dimensions         []
   :dimension-mappings []
   :definition         {:database 1 :type :query :query {:source-table 2}}})

(def ^:private mock-provider
  "A mock metadata provider that returns test metric/measure metadata."
  (reify lib.metadata.protocols/MetadataProvider
    (metadatas [_this spec]
      (let [lib-type (:lib/type spec)
            ids      (:id spec)]
        (cond
          (and (= lib-type :metadata/metric) (contains? ids 42))
          [sample-metric-metadata]

          (and (= lib-type :metadata/measure) (contains? ids 99))
          [sample-measure-metadata]

          :else
          [])))))

;;; -------------------------------------------------- toJsMetricDefinition --------------------------------------------------

(deftest ^:parallel toJsMetricDefinition-metric-source-test
  (let [definition {:lib/type          :metric/definition
                    :source            {:type     :source/metric
                                        :id       42
                                        :metadata sample-metric-metadata}
                    :filters           []
                    :projections       []
                    :metadata-provider mock-provider}
        js-def     (lib-metric.js/toJsMetricDefinition definition)
        clj-def    (js->clj js-def :keywordize-keys true)]
    (testing "has source-metric key with correct ID"
      (is (= 42 (:source-metric clj-def))))
    (testing "does not have source-measure key"
      (is (not (contains? clj-def :source-measure))))
    (testing "omits empty filters"
      (is (not (contains? clj-def :filters))))
    (testing "omits empty projections"
      (is (not (contains? clj-def :projections))))))

(deftest ^:parallel toJsMetricDefinition-measure-source-test
  (let [definition {:lib/type          :metric/definition
                    :source            {:type     :source/measure
                                        :id       99
                                        :metadata sample-measure-metadata}
                    :filters           []
                    :projections       []
                    :metadata-provider mock-provider}
        js-def     (lib-metric.js/toJsMetricDefinition definition)
        clj-def    (js->clj js-def :keywordize-keys true)]
    (testing "has source-measure key with correct ID"
      (is (= 99 (:source-measure clj-def))))
    (testing "does not have source-metric key"
      (is (not (contains? clj-def :source-metric))))))

(deftest ^:parallel toJsMetricDefinition-with-filters-and-projections-test
  (let [filter-clause [:= [:dimension {} "uuid-1"] "Electronics"]
        projection    [:dimension {} "uuid-2"]
        definition    {:lib/type          :metric/definition
                       :source            {:type     :source/metric
                                           :id       42
                                           :metadata sample-metric-metadata}
                       :filters           [filter-clause]
                       :projections       [projection]
                       :metadata-provider mock-provider}
        js-def        (lib-metric.js/toJsMetricDefinition definition)
        clj-def       (js->clj js-def :keywordize-keys true)]
    (testing "includes filters when present"
      ;; Keywords become strings after clj->js conversion
      (is (= [["=" ["dimension" {} "uuid-1"] "Electronics"]] (:filters clj-def))))
    (testing "includes projections when present"
      (is (= [["dimension" {} "uuid-2"]] (:projections clj-def))))))

;;; -------------------------------------------------- fromJsMetricDefinition --------------------------------------------------

(deftest ^:parallel fromJsMetricDefinition-metric-source-test
  (let [js-def     #js {:source-metric 42}
        definition (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
    (testing "has correct lib/type"
      (is (= :metric/definition (:lib/type definition))))
    (testing "has correct source type"
      (is (= :source/metric (get-in definition [:source :type]))))
    (testing "has correct source ID"
      (is (= 42 (get-in definition [:source :id]))))
    (testing "has hydrated source metadata"
      (is (= sample-metric-metadata (get-in definition [:source :metadata]))))
    (testing "has empty filters"
      (is (= [] (:filters definition))))
    (testing "has empty projections"
      (is (= [] (:projections definition))))
    (testing "preserves metadata-provider"
      (is (= mock-provider (:metadata-provider definition))))))

(deftest ^:parallel fromJsMetricDefinition-measure-source-test
  (let [js-def     #js {:source-measure 99}
        definition (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
    (testing "has correct source type"
      (is (= :source/measure (get-in definition [:source :type]))))
    (testing "has correct source ID"
      (is (= 99 (get-in definition [:source :id]))))
    (testing "has hydrated source metadata"
      (is (= sample-measure-metadata (get-in definition [:source :metadata]))))))

(deftest ^:parallel fromJsMetricDefinition-with-filters-and-projections-test
  (let [;; JS arrays with nested structures - keywords become strings after js->clj
        js-def     #js {:source-metric 42
                        :filters       #js [#js ["=" #js ["dimension" #js {} "uuid-1"] "Electronics"]]
                        :projections   #js [#js ["dimension" #js {} "uuid-2"]]}
        definition (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
    (testing "converts filters from JS"
      ;; After js->clj, arrays become vectors and objects become maps with keyword keys
      (is (= [["=" ["dimension" {} "uuid-1"] "Electronics"]] (:filters definition))))
    (testing "converts projections from JS"
      (is (= [["dimension" {} "uuid-2"]] (:projections definition))))))

(deftest ^:parallel fromJsMetricDefinition-throws-without-source-test
  (let [js-def #js {:filters #js []}]
    (is (thrown-with-msg? js/Error #"must have source-metric or source-measure"
                          (lib-metric.js/fromJsMetricDefinition mock-provider js-def)))))

;;; -------------------------------------------------- Round-trip Tests --------------------------------------------------

(deftest ^:parallel round-trip-metric-definition-test
  (testing "metric-based definition round-trips correctly"
    (let [original   {:lib/type          :metric/definition
                      :source            {:type     :source/metric
                                          :id       42
                                          :metadata sample-metric-metadata}
                      :filters           []
                      :projections       []
                      :metadata-provider mock-provider}
          js-def     (lib-metric.js/toJsMetricDefinition original)
          round-trip (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
      (is (= :metric/definition (:lib/type round-trip)))
      (is (= :source/metric (get-in round-trip [:source :type])))
      (is (= 42 (get-in round-trip [:source :id])))
      (is (= [] (:filters round-trip)))
      (is (= [] (:projections round-trip))))))

(deftest ^:parallel round-trip-measure-definition-test
  (testing "measure-based definition round-trips correctly"
    (let [original   {:lib/type          :metric/definition
                      :source            {:type     :source/measure
                                          :id       99
                                          :metadata sample-measure-metadata}
                      :filters           []
                      :projections       []
                      :metadata-provider mock-provider}
          js-def     (lib-metric.js/toJsMetricDefinition original)
          round-trip (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
      (is (= :metric/definition (:lib/type round-trip)))
      (is (= :source/measure (get-in round-trip [:source :type])))
      (is (= 99 (get-in round-trip [:source :id]))))))

(deftest ^:parallel round-trip-with-filters-and-projections-test
  (testing "definition with filters/projections round-trips correctly"
    (let [;; Use simple vectors that will survive js->clj conversion
          filter-clause ["=" "dimension-uuid" "value"]
          projection    ["dimension" "uuid-2"]
          original      {:lib/type          :metric/definition
                         :source            {:type     :source/metric
                                             :id       42
                                             :metadata sample-metric-metadata}
                         :filters           [filter-clause]
                         :projections       [projection]
                         :metadata-provider mock-provider}
          js-def        (lib-metric.js/toJsMetricDefinition original)
          round-trip    (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
      (is (= [filter-clause] (:filters round-trip)))
      (is (= [projection] (:projections round-trip))))))

;;; -------------------------------------------------- MetadataProviderable Tests --------------------------------------------------

(def ^:private sample-definition
  "A sample MetricDefinition that can be used as a MetadataProviderable."
  {:lib/type          :metric/definition
   :source            {:type     :source/metric
                       :id       42
                       :metadata sample-metric-metadata}
   :filters           []
   :projections       []
   :metadata-provider mock-provider})

(deftest ^:parallel metricMetadata-accepts-definition-test
  (testing "metricMetadata accepts a MetricDefinition as MetadataProviderable"
    (let [result (lib-metric.js/metricMetadata sample-definition 42)]
      (is (some? result))
      (is (= :metadata/metric (:lib/type result)))
      (is (= 42 (:id result))))))

(deftest ^:parallel metricMetadata-returns-nil-for-missing-metric-test
  (testing "metricMetadata returns nil for missing metric when using definition"
    (let [result (lib-metric.js/metricMetadata sample-definition 999)]
      (is (nil? result)))))

(deftest ^:parallel measureMetadata-accepts-definition-test
  (testing "measureMetadata accepts a MetricDefinition as MetadataProviderable"
    (let [result (lib-metric.js/measureMetadata sample-definition 99)]
      (is (some? result))
      (is (= :metadata/measure (:lib/type result)))
      (is (= 99 (:id result))))))

(deftest ^:parallel measureMetadata-returns-nil-for-missing-measure-test
  (testing "measureMetadata returns nil for missing measure when using definition"
    (let [result (lib-metric.js/measureMetadata sample-definition 999)]
      (is (nil? result)))))

(deftest ^:parallel fromMetricMetadata-accepts-definition-test
  (testing "fromMetricMetadata accepts a MetricDefinition as MetadataProviderable"
    (let [new-definition (lib-metric.js/fromMetricMetadata sample-definition sample-metric-metadata)]
      (is (= :metric/definition (:lib/type new-definition)))
      (is (= :source/metric (get-in new-definition [:source :type])))
      (is (= 42 (get-in new-definition [:source :id])))
      (is (= mock-provider (:metadata-provider new-definition))))))

(deftest ^:parallel fromMeasureMetadata-accepts-definition-test
  (testing "fromMeasureMetadata accepts a MetricDefinition as MetadataProviderable"
    (let [new-definition (lib-metric.js/fromMeasureMetadata sample-definition sample-measure-metadata)]
      (is (= :metric/definition (:lib/type new-definition)))
      (is (= :source/measure (get-in new-definition [:source :type])))
      (is (= 99 (get-in new-definition [:source :id])))
      (is (= mock-provider (:metadata-provider new-definition))))))

(deftest ^:parallel fromJsMetricDefinition-accepts-definition-test
  (testing "fromJsMetricDefinition accepts a MetricDefinition as MetadataProviderable"
    (let [js-def         #js {:source-metric 42}
          new-definition (lib-metric.js/fromJsMetricDefinition sample-definition js-def)]
      (is (= :metric/definition (:lib/type new-definition)))
      (is (= :source/metric (get-in new-definition [:source :type])))
      (is (= 42 (get-in new-definition [:source :id])))
      (is (= sample-metric-metadata (get-in new-definition [:source :metadata])))
      (is (= mock-provider (:metadata-provider new-definition))))))
