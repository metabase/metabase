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
                    :expression        [:metric {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
                    :filters           []
                    :projections       []
                    :metadata-provider mock-provider}
        js-def     (lib-metric.js/toJsMetricDefinition definition)
        clj-def    (js->clj js-def :keywordize-keys true)]
    (testing "has expression key with metric expression"
      (is (= ["metric" {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42] (:expression clj-def))))
    (testing "omits empty filters"
      (is (not (contains? clj-def :filters))))
    (testing "omits empty projections"
      (is (not (contains? clj-def :projections))))))

(deftest ^:parallel toJsMetricDefinition-measure-source-test
  (let [definition {:lib/type          :metric/definition
                    :expression        [:measure {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 99]
                    :filters           []
                    :projections       []
                    :metadata-provider mock-provider}
        js-def     (lib-metric.js/toJsMetricDefinition definition)
        clj-def    (js->clj js-def :keywordize-keys true)]
    (testing "has expression key with measure expression"
      (is (= ["measure" {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 99] (:expression clj-def))))))

(deftest ^:parallel toJsMetricDefinition-with-filters-and-projections-test
  (let [inst-filter {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
                     :filter   [:= {} [:dimension {} "uuid-1"] "Electronics"]}
        typed-proj  {:type :metric :id 42 :projection [[:dimension {} "uuid-2"]]}
        definition  {:lib/type          :metric/definition
                     :expression        [:metric {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
                     :filters           [inst-filter]
                     :projections       [typed-proj]
                     :metadata-provider mock-provider}
        js-def      (lib-metric.js/toJsMetricDefinition definition)
        clj-def     (js->clj js-def :keywordize-keys true)]
    (testing "includes filters when present"
      (is (some? (:filters clj-def))))
    (testing "includes projections when present"
      (is (some? (:projections clj-def))))))

;;; -------------------------------------------------- fromJsMetricDefinition --------------------------------------------------

(deftest ^:parallel fromJsMetricDefinition-expression-format-test
  (let [js-def     #js {:expression #js ["metric" #js {"lib/uuid" "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]}
        definition (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
    (testing "has correct lib/type"
      (is (= :metric/definition (:lib/type definition))))
    (testing "has correct expression"
      (is (= :metric (first (:expression definition))))
      (is (= 42 (nth (:expression definition) 2))))
    (testing "has empty filters"
      (is (= [] (:filters definition))))
    (testing "has empty projections"
      (is (= [] (:projections definition))))
    (testing "preserves metadata-provider"
      (is (= mock-provider (:metadata-provider definition))))))

(deftest ^:parallel fromJsMetricDefinition-legacy-metric-source-test
  (let [js-def     #js {:source-metric 42}
        definition (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
    (testing "has correct lib/type"
      (is (= :metric/definition (:lib/type definition))))
    (testing "has expression with metric type"
      (is (= :metric (first (:expression definition))))
      (is (= 42 (nth (:expression definition) 2))))
    (testing "has empty filters"
      (is (= [] (:filters definition))))
    (testing "has empty projections"
      (is (= [] (:projections definition))))
    (testing "preserves metadata-provider"
      (is (= mock-provider (:metadata-provider definition))))))

(deftest ^:parallel fromJsMetricDefinition-legacy-measure-source-test
  (let [js-def     #js {:source-measure 99}
        definition (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
    (testing "has expression with measure type"
      (is (= :measure (first (:expression definition))))
      (is (= 99 (nth (:expression definition) 2))))))

(deftest ^:parallel fromJsMetricDefinition-with-filters-and-projections-test
  (let [js-def     #js {:expression  #js ["metric" #js {"lib/uuid" "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
                        :filters     #js [#js {"lib/uuid" "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
                                               :filter    #js ["=" #js {} #js ["dimension" #js {} "uuid-1"] "Electronics"]}]
                        :projections #js [#js {:type "metric" :id 42
                                               :projection #js [#js ["dimension" #js {} "uuid-2"]]}]}
        definition (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
    (testing "converts instance filters"
      (is (= 1 (count (:filters definition))))
      (is (= "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" (:lib/uuid (first (:filters definition)))))
      (is (= := (first (:filter (first (:filters definition)))))))
    (testing "converts typed projections"
      (is (= 1 (count (:projections definition))))
      (is (= :metric (:type (first (:projections definition)))))
      (is (= 42 (:id (first (:projections definition))))))))

(deftest ^:parallel fromJsMetricDefinition-throws-without-source-test
  (let [js-def #js {:filters #js []}]
    (is (thrown-with-msg? js/Error #"must have expression or source-metric"
                          (lib-metric.js/fromJsMetricDefinition mock-provider js-def)))))

;;; -------------------------------------------------- Round-trip Tests --------------------------------------------------

(deftest ^:parallel round-trip-metric-definition-test
  (testing "metric-based definition round-trips correctly"
    (let [original   {:lib/type          :metric/definition
                      :expression        [:metric {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
                      :filters           []
                      :projections       []
                      :metadata-provider mock-provider}
          js-def     (lib-metric.js/toJsMetricDefinition original)
          round-trip (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
      (is (= :metric/definition (:lib/type round-trip)))
      (is (= :metric (first (:expression round-trip))))
      (is (= 42 (nth (:expression round-trip) 2)))
      (is (= [] (:filters round-trip)))
      (is (= [] (:projections round-trip))))))

(deftest ^:parallel round-trip-measure-definition-test
  (testing "measure-based definition round-trips correctly"
    (let [original   {:lib/type          :metric/definition
                      :expression        [:measure {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 99]
                      :filters           []
                      :projections       []
                      :metadata-provider mock-provider}
          js-def     (lib-metric.js/toJsMetricDefinition original)
          round-trip (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
      (is (= :metric/definition (:lib/type round-trip)))
      (is (= :measure (first (:expression round-trip))))
      (is (= 99 (nth (:expression round-trip) 2))))))

(deftest ^:parallel round-trip-with-filters-and-projections-test
  (testing "definition with filters/projections round-trips correctly"
    (let [inst-filter {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
                       :filter   [:= {} [:dimension {} "dimension-uuid"] "value"]}
          typed-proj  {:type :metric :id 42 :projection [[:dimension {} "uuid-2"]]}
          original    {:lib/type          :metric/definition
                       :expression        [:metric {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
                       :filters           [inst-filter]
                       :projections       [typed-proj]
                       :metadata-provider mock-provider}
          js-def      (lib-metric.js/toJsMetricDefinition original)
          round-trip  (lib-metric.js/fromJsMetricDefinition mock-provider js-def)]
      ;; After round-trip, check structure is preserved
      (is (= 1 (count (:filters round-trip))))
      (is (= 1 (count (:projections round-trip)))))))

;;; -------------------------------------------------- MetadataProviderable Tests --------------------------------------------------

(def ^:private sample-definition
  "A sample MetricDefinition that can be used as a MetadataProviderable."
  {:lib/type          :metric/definition
   :expression        [:metric {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
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
      (is (= :metric (first (:expression new-definition))))
      (is (= 42 (nth (:expression new-definition) 2)))
      (is (= mock-provider (:metadata-provider new-definition))))))

(deftest ^:parallel fromMeasureMetadata-accepts-definition-test
  (testing "fromMeasureMetadata accepts a MetricDefinition as MetadataProviderable"
    (let [new-definition (lib-metric.js/fromMeasureMetadata sample-definition sample-measure-metadata)]
      (is (= :metric/definition (:lib/type new-definition)))
      (is (= :measure (first (:expression new-definition))))
      (is (= 99 (nth (:expression new-definition) 2)))
      (is (= mock-provider (:metadata-provider new-definition))))))

(deftest ^:parallel fromJsMetricDefinition-accepts-definition-test
  (testing "fromJsMetricDefinition accepts a MetricDefinition as MetadataProviderable"
    (let [js-def         #js {:source-metric 42}
          new-definition (lib-metric.js/fromJsMetricDefinition sample-definition js-def)]
      (is (= :metric/definition (:lib/type new-definition)))
      (is (= :metric (first (:expression new-definition))))
      (is (= 42 (nth (:expression new-definition) 2)))
      (is (= mock-provider (:metadata-provider new-definition))))))

;;; -------------------------------------------------- filter --------------------------------------------------

(deftest ^:parallel filter-adds-clause-test
  (testing "filter adds a filter clause to the definition"
    (let [filter-clause [:= {} [:dimension {} "dim-uuid"] "value"]
          result        (lib-metric.js/filter sample-definition filter-clause)]
      (is (= :metric/definition (:lib/type result)))
      (is (= 1 (count (:filters result))))
      (is (= filter-clause (:filter (first (:filters result))))))))

(deftest ^:parallel filter-appends-to-existing-test
  (testing "filter appends to existing filters"
    (let [existing-inst {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
                         :filter   [:= {} [:dimension {} "dim-1"] "a"]}
          new-filter    [:= {} [:dimension {} "dim-2"] "b"]
          definition    (assoc sample-definition :filters [existing-inst])
          result        (lib-metric.js/filter definition new-filter)]
      (is (= 2 (count (:filters result))))
      (is (= [:= {} [:dimension {} "dim-1"] "a"] (:filter (first (:filters result))))))))

;;; -------------------------------------------------- filterableDimensionOperators --------------------------------------------------

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

(deftest ^:parallel filterableDimensionOperators-string-test
  (testing "filterableDimensionOperators returns string operators for string dimension"
    (let [result (lib-metric.js/filterableDimensionOperators string-dimension)]
      (is (array? result))
      (is (= ["is-empty" "not-empty" "=" "!=" "contains" "does-not-contain" "starts-with" "ends-with"]
             (js->clj result))))))

(deftest ^:parallel filterableDimensionOperators-number-test
  (testing "filterableDimensionOperators returns number operators for number dimension"
    (let [result (lib-metric.js/filterableDimensionOperators number-dimension)]
      (is (array? result))
      (is (= ["is-null" "not-null" "=" "!=" ">" ">=" "<" "<=" "between"]
             (js->clj result))))))

;;; -------------------------------------------------- withTemporalBucket --------------------------------------------------

(def ^:private datetime-dimension
  {:lib/type       :metadata/dimension
   :id             "dim-datetime"
   :name           "created_at"
   :display-name   "Created At"
   :effective-type :type/DateTime
   :semantic-type  :type/CreationTimestamp
   :source-type    :metric
   :source-id      1})

(def ^:private dim-ref-datetime
  [:dimension {:lib/uuid "cccccccc-cccc-cccc-cccc-cccccccccccc"} "dim-datetime"])

(deftest ^:parallel withTemporalBucket-accepts-dimension-reference-test
  (testing "withTemporalBucket works with a dimension reference"
    (let [result (lib-metric.js/withTemporalBucket dim-ref-datetime :month)]
      (is (vector? result))
      (is (= :dimension (first result)))
      (is (= "dim-datetime" (nth result 2)))
      (is (= :month (:temporal-unit (second result)))))))

(deftest ^:parallel withTemporalBucket-accepts-dimension-metadata-test
  (testing "withTemporalBucket works with dimension metadata (map)"
    (let [result (lib-metric.js/withTemporalBucket datetime-dimension :month)]
      (is (vector? result))
      (is (= :dimension (first result)))
      (is (= "dim-datetime" (nth result 2)))
      (is (= :month (:temporal-unit (second result)))))))

(deftest ^:parallel withTemporalBucket-nil-removes-bucket-test
  (testing "withTemporalBucket with nil removes the temporal unit"
    (let [with-bucket (lib-metric.js/withTemporalBucket datetime-dimension :month)
          result      (lib-metric.js/withTemporalBucket with-bucket nil)]
      (is (nil? (:temporal-unit (second result)))))))

;;; -------------------------------------------------- sourceInstances --------------------------------------------------

(deftest ^:parallel sourceInstances-single-leaf-test
  (testing "sourceInstances returns JS array with one entry for single-source"
    (let [result (lib-metric.js/sourceInstances sample-definition)]
      (is (array? result))
      (is (= 1 (.-length result)))
      (let [inst (js->clj (aget result 0))]
        (is (= "metric" (first inst)))
        (is (= 42 (nth inst 2)))))))

(deftest ^:parallel sourceInstances-multi-source-test
  (testing "sourceInstances returns JS arrays for multi-source expression"
    (let [leaf1 [:metric {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
          leaf2 [:measure {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 99]
          definition (assoc sample-definition
                            :expression [:+ {} leaf1 leaf2])
          result (lib-metric.js/sourceInstances definition)]
      (is (array? result))
      (is (= 2 (.-length result)))
      (let [inst1 (js->clj (aget result 0))
            inst2 (js->clj (aget result 1))]
        (is (= "metric" (first inst1)))
        (is (= 42 (nth inst1 2)))
        (is (= "measure" (first inst2)))
        (is (= 99 (nth inst2 2)))))))

;;; -------------------------------------------------- filters multi-arity --------------------------------------------------

(deftest ^:parallel filters-1-arity-returns-flat-clauses-test
  (testing "filters 1-arity returns flat MBQL filter clauses"
    (let [filter-clause [:= {} [:dimension {} "dim-uuid"] "value"]
          definition    (lib-metric.js/filter sample-definition filter-clause)
          result        (lib-metric.js/filters definition)]
      (is (array? result))
      (is (= 1 (.-length result)))
      ;; Should be the flat filter clause, not the instance-filter wrapper
      (is (= := (first (aget result 0)))))))

(deftest ^:parallel filters-1-arity-throws-for-multi-source-test
  (testing "filters 1-arity throws for multi-source definition"
    (let [definition (assoc sample-definition
                            :expression [:+ {}
                                         [:metric {:lib/uuid "a"} 1]
                                         [:metric {:lib/uuid "b"} 2]])]
      (is (thrown? js/Error (lib-metric.js/filters definition))))))

(deftest ^:parallel filters-2-arity-returns-scoped-results-test
  (testing "filters 2-arity returns filters scoped to source instance"
    (let [leaf1      [:metric {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
          leaf2      [:measure {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 99]
          filter1    {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
                      :filter   [:= {} [:dimension {} "d1"] "v1"]}
          filter2    {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
                      :filter   [:= {} [:dimension {} "d2"] "v2"]}
          definition (assoc sample-definition
                            :expression [:+ {} leaf1 leaf2]
                            :filters [filter1 filter2])
          js-inst    #js ["metric" #js {"lib/uuid" "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
          result     (lib-metric.js/filters definition js-inst)]
      (is (array? result))
      (is (= 1 (.-length result)))
      (is (= := (first (aget result 0)))))))

;;; -------------------------------------------------- sourceMetricId / sourceMeasureId with multi-source --------------------------------------------------

(deftest ^:parallel sourceMetricId-returns-nil-for-multi-source-test
  (testing "sourceMetricId returns nil for multi-source"
    (let [definition (assoc sample-definition
                            :expression [:+ {}
                                         [:metric {:lib/uuid "a"} 1]
                                         [:metric {:lib/uuid "b"} 2]])]
      (is (nil? (lib-metric.js/sourceMetricId definition))))))

(deftest ^:parallel sourceMeasureId-returns-nil-for-multi-source-test
  (testing "sourceMeasureId returns nil for multi-source"
    (let [definition (assoc sample-definition
                            :expression [:+ {}
                                         [:metric {:lib/uuid "a"} 1]
                                         [:metric {:lib/uuid "b"} 2]])]
      (is (nil? (lib-metric.js/sourceMeasureId definition))))))

;;; -------------------------------------------------- projections multi-arity --------------------------------------------------

(deftest ^:parallel projections-1-arity-returns-flat-dim-refs-test
  (testing "projections 1-arity returns flat dimension references"
    (let [dim-ref    [:dimension {:lib/uuid "xxx"} "dim-uuid"]
          definition (assoc sample-definition
                            :projections [{:type :metric :id 42
                                           :projection [dim-ref]}])
          result     (lib-metric.js/projections definition)]
      (is (array? result))
      (is (= 1 (.-length result)))
      (is (= :dimension (first (aget result 0)))))))

(deftest ^:parallel projections-1-arity-throws-for-multi-source-test
  (testing "projections 1-arity throws for multi-source definition"
    (let [definition (assoc sample-definition
                            :expression [:+ {}
                                         [:metric {:lib/uuid "a"} 1]
                                         [:metric {:lib/uuid "b"} 2]])]
      (is (thrown? js/Error (lib-metric.js/projections definition))))))

;;; -------------------------------------------------- filter multi-arity --------------------------------------------------

(deftest ^:parallel filter-3-arity-adds-to-correct-instance-test
  (testing "filter 3-arity adds filter to correct instance UUID"
    (let [leaf1        [:metric {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 42]
          leaf2        [:measure {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 99]
          definition   (assoc sample-definition
                              :expression [:+ {} leaf1 leaf2])
          filter-clause [:= {} [:dimension {} "dim-uuid"] "value"]
          js-inst       #js ["measure" #js {"lib/uuid" "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 99]
          result        (lib-metric.js/filter definition filter-clause js-inst)]
      (is (= 1 (count (:filters result))))
      (is (= "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
             (:lib/uuid (first (:filters result))))))))
