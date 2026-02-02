(ns metabase.lib.projection-config
  "ProjectionConfig - abstract projection configuration for metrics-explorer.

  A ProjectionConfig describes how to configure a temporal dimension
  independently of any specific query or column. It includes:
  - unit: temporal granularity (:month, :day, :quarter, :year, etc.)
  - filter-spec: abstract filter specification (not column-specific)

  ColumnMatchers identify which column to apply the config to:
  - :first-of-type - match first column of a given type
  - :by-name - match by column name
  - :by-field-id - match by field ID

  Main integration points:
  - `apply-projection-config`: Apply config to a MetricDefinition (sets projections/filters)
  - `apply-projection-config-to-query`: Apply config directly to a query
  - `initialize-projection-config`: Extract config from an existing query"
  (:refer-clojure :exclude [not-empty])
  (:require
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.update :as lib.filter.update]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metric-definition :as lib.metric-definition]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [not-empty]]))

;;; ------------------------------------------------ ProjectionConfig ------------------------------------------------

(def ^:private FilterSpec
  "Schema for abstract filter specifications."
  [:map
   [:type [:enum :relative :specific :exclude]]])

(def ^:private ProjectionConfig
  "Schema for a ProjectionConfig."
  [:map
   [:lib/type [:= :projection-config]]
   [:unit [:maybe ::lib.schema.temporal-bucketing/unit]]
   [:filter-spec {:optional true} [:maybe FilterSpec]]])

(defn- normalize-filter-spec
  "Ensure filter-spec has keyword :type (may be string from JS)."
  [filter-spec]
  (when filter-spec
    (cond-> filter-spec
      (string? (:type filter-spec)) (update :type keyword))))

(mu/defn projection-config :- ProjectionConfig
  "Create a projection config with optional initial settings.

  Options:
  - :unit - temporal unit (:month, :day, :quarter, :year, etc.)
  - :filter-spec - abstract filter specification"
  ([]
   (projection-config {}))
  ([{:keys [unit filter-spec]}]
   {:lib/type :projection-config
    :unit (or (some-> unit keyword) :month)
    :filter-spec (normalize-filter-spec filter-spec)}))

(mu/defn with-projection-unit :- ProjectionConfig
  "Set the temporal unit on a projection config."
  [config :- ProjectionConfig
   unit   :- ::lib.schema.temporal-bucketing/unit]
  (assoc config :unit unit))

(mu/defn with-projection-filter :- ProjectionConfig
  "Set the filter spec on a projection config."
  [config      :- ProjectionConfig
   filter-spec :- FilterSpec]
  (assoc config :filter-spec filter-spec))

(mu/defn clear-projection-filter :- ProjectionConfig
  "Clear the filter from a projection config."
  [config :- ProjectionConfig]
  (assoc config :filter-spec nil))

(mu/defn projection-config-unit :- [:maybe ::lib.schema.temporal-bucketing/unit]
  "Get the temporal unit from a projection config."
  [config :- ProjectionConfig]
  (:unit config))

(mu/defn projection-config-filter :- [:maybe FilterSpec]
  "Get the filter spec from a projection config."
  [config :- ProjectionConfig]
  (:filter-spec config))

(defmethod lib.metadata.calculation/display-info-method :projection-config
  [_query _stage-index projection-config]
  {:unit (:unit projection-config)
   :filter-spec (:filter-spec projection-config)})

;;; ------------------------------------------------ Column Matchers ------------------------------------------------

(def ^:private ColumnMatcher
  "Schema for column matchers - ways to identify which column to use."
  [:map
   [:type [:enum :first-of-type :by-name :by-field-id]]])

(mu/defn first-datetime-column-matcher :- ColumnMatcher
  "Create a matcher that finds the first datetime column."
  []
  {:type :first-of-type
   :column-type :datetime})

(mu/defn first-numeric-column-matcher :- ColumnMatcher
  "Create a matcher that finds the first numeric column."
  []
  {:type :first-of-type
   :column-type :numeric})

(mu/defn column-matcher-by-name :- ColumnMatcher
  "Create a matcher that finds a column by name."
  [column-name :- :string]
  {:type :by-name
   :column-name column-name})

(mu/defn column-matcher-by-field-id :- ColumnMatcher
  "Create a matcher that finds a column by field ID."
  [field-id :- :int]
  {:type :by-field-id
   :field-id field-id})

;;; --------------------------------------------- Finding Columns ---------------------------------------------------

(defn- find-column-for-matcher
  "Find a column in the query matching the given matcher."
  [query stage-index matcher]
  (let [columns (lib.breakout/breakoutable-columns query stage-index)]
    (case (:type matcher)
      :first-of-type
      (case (:column-type matcher)
        :datetime (first (filter lib.types.isa/date-or-datetime? columns))
        :numeric  (first (filter lib.types.isa/numeric? columns))
        nil)

      :by-name
      (first (filter #(= (:name %) (:column-name matcher)) columns))

      :by-field-id
      (first (filter #(= (:id %) (:field-id matcher)) columns))

      nil)))

;;; --------------------------------------------- Filter Creation ---------------------------------------------------

(defn- create-filter-clause
  "Create a filter clause from an abstract filter-spec and a concrete column.
  Returns nil if filter-spec is nil or cannot be converted to a filter."
  [column filter-spec]
  (when filter-spec
    (case (:type filter-spec)
      :relative
      (lib.fe-util/relative-date-filter-clause
       column
       (:value filter-spec)
       (keyword (:unit filter-spec))
       (:offset-value filter-spec)
       (some-> (:offset-unit filter-spec) keyword)
       (or (:options filter-spec) {}))

      :specific
      (lib.fe-util/specific-date-filter-clause
       (keyword (:operator filter-spec))
       column
       (:values filter-spec)
       (:has-time filter-spec false))

      :exclude
      (lib.fe-util/exclude-date-filter-clause
       (keyword (:operator filter-spec))
       column
       (some-> (:unit filter-spec) keyword)
       (:values filter-spec))

      nil)))

;;; --------------------------------------------- Query Utilities ---------------------------------------------------

(defn- find-temporal-bucket
  "Find a temporal bucket matching the given unit from available buckets."
  [query stage-index column target-unit]
  (let [buckets (lib.temporal-bucket/available-temporal-buckets query stage-index column)
        target-name (name target-unit)]
    (first (filter (fn [bucket]
                     (let [info (lib.metadata.calculation/display-info query stage-index bucket)]
                       (= target-name (:short-name info))))
                   buckets))))

(defn- default-temporal-bucket
  "Find the default temporal bucket for a column."
  [query stage-index column]
  (let [buckets (lib.temporal-bucket/available-temporal-buckets query stage-index column)]
    (first (filter (fn [bucket]
                     (:default (lib.metadata.calculation/display-info query stage-index bucket)))
                   buckets))))

(defn- with-default-bucket
  "Apply the default temporal bucket to a column if one exists."
  [query stage-index column]
  (if-let [bucket (default-temporal-bucket query stage-index column)]
    (lib.temporal-bucket/with-temporal-bucket column bucket)
    column))

(mu/defn ensure-datetime-breakout :- ::lib.schema/query
  "If no breakout exists, find first datetime column and add as breakout with default bucket."
  [query :- ::lib.schema/query]
  (let [stage-index -1
        existing-breakouts (lib.breakout/breakouts query stage-index)]
    (if (not-empty existing-breakouts)
      query
      (if-let [datetime-col (find-column-for-matcher query stage-index (first-datetime-column-matcher))]
        (let [col-with-bucket (with-default-bucket query stage-index datetime-col)]
          (lib.breakout/breakout query stage-index col-with-bucket))
        query))))

;;; --------------------------------------------- Apply to Query ---------------------------------------------------

(defn- find-filter-column
  "Find the filterable column that matches the given column (e.g., breakout column).
  This is needed because the breakout column may have a temporal bucket, but filters
  are applied to the underlying column."
  [query stage-index column]
  (let [filterable-cols (lib.filter/filterable-columns query stage-index)]
    (lib.equality/find-matching-column query stage-index column filterable-cols)))

(mu/defn apply-projection-config-to-query :- ::lib.schema/query
  "Apply projection config directly to a query.

  This function updates the EXISTING breakout's temporal bucket (if any),
  or falls back to using the column matcher to find a column if no breakout exists.

  For filters: removes existing filters on the breakout column and applies the new filter spec.

  Returns the modified query."
  [query             :- ::lib.schema/query
   stage-index       :- :int
   projection-config :- ProjectionConfig
   column-matcher    :- ColumnMatcher]
  (let [existing-breakouts (lib.breakout/breakouts query stage-index)]
    (if (not-empty existing-breakouts)
      ;; Update existing breakout's bucket
      (let [breakout (first existing-breakouts)
            breakout-col (lib.breakout/breakout-column query stage-index breakout)
            target-bucket (when breakout-col
                            (find-temporal-bucket query stage-index breakout-col (:unit projection-config)))
            col-with-bucket (if (and breakout-col target-bucket)
                              (lib.temporal-bucket/with-temporal-bucket breakout-col target-bucket)
                              breakout-col)
            ;; Replace the breakout clause with the new bucket
            query-with-breakout (if col-with-bucket
                                  (lib.remove-replace/replace-clause query stage-index breakout col-with-bucket)
                                  query)
            ;; Handle filters
            filter-spec (:filter-spec projection-config)
            ;; Remove existing filters on the breakout column first
            query-without-old-filters (if breakout-col
                                        (lib.filter.update/remove-existing-filters-against-column
                                         query-with-breakout stage-index breakout-col)
                                        query-with-breakout)]
        (if (and filter-spec breakout-col)
          (if-let [filter-clause (create-filter-clause breakout-col filter-spec)]
            (lib.filter/filter query-without-old-filters stage-index filter-clause)
            query-without-old-filters)
          query-without-old-filters))
      ;; No existing breakout - use matcher to find column and add breakout
      (if-let [column (find-column-for-matcher query stage-index column-matcher)]
        (let [target-bucket (find-temporal-bucket query stage-index column (:unit projection-config))
              col-with-bucket (if target-bucket
                                (lib.temporal-bucket/with-temporal-bucket column target-bucket)
                                column)
              query-with-breakout (lib.breakout/breakout query stage-index col-with-bucket)
              filter-spec (:filter-spec projection-config)]
          (if filter-spec
            (if-let [filter-clause (create-filter-clause column filter-spec)]
              (lib.filter/filter query-with-breakout stage-index filter-clause)
              query-with-breakout)
            query-with-breakout))
        query))))

;;; --------------------------------------------- Apply to MetricDefinition -----------------------------------------

(mu/defn apply-projection-config
  "Apply projection config to a MetricDefinition.
  This is the main integration point between UI config and metric state.

  1. Gets the base query from the metric definition
  2. Finds the column (via matcher)
  3. Clears existing projections/filters on the definition
  4. Adds projection with temporal bucket from config.unit
  5. Creates filter clause from config.filter-spec
  6. Returns updated MetricDefinition"
  [metric-def        :- [:map [:lib/type [:= :metric-definition]]]
   projection-config :- ProjectionConfig
   column-matcher    :- ColumnMatcher]
  (if-let [query (lib.metric-definition/metric-definition->base-query metric-def)]
    (let [stage-index -1
          column (find-column-for-matcher query stage-index column-matcher)]
      (if column
        (let [bucket (find-temporal-bucket query stage-index column (:unit projection-config))
              filter-clause (when-let [spec (:filter-spec projection-config)]
                              (create-filter-clause column spec))]
          (cond-> metric-def
            true          lib.metric-definition/clear-projections
            true          lib.metric-definition/clear-filters
            true          (lib.metric-definition/add-projection column bucket)
            filter-clause (lib.metric-definition/add-filter filter-clause)))
        metric-def))
    metric-def))

;;; --------------------------------------------- Extract from Query ------------------------------------------------

(mu/defn extract-filter-spec :- [:maybe FilterSpec]
  "Extract abstract filter spec from a query's filter on given column.
  Returns nil if no filter is found on the column."
  [query  :- ::lib.schema/query
   column :- ::lib.schema.metadata/column]
  (let [stage-index -1
        ;; Find the matching filterable column to get correct filter positions
        filter-column (find-filter-column query stage-index column)]
    (when filter-column
      (let [filters (lib.filter/filters query stage-index)
            display-info (lib.metadata.calculation/display-info query stage-index filter-column)
            filter-positions (:filter-positions display-info)]
        (when (and filter-positions (seq filter-positions))
          (let [filter-clause (nth filters (first filter-positions) nil)]
            (when filter-clause
              ;; Try relative date filter
              (if-let [rel-parts (lib.fe-util/relative-date-filter-parts query stage-index filter-clause)]
                {:type :relative
                 :value (:value rel-parts)
                 :unit (name (:unit rel-parts))
                 :offset-value (:offset-value rel-parts)
                 :offset-unit (some-> (:offset-unit rel-parts) name)
                 :options (:options rel-parts)}
                ;; Try specific date filter
                (if-let [spec-parts (lib.fe-util/specific-date-filter-parts query stage-index filter-clause)]
                  {:type :specific
                   :operator (name (:operator spec-parts))
                   :values (:values spec-parts)
                   :has-time (:has-time spec-parts)}
                  ;; Try exclude date filter
                  (when-let [exc-parts (lib.fe-util/exclude-date-filter-parts query stage-index filter-clause)]
                    {:type :exclude
                     :operator (name (:operator exc-parts))
                     :unit (some-> (:unit exc-parts) name)
                     :values (:values exc-parts)}))))))))))

(mu/defn initialize-projection-config :- ProjectionConfig
  "Extract ProjectionConfig from an existing query (unit + filter-spec).
  Looks at the first breakout to determine unit, and extracts any filter on that column."
  [query :- ::lib.schema/query]
  (let [stage-index -1
        breakouts (lib.breakout/breakouts query stage-index)]
    (if (not-empty breakouts)
      (let [breakout (first breakouts)
            bucket (lib.temporal-bucket/temporal-bucket breakout)
            unit (if bucket
                   (let [info (lib.metadata.calculation/display-info query stage-index bucket)]
                     (keyword (:short-name info)))
                   :month)
            breakout-col (lib.breakout/breakout-column query stage-index breakout)
            filter-spec (when breakout-col
                          (extract-filter-spec query breakout-col))]
        (projection-config {:unit unit :filter-spec filter-spec}))
      ;; No breakout - look for first datetime column
      (let [columns (lib.breakout/breakoutable-columns query stage-index)
            datetime-col (first (filter lib.types.isa/date-or-datetime? columns))
            filter-spec (when datetime-col
                          (extract-filter-spec query datetime-col))]
        (projection-config {:unit :month :filter-spec filter-spec})))))
