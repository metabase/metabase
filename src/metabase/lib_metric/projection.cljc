(ns metabase.lib-metric.projection
  "Core logic for computing projectable dimensions and their positions in a MetricDefinition.
   Projectable dimensions are dimensions that can be used for projections (breakouts)."
  (:require
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.i18n :as i18n]
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

(defn projectable-dimensions-for-source
  "Get projectable dimensions for a specific source (MetricMetadata or MeasureMetadata).
   Returns dimensions with :projection-positions scoped to that source's typed-projection."
  [definition source-metadata]
  (let [{:keys [projections metadata-provider]} definition
        leaf-type   (case (:lib/type source-metadata)
                      :metadata/metric  :metric
                      :metadata/measure :measure)
        source-id   (:id source-metadata)
        dimensions  (case leaf-type
                      :metric  (lib-metric.dimension/dimensions-for-metric metadata-provider source-id)
                      :measure (lib-metric.dimension/dimensions-for-measure metadata-provider source-id))
        typed-proj  (perf/some #(when (and (= (:type %) leaf-type) (= (:id %) source-id)) %)
                               (or projections []))
        flat-projs  (if typed-proj (:projection typed-proj) [])]
    (add-projection-positions dimensions flat-projs)))

(defn project-for-source
  "Add a projection for a dimension to a specific source.
   source-metadata is MetricMetadata or MeasureMetadata."
  [definition dimension source-metadata]
  (let [leaf-type      (case (:lib/type source-metadata)
                         :metadata/metric  :metric
                         :metadata/measure :measure)
        source-id      (:id source-metadata)
        dimension-ref  (lib.options/ensure-uuid [:dimension {} (:id dimension)])
        projections    (or (:projections definition) [])
        existing-idx   (perf/some (fn [[idx tp]]
                                    (when (and (= (:type tp) leaf-type) (= (:id tp) source-id))
                                      idx))
                                  (map-indexed vector projections))]
    (if existing-idx
      (update-in definition [:projections existing-idx :projection] conj dimension-ref)
      (update definition :projections (fnil conj [])
              {:type leaf-type :id source-id :projection [dimension-ref]}))))

(mu/defn project :- ::lib-metric.schema/metric-definition
  "Add a projection for a dimension reference to a metric definition.
   The dimension-ref must be a dimension reference vector [:dimension opts uuid],
   e.g. from `dimensionReference`, `withTemporalBucket`, or `withBinning`.
   Creates/reuses the typed-projection entry for the current source."
  [definition    :- ::lib-metric.schema/metric-definition
   dimension-ref :- ::lib-metric.schema/dimension-reference]
  (let [expression    (:expression definition)
        leaf-type     (lib-metric.definition/expression-leaf-type expression)
        leaf-id       (lib-metric.definition/expression-leaf-id expression)
        dimension-ref (lib.options/ensure-uuid dimension-ref)
        projections   (or (:projections definition) [])
        ;; Find existing typed-projection entry for this source
        existing-idx  (perf/some (fn [[idx tp]]
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
    (perf/some #(when (= (:id %) dimension-id) %) dimensions)))

;;; -------------------------------------------------- Temporal Bucket Functions --------------------------------------------------

(def ^:private hidden-bucketing-options
  #{:millisecond :second :second-of-minute :year-of-era})

(def ^:private time-bucket-options
  (into []
        (comp (remove hidden-bucketing-options)
              (map (fn [unit]
                     (cond-> {:lib/type :option/temporal-bucketing
                              :unit unit}
                       (= unit :hour) (assoc :default true)))))
        lib.schema.temporal-bucketing/ordered-time-bucketing-units))

(def ^:private date-bucket-options
  (perf/mapv (fn [unit]
               (cond-> {:lib/type :option/temporal-bucketing
                        :unit unit}
                 (= unit :day) (assoc :default true)))
             lib.schema.temporal-bucketing/ordered-date-bucketing-units))

(def ^:private datetime-bucket-options
  (let [units (into [] (remove hidden-bucketing-options)
                    lib.schema.temporal-bucketing/ordered-datetime-bucketing-units)]
    (perf/mapv (fn [unit]
                 (cond-> {:lib/type :option/temporal-bucketing
                          :unit unit}
                   (= unit :day) (assoc :default true)))
               units)))

(defn- mark-unit [options option-key unit]
  (perf/mapv (fn [option]
               (cond-> option
                 (:default option)          (dissoc :default)
                 (= (:unit option) unit)    (assoc option-key true)))
             options))

(defn- available-temporal-buckets-for-type
  "Given a column type and nillable default-unit and selected-unit, return the appropriate bucket options."
  [column-type default-unit selected-unit]
  (let [options       (cond
                        (isa? column-type :type/DateTime) datetime-bucket-options
                        (isa? column-type :type/Date)     date-bucket-options
                        (isa? column-type :type/Time)     time-bucket-options
                        :else                             [])
        fallback-unit (if (isa? column-type :type/Time) :hour :month)
        default-unit  (or default-unit fallback-unit)]
    (cond-> options
      (= :inherited default-unit) (->> (perf/mapv #(dissoc % :default)))
      default-unit  (mark-unit :default  default-unit)
      selected-unit (mark-unit :selected selected-unit))))

(mu/defn available-temporal-buckets :- [:sequential [:ref ::lib.schema.temporal-bucketing/option]]
  "Get available temporal buckets for a dimension based on its effective-type."
  [definition :- ::lib-metric.schema/metric-definition
   dimension  :- ::lib-metric.schema/metadata-dimension]
  (let [effective-type (or (:effective-type dimension) (:base-type dimension))
        flat-projs    (lib-metric.definition/flat-projections (or (:projections definition) []))
        selected-unit (perf/some (fn [proj]
                                   (when (= (:id dimension) (projection-dimension-id proj))
                                     (:temporal-unit (second proj))))
                                 flat-projs)]
    (if (isa? effective-type :type/Temporal)
      (available-temporal-buckets-for-type effective-type :month selected-unit)
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

(defn- default-auto-bin []
  {:lib/type     :option/binning
   :display-name (i18n/tru "Auto bin")
   :default      true
   :mbql         {:strategy :default}})

(defn- numeric-binning-strategies []
  (perf/mapv #(assoc % :lib/type :option/binning)
             [(default-auto-bin)
              {:display-name (i18n/tru "10 bins")  :mbql {:strategy :num-bins :num-bins 10}}
              {:display-name (i18n/tru "50 bins")  :mbql {:strategy :num-bins :num-bins 50}}
              {:display-name (i18n/tru "100 bins") :mbql {:strategy :num-bins :num-bins 100}}]))

(defn- coordinate-binning-strategies []
  (perf/mapv #(assoc % :lib/type :option/binning)
             [(default-auto-bin)
              {:display-name (i18n/tru "Bin every 0.1 degrees")   :mbql {:strategy :bin-width :bin-width 0.1}}
              {:display-name (i18n/tru "Bin every 1 degree")      :mbql {:strategy :bin-width :bin-width 1.0}}
              {:display-name (i18n/tru "Bin every 10 degrees")    :mbql {:strategy :bin-width :bin-width 10.0}}
              {:display-name (i18n/tru "Bin every 20 degrees")    :mbql {:strategy :bin-width :bin-width 20.0}}
              {:display-name (i18n/tru "Bin every 0.05 degrees")  :mbql {:strategy :bin-width :bin-width 0.05}}
              {:display-name (i18n/tru "Bin every 0.01 degrees")  :mbql {:strategy :bin-width :bin-width 0.01}}
              {:display-name (i18n/tru "Bin every 0.005 degrees") :mbql {:strategy :bin-width :bin-width 0.005}}]))

(defn- binning=
  "Given two binning values, check if they match."
  [x y]
  (let [binning-keys (case (:strategy x)
                       :num-bins  [:strategy :num-bins]
                       :bin-width [:strategy :bin-width]
                       [:strategy])]
    (= (perf/select-keys x binning-keys) (perf/select-keys y binning-keys))))

(defn- strategy=
  "Given a binning option and a column's current binning value, check if they match."
  [binning-option column-binning]
  (binning= (:mbql binning-option) column-binning))

(mu/defn available-binning-strategies :- [:maybe [:sequential [:ref ::lib-metric.schema/binning-option]]]
  "Get available binning strategies for a dimension based on its type and sources."
  [definition :- ::lib-metric.schema/metric-definition
   dimension  :- ::lib-metric.schema/metadata-dimension]
  (let [effective-type (:effective-type dimension)
        semantic-type  (:semantic-type dimension)
        sources        (:sources dimension)
        has-binning?   (and (seq sources) (perf/some :field-id sources))
        flat-projs     (lib-metric.definition/flat-projections (or (:projections definition) []))
        existing       (perf/some (fn [proj]
                                    (when (= (:id dimension) (projection-dimension-id proj))
                                      (:binning (second proj))))
                                  flat-projs)
        strategies     (cond
                         (not has-binning?)
                         nil

                         (isa? semantic-type :type/Coordinate)
                         (coordinate-binning-strategies)

                         (and (isa? effective-type :type/Number)
                              (not (isa? semantic-type :Relation/*)))
                         (numeric-binning-strategies)

                         :else nil)]
    (when strategies
      (for [strategy strategies]
        (cond-> strategy
          existing                     (dissoc :default)
          (strategy= strategy existing) (assoc :selected true))))))

(mu/defn binning :- [:maybe ::lib-metric.schema/binning]
  "Get the current binning from a projection clause."
  [projection :- ::lib-metric.schema/dimension-or-reference]
  (:binning (second (lib-metric.dimension/reference projection))))

(mu/defn with-binning :- ::lib-metric.schema/dimension-reference
  "Apply a binning strategy to a projection. Pass nil to remove binning."
  [projection :- ::lib-metric.schema/dimension-or-reference
   binning-option :- [:maybe [:or ::lib-metric.schema/binning
                              ::lib-metric.schema/binning-option]]]
  (let [binning-val (cond
                      (nil? binning-option) nil
                      (contains? binning-option :mbql) (:mbql binning-option)
                      :else binning-option)]
    (lib.options/update-options (lib-metric.dimension/reference projection)
                                (fn [opts]
                                  (if binning-val
                                    (assoc opts :binning binning-val)
                                    (dissoc opts :binning))))))
