(ns metabase.lib-metric.projection
  "Core logic for computing projectable dimensions and their positions in a MetricDefinition.
   Projectable dimensions are dimensions that can be used for projections (breakouts)."
  (:require
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
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
   Returns dimensions with :projection-positions indicating which are already used.
   For single-source definitions; uses the expression leaf's :lib/uuid to scope projections."
  [definition :- ::lib-metric.schema/metric-definition]
  (let [{:keys [expression projections metadata-provider]} definition
        leaf-type  (lib-metric.definition/expression-leaf-type expression)
        leaf-id    (lib-metric.definition/expression-leaf-id expression)
        leaf-uuid  (lib-metric.definition/expression-leaf-uuid expression)
        dimensions (case leaf-type
                     :metric  (lib-metric.dimension/dimensions-for-metric metadata-provider leaf-id)
                     :measure (lib-metric.dimension/dimensions-for-measure metadata-provider leaf-id))
        typed-proj (perf/some #(when (= leaf-uuid (:lib/uuid %)) %)
                              (or projections []))
        flat-projs (if typed-proj (:projection typed-proj) [])]
    (add-projection-positions dimensions flat-projs)))

(defn projectable-dimensions-for-source
  "Get projectable dimensions for a specific source instance.
   source-instance is an expression leaf vector [:metric {:lib/uuid \"...\"} id]
   or [:measure {:lib/uuid \"...\"} id].
   Returns dimensions with :projection-positions scoped to that source's typed-projection."
  [definition source-instance]
  (let [{:keys [projections metadata-provider]} definition
        leaf-type    (lib-metric.definition/expression-leaf-type source-instance)
        source-id    (lib-metric.definition/expression-leaf-id source-instance)
        source-uuid  (lib-metric.definition/expression-leaf-uuid source-instance)
        dimensions   (case leaf-type
                       :metric  (lib-metric.dimension/dimensions-for-metric metadata-provider source-id)
                       :measure (lib-metric.dimension/dimensions-for-measure metadata-provider source-id))
        typed-proj   (perf/some #(when (= source-uuid (:lib/uuid %)) %)
                                (or projections []))
        flat-projs   (if typed-proj (:projection typed-proj) [])]
    (add-projection-positions dimensions flat-projs)))

(defn project-for-source
  "Add a projection for a dimension-ref to a specific source instance.
   source-instance is an expression leaf vector [:metric {:lib/uuid \"...\"} id]
   or [:measure {:lib/uuid \"...\"} id]."
  [definition dimension-ref source-instance]
  (let [leaf-type      (lib-metric.definition/expression-leaf-type source-instance)
        source-id      (lib-metric.definition/expression-leaf-id source-instance)
        source-uuid    (lib-metric.definition/expression-leaf-uuid source-instance)
        dimension-ref  (lib/ensure-uuid dimension-ref)
        projections    (or (:projections definition) [])
        existing-idx   (perf/some (fn [[idx tp]]
                                    (when (= source-uuid (:lib/uuid tp))
                                      idx))
                                  (map-indexed vector projections))]
    (if existing-idx
      (update-in definition [:projections existing-idx :projection] conj dimension-ref)
      (update definition :projections (fnil conj [])
              {:type leaf-type :id source-id :lib/uuid source-uuid :projection [dimension-ref]}))))

(mu/defn project :- ::lib-metric.schema/metric-definition
  "Add a projection for a dimension reference to a metric definition.
   The dimension-ref must be a dimension reference vector [:dimension opts uuid],
   e.g. from `dimensionReference`, `withTemporalBucket`, or `withBinning`.
   Creates/reuses the typed-projection entry keyed by the expression leaf's :lib/uuid."
  [definition    :- ::lib-metric.schema/metric-definition
   dimension-ref :- ::lib-metric.schema/dimension-reference]
  (let [expression    (:expression definition)
        leaf-type     (lib-metric.definition/expression-leaf-type expression)
        leaf-id       (lib-metric.definition/expression-leaf-id expression)
        leaf-uuid     (lib-metric.definition/expression-leaf-uuid expression)
        dimension-ref (lib/ensure-uuid dimension-ref)
        projections   (or (:projections definition) [])
        ;; Find existing typed-projection entry by :lib/uuid
        existing-idx  (perf/some (fn [[idx tp]]
                                   (when (= leaf-uuid (:lib/uuid tp))
                                     idx))
                                 (map-indexed vector projections))]
    (if existing-idx
      ;; Append dim-ref to existing typed-projection's :projection vector
      (update-in definition [:projections existing-idx :projection] conj dimension-ref)
      ;; Create new typed-projection entry
      (update definition :projections (fnil conj [])
              {:type leaf-type :id leaf-id :lib/uuid leaf-uuid :projection [dimension-ref]}))))

(defn- all-projectable-dimensions
  "Get all projectable dimensions, handling both single-source and multi-source definitions."
  [definition]
  (let [expression (:expression definition)]
    (if (lib-metric.definition/expression-leaf? expression)
      (projectable-dimensions definition)
      ;; Multi-source: collect dimensions from each leaf source
      (let [leaves (lib-metric.definition/expression-leaves expression)]
        (into []
              (mapcat (fn [leaf]
                        (let [leaf-type (lib-metric.definition/expression-leaf-type leaf)
                              leaf-id   (lib-metric.definition/expression-leaf-id leaf)
                              source-metadata {:lib/type (case leaf-type
                                                           :metric  :metadata/metric
                                                           :measure :metadata/measure)
                                               :id       leaf-id}]
                          (projectable-dimensions-for-source definition source-metadata))))
              leaves)))))

(mu/defn projection-dimension :- [:maybe ::lib-metric.schema/metadata-dimension]
  "Get the dimension metadata for a projection clause.
   The projection is a dimension-reference [:dimension opts uuid].
   Returns the dimension metadata or nil if not found."
  [definition :- ::lib-metric.schema/metric-definition
   projection-or-reference :- ::lib-metric.schema/dimension-or-reference]
  (let [dimensions (all-projectable-dimensions definition)
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
    (lib/update-options (lib-metric.dimension/reference projection)
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
      (perf/mapv (fn [strategy]
                   (cond-> strategy
                     existing                      (dissoc :default)
                     (strategy= strategy existing) (assoc :selected true)))
                 strategies))))

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
    (lib/update-options (lib-metric.dimension/reference projection)
                        (fn [opts]
                          (if binning-val
                            (assoc opts :binning binning-val)
                            (dissoc opts :binning))))))

;;; -------------------------------------------------- Default Breakout Dimensions --------------------------------------------------

(defn- dimension-has-field-id?
  "Check if a dimension has a source matching any of the given field IDs."
  [field-ids dimension]
  (perf/some (fn [source]
               (when-let [fid (:field-id source)]
                 (field-ids fid)))
             (:sources dimension)))

(mu/defn default-breakout-dimensions :- [:sequential ::lib-metric.schema/metadata-dimension]
  "Get dimensions corresponding to the source metric's default breakout columns.
   Returns DimensionMetadata objects matching the breakout field-ids in the dataset_query."
  [definition :- ::lib-metric.schema/metric-definition]
  (let [{:keys [expression metadata-provider]} definition
        leaf-type (lib-metric.definition/expression-leaf-type expression)
        leaf-id   (lib-metric.definition/expression-leaf-id expression)]
    (if-not leaf-type
      []
      (let [metadata-type (case leaf-type :metric :metadata/metric :measure :metadata/measure)
            metadata      (first (lib.metadata.protocols/metadatas
                                  metadata-provider
                                  {:lib/type metadata-type :id #{leaf-id}}))
            raw-query     (lib-metric.dimension/dimensionable-query metadata)]
        (if-not raw-query
          []
          (let [mbql5-query        (lib/query metadata-provider raw-query)
                breakout-clauses   (lib/breakouts mbql5-query)
                breakout-field-ids (into #{}
                                         (keep lib-metric.dimension/dimension-target->field-id)
                                         breakout-clauses)]
            (if (perf/empty? breakout-field-ids)
              []
              (filterv #(dimension-has-field-id? breakout-field-ids %)
                       (projectable-dimensions definition)))))))))

;;; -------------------------------------------------- Cross-leaf Breakout --------------------------------------------------

(defn- leaf-dimensions
  [metadata-provider leaf]
  (let [leaf-type (lib-metric.definition/expression-leaf-type leaf)
        leaf-id   (lib-metric.definition/expression-leaf-id leaf)]
    (case leaf-type
      :metric  (lib-metric.dimension/dimensions-for-metric metadata-provider leaf-id)
      :measure (lib-metric.dimension/dimensions-for-measure metadata-provider leaf-id))))

(defn- leaf-entity-name
  "Human-readable name for a leaf's metric/measure (falls back to \"metric 42\" if unnamed)."
  [metadata-provider leaf]
  (let [leaf-type (lib-metric.definition/expression-leaf-type leaf)
        leaf-id   (lib-metric.definition/expression-leaf-id leaf)
        mtype     (case leaf-type :metric :metadata/metric :measure :metadata/measure)]
    (or (:name (first (lib.metadata.protocols/metadatas metadata-provider {:lib/type mtype :id #{leaf-id}})))
        (str (name leaf-type) " " leaf-id))))

(defn- dimension-tables
  "Distinct table display-names the dimensions belong to (via each dimension's :group)."
  [dimensions]
  (distinct (keep (comp :display-name :group) dimensions)))

(defn- unresolved-breakout-message
  "Build an actionable error for a breakout `field-id` that isn't a dimension of every leaf.
  `resolved` is `[{:leaf :dim}]` per leaf (`:dim` nil when unmatched); `example-dim` is any matched
  dimension, used to name the field and the table it lives on."
  [metadata-provider field-id example-dim missing]
  (let [field-desc (if example-dim
                     (i18n/tru "field {0} (\"{1}\" from table \"{2}\")"
                               field-id
                               (:display-name example-dim)
                               (perf/get-in example-dim [:group :display-name]))
                     (i18n/tru "field {0}" field-id))
        offenders  (for [{:keys [leaf dims]} missing]
                     (i18n/tru "\"{0}\" (its dimensions come from: {1})"
                               (leaf-entity-name metadata-provider leaf)
                               (or (perf/not-empty (apply str (interpose ", " (dimension-tables dims))))
                                   (i18n/tru "no synced dimensions"))))]
    (str (i18n/tru "Can''t break out by {0}: it isn''t a dimension of {1}."
                   field-desc
                   (apply str (interpose "; " offenders)))
         " "
         (i18n/tru (str "Every metric in a metric-math formula must have the breakout field among its "
                        "own dimensions, so all metrics must share that field''s table (e.g. a conformed "
                        "dimension). Note: a column with the same name on a different table is a different "
                        "field with a different id — either pick a dimension common to all metrics, or drop "
                        "the breakout for a scalar result.")))))

(mu/defn project-breakout-by-field-id :- ::lib-metric.schema/metric-definition
  "Add a breakout on the dimension backed by `field-id` to EVERY leaf of `definition`'s expression.

  `field-id` is the stable cross-leaf key used to match \"the same logical breakout\" across the
  metrics/measures in a metric-math expression (mirrors the frontend's field-id matching in
  `dimension-picker.ts`). For each leaf, this finds that leaf's own dimension whose `:sources`
  reference `field-id`, optionally applies `temporal-unit`, and appends a typed-projection for it.

  Throws a 400 `ex-info` if any leaf has no dimension for `field-id`. The message names the field and
  its table plus every metric that lacks it and the tables it does cover, so the caller can relay why
  the (usually cross-table) breakout was rejected."
  ([definition field-id]
   (project-breakout-by-field-id definition field-id nil))
  ([definition    :- ::lib-metric.schema/metric-definition
    field-id      :- ::lib.schema.id/field
    temporal-unit :- [:maybe ::lib.schema.temporal-bucketing/unit]]
   (let [{:keys [expression metadata-provider]} definition
         field-ids #{field-id}
         resolved  (perf/mapv (fn [leaf]
                                (let [dims (leaf-dimensions metadata-provider leaf)]
                                  {:leaf leaf
                                   :dims dims
                                   :dim  (perf/some (fn [d] (when (dimension-has-field-id? field-ids d) d)) dims)}))
                              (lib-metric.definition/expression-leaves expression))
         missing   (remove :dim resolved)]
     (when (seq missing)
       (throw (ex-info (unresolved-breakout-message metadata-provider field-id (perf/some :dim resolved) missing)
                       {:status-code 400
                        :field-id    field-id
                        :missing     (perf/mapv (fn [{:keys [leaf]}]
                                                  {:type (lib-metric.definition/expression-leaf-type leaf)
                                                   :id   (lib-metric.definition/expression-leaf-id leaf)})
                                                missing)})))
     (reduce (fn [def* {:keys [leaf dim]}]
               (let [dim-ref (cond-> (lib-metric.dimension/reference dim)
                               temporal-unit (with-temporal-bucket temporal-unit))]
                 (project-for-source def* dim-ref leaf)))
             definition
             resolved))))
