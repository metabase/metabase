(ns metabase.lib-metric.projection
  "Core logic for computing projectable dimensions and their positions in a MetricDefinition.
   Projectable dimensions are dimensions that can be used for projections (breakouts)."
  (:require
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
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
  (let [{:keys [expression projections metadata-provider]} definition
        leaf-type (lib-metric.definition/expression-leaf-type expression)
        leaf-id   (lib-metric.definition/expression-leaf-id expression)
        dimensions (case leaf-type
                     :metric  (lib-metric.dimension/dimensions-for-metric metadata-provider leaf-id)
                     :measure (lib-metric.dimension/dimensions-for-measure metadata-provider leaf-id))
        flat-projs (lib-metric.definition/flat-projections (or projections []))]
    (add-projection-positions dimensions flat-projs)))

(mu/defn project :- ::lib-metric.schema/metric-definition
  "Add a projection for a dimension to a metric definition.
   Creates a dimension reference and appends it to the matching typed-projection entry,
   or creates a new typed-projection entry if none exists for this source."
  [definition :- ::lib-metric.schema/metric-definition
   dimension :- ::lib-metric.schema/metadata-dimension]
  (let [expression    (:expression definition)
        leaf-type     (lib-metric.definition/expression-leaf-type expression)
        leaf-id       (lib-metric.definition/expression-leaf-id expression)
        dimension-ref (lib.options/ensure-uuid [:dimension {} (:id dimension)])
        projections   (or (:projections definition) [])
        ;; Find existing typed-projection entry for this source
        existing-idx  (some (fn [[idx tp]]
                              (when (and (= leaf-type (:type tp)) (= leaf-id (:id tp)))
                                idx))
                            (map-indexed vector projections))]
    (if existing-idx
      ;; Append dim-ref to existing typed-projection's :projection vector
      (update-in definition [:projections existing-idx :projection] conj dimension-ref)
      ;; Create new typed-projection entry
      (update definition :projections (fnil conj [])
              {:type leaf-type :id leaf-id :projection [dimension-ref]}))))

(mu/defn projection-dimension :- [:maybe ::lib-metric.schema/metadata-dimension]
  "Get the dimension metadata for a projection clause.
   The projection is a dimension-reference [:dimension opts uuid].
   Returns the dimension metadata or nil if not found."
  [definition :- ::lib-metric.schema/metric-definition
   projection-or-reference :- ::lib-metric.schema/dimension-or-reference]
  (let [dimensions (projectable-dimensions definition)
        dimension-id (if (map? projection-or-reference)
                       (:id projection-or-reference)
                       (projection-dimension-id projection-or-reference))]
    (some #(when (= (:id %) dimension-id) %) dimensions)))

;;; -------------------------------------------------- Temporal Bucket Functions --------------------------------------------------

(mu/defn available-temporal-buckets :- [:sequential [:ref ::lib.schema.temporal-bucketing/option]]
  "Get available temporal buckets for a dimension based on its effective-type."
  [definition :- ::lib-metric.schema/metric-definition
   dimension  :- ::lib-metric.schema/metadata-dimension]
  (let [effective-type (or (:effective-type dimension) (:base-type dimension))
        flat-projs    (lib-metric.definition/flat-projections (or (:projections definition) []))
        ;; Find if this dimension already has a projection with a temporal unit
        selected-unit (some (fn [proj]
                              (when (= (:id dimension) (projection-dimension-id proj))
                                (:temporal-unit (second proj))))
                            flat-projs)]
    (if (isa? effective-type :type/Temporal)
      (lib.temporal-bucket/available-temporal-buckets-for-type
       effective-type
       :month  ;; default unit
       selected-unit)
      [])))

(mu/defn temporal-bucket :- [:maybe ::lib.schema.temporal-bucketing/option]
  "Get the current temporal bucket from a projection clause."
  [projection :- ::lib-metric.schema/dimension-or-reference]
  (when-let [unit (:temporal-unit (second (lib-metric.dimension/reference projection)))]
    {:lib/type :option/temporal-bucketing
     :unit     unit}))

(mu/defn with-temporal-bucket :- ::lib-metric.schema/dimension-reference
  "Apply a temporal bucket to a projection. Pass nil to remove the bucket."
  [projection :- ::lib-metric.schema/dimension-or-reference
   bucket     :- [:maybe [:or
                          ::lib.schema.temporal-bucketing/option
                          ::lib.schema.temporal-bucketing/unit]]]
  (let [unit (cond
               (nil? bucket) nil
               (keyword? bucket) bucket
               (map? bucket) (:unit bucket))]
    (lib.options/update-options (lib-metric.dimension/reference projection)
                                (fn [opts]
                                  (if unit
                                    (assoc opts :temporal-unit unit)
                                    (dissoc opts :temporal-unit))))))

;;; -------------------------------------------------- Binning Functions --------------------------------------------------

(mu/defn available-binning-strategies :- [:maybe [:sequential [:ref ::lib.schema.binning/binning-option]]]
  "Get available binning strategies for a dimension based on its type and sources."
  [definition :- ::lib-metric.schema/metric-definition
   dimension  :- ::lib-metric.schema/metadata-dimension]
  (let [effective-type (:effective-type dimension)
        semantic-type  (:semantic-type dimension)
        sources        (:sources dimension)
        has-binning?   (and (seq sources) (some :field-id sources))
        flat-projs     (lib-metric.definition/flat-projections (or (:projections definition) []))
        existing       (some (fn [proj]
                               (when (= (:id dimension) (projection-dimension-id proj))
                                 (:binning (second proj))))
                             flat-projs)
        strategies     (cond
                         (not has-binning?)
                         nil

                         ;; Coordinate binning for lat/long
                         (isa? semantic-type :type/Coordinate)
                         (lib.binning/coordinate-binning-strategies)

                         ;; Numeric binning for numbers (not relations)
                         (and (isa? effective-type :type/Number)
                              (not (isa? semantic-type :Relation/*)))
                         (lib.binning/numeric-binning-strategies)

                         :else nil)]
    (when strategies
      (for [strategy strategies]
        (cond-> strategy
          existing (dissoc :default)
          (lib.binning/strategy= strategy existing) (assoc :selected true))))))

(mu/defn binning :- [:maybe ::lib.schema.binning/binning]
  "Get the current binning from a projection clause."
  [projection :- ::lib-metric.schema/dimension-or-reference]
  (:binning (second (lib-metric.dimension/reference projection))))

(mu/defn with-binning :- ::lib-metric.schema/dimension-reference
  "Apply a binning strategy to a projection. Pass nil to remove binning."
  [projection :- ::lib-metric.schema/dimension-or-reference
   binning-option :- [:maybe [:or ::lib.schema.binning/binning
                              ::lib.schema.binning/binning-option]]]
  (let [binning-val (cond
                      (nil? binning-option) nil
                      (contains? binning-option :mbql) (:mbql binning-option)
                      :else binning-option)]
    (lib.options/update-options (lib-metric.dimension/reference projection)
                                (fn [opts]
                                  (if binning-val
                                    (assoc opts :binning binning-val)
                                    (dissoc opts :binning))))))
