(ns metabase.lib-metric.definition
  "Functions for creating and manipulating MetricDefinitions."
  (:require
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.util.malli :as mu]))

(mu/defn from-metric-metadata :- ::lib-metric.schema/metric-definition
  "Create a MetricDefinition from MetricMetadata."
  [provider metric-metadata]
  (let [dimensions (lib-metric.dimension/get-persisted-dimensions metric-metadata)
        mappings   (lib-metric.dimension/get-persisted-dimension-mappings metric-metadata)]
    {:lib/type           :metric/definition
     :source             {:type     :source/metric
                          :id       (:id metric-metadata)
                          :metadata metric-metadata}
     :filters            []
     :projections        []
     :dimensions         (or dimensions [])
     :dimension-mappings (or mappings [])
     :metadata-provider  provider}))

(mu/defn from-measure-metadata :- ::lib-metric.schema/metric-definition
  "Create a MetricDefinition from MeasureMetadata."
  [provider measure-metadata]
  (let [dimensions (lib-metric.dimension/get-persisted-dimensions measure-metadata)
        mappings   (lib-metric.dimension/get-persisted-dimension-mappings measure-metadata)]
    {:lib/type           :metric/definition
     :source             {:type     :source/measure
                          :id       (:id measure-metadata)
                          :metadata measure-metadata}
     :filters            []
     :projections        []
     :dimensions         (or dimensions [])
     :dimension-mappings (or mappings [])
     :metadata-provider  provider}))

(mu/defn source-metric-id :- [:maybe pos-int?]
  "Get the source metric ID if this definition is based on a metric."
  [definition :- ::lib-metric.schema/metric-definition]
  (when (= :source/metric (get-in definition [:source :type]))
    (get-in definition [:source :id])))

(mu/defn source-measure-id :- [:maybe pos-int?]
  "Get the source measure ID if this definition is based on a measure."
  [definition :- ::lib-metric.schema/metric-definition]
  (when (= :source/measure (get-in definition [:source :type]))
    (get-in definition [:source :id])))

(defn filters
  "Get the filter clauses from a metric definition."
  [definition]
  (:filters definition))

(defn projections
  "Get the projection clauses from a metric definition."
  [definition]
  (:projections definition))
