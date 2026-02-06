(ns metabase.lib-metric.projection
  "Core logic for computing projectable dimensions and their positions in a MetricDefinition.
   Projectable dimensions are dimensions that can be used for projections (breakouts)."
  (:require
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

(defn- projection-dimension-id
  "Extract the dimension ID from a projection clause [:dimension opts uuid]."
  [[_tag _opts dimension-id]]
  dimension-id)

(defn- calculate-projection-positions
  "Calculate projection positions for dimensions.
   Returns a map of {dimension-id -> [positions]}."
  [projections]
  (->> projections
       (map-indexed (fn [idx projection]
                      [(projection-dimension-id projection) idx]))
       (reduce (fn [acc [dim-id idx]]
                 (update acc dim-id (fnil conj []) idx))
               {})))

(mu/defn add-projection-positions :- [:sequential ::lib-metric.schema/metadata-dimension]
  "Add :projection-positions to each dimension based on current projections."
  [dimensions  :- [:sequential ::lib-metric.schema/metadata-dimension]
   projections :- [:sequential ::lib-metric.schema/dimension-reference]]
  (let [dim-id->positions (calculate-projection-positions projections)]
    (perf/mapv (fn [dim]
                 (let [positions (get dim-id->positions (:id dim))]
                   (cond-> dim
                     positions (assoc :projection-positions (vec positions)))))
               dimensions)))

(mu/defn projectable-dimensions :- [:sequential ::lib-metric.schema/metadata-dimension]
  "Get dimensions that can be used for projections.
   Returns dimensions with :projection-positions indicating which are already used."
  [definition :- ::lib-metric.schema/metric-definition]
  (let [{:keys [source projections metadata-provider]} definition
        source-type (:type source)
        source-id   (:id source)
        dimensions  (case source-type
                      :source/metric  (lib-metric.dimension/dimensions-for-metric metadata-provider source-id)
                      :source/measure (lib-metric.dimension/dimensions-for-measure metadata-provider source-id))]
    (add-projection-positions dimensions (or projections []))))
