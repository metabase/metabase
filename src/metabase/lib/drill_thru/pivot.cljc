(ns metabase.lib.drill-thru.pivot
  "\"Breakout by\" transform.

  Entry points:

  - Cell

  Requirements:

  - Query with at least 1 aggregation

  - Column from the aggregation clause was selected

  For different query types/shapes different breakout columns are allowed:

  - No breakouts - `type/Date`, `type/Address`, and `type/Category` (only which are not also `type/Address`)

  - At least 1 aggregation and exactly 1 breakout based on `Address` column - `Date`, `Category`

  - At least 1 aggregation and 1-2 breakouts based on `Category` columns - `Date`, `Category`

  - At least 1 aggregation and either (1 breakout on a date column OR 1st breakout is `Date` and 2nd is `Category`) -
    `Address`, `Category`

  - In other cases the drill is not supported

  Query transformation is similar to `zoom-in` but can be simplified because legend items aren't supported:

  - Remove existing breakouts

  - Add filters based on `dimensions`, i.e. filters for all existing breakout

  - Add a breakout based on the selected column

  Question transformation:

  - Set default display

  Other functions:

  - `pivotTypes` function that return available column types for the drill - \"category\" | \"location\" | \"time\"

  - `pivotColumnsForType` returns the list of available columns for the drill and the selected type"
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(mu/defn ^:private pivot-drill-pred :- [:sequential ::lib.schema.metadata/column]
  "Implementation for pivoting on various kinds of fields.

  Don't call this directly; call [[pivot-drill]]."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context
   field-pred             :- [:=> [:cat [:schema ::lib.schema.metadata/column]] boolean?]]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value)
             (= (:lib/source column) :source/aggregations))
    (->> (lib.breakout/breakoutable-columns query stage-number)
         (filter field-pred))))

(def ^:private pivot-type-predicates
  {:category (every-pred lib.types.isa/category?
                         (complement lib.types.isa/address?))
   :location lib.types.isa/address?
   :time     lib.types.isa/temporal?})

(defn- breakout-type [query stage-number breakout]
  (let [column (lib.metadata.calculation/metadata query stage-number breakout)]
    (cond
      (lib.types.isa/temporal? column) :date
      (lib.types.isa/address? column) :address
      (lib.types.isa/category? column) :category)))

(mu/defn ^:private permitted-pivot-types :- [:maybe [:set ::lib.schema.drill-thru/pivot-types]]
  "This captures some complex conditions formerly encoded by `visualizations/click-actions/Mode/*` in the FE.
  See [here](https://github.com/metabase/metabase/blob/f4415fec8563353615ef600f52de871507a052ec/frontend/src/metabase/visualizations/click-actions/Mode/utils.ts#L15)
  for the original logic. (It returns `MODE_TYPE_*` enums, which are referenced below.)
  Pivot drills are only available in certain conditions, like all drills: structured queries with aggregation(s), when
  clicking a specific cell.
  - No breakouts: any pivot is permitted. (`metric` mode)
  - Exactly one date breakout, with an optional category breakout: no `:time` pivot. (`timeseries` mode)
  - Exactly one breakout and it's an address: no `:location` pivot. (`geo` mode)
  - One or two category breakouts: no `:location` pivot. (`pivot` mode)
  - If all these conditions fail, no pivots are allowed and the pivot drill should not be returned.

  This function encodes all these rules, returning a (possibly emtpy) set of permitted types."
  [query                                         :- ::lib.schema/query
   stage-number                                  :- :int]
  (case (->> (lib.breakout/breakouts query stage-number)
             (map #(breakout-type query stage-number %))
             frequencies)
    ({:date 1}
     {:date 1, :category 1})
    #{:category :location}

    {:address 1}
    #{:category :time}

    {}
    #{:category :location :time}

    ({:category 1} {:category 2})
    #{:category :time}

    ;; If there are breakouts but none of those conditions matched, no pivots are permitted.
    #{}))

(mu/defn pivot-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.pivot]
  "Return all possible pivoting options on the given column and value.

  See `:pivots` key, which holds a map `{t [breakouts...]}` where `t` is `:category`, `:location`, or `:time`.
  If a key is missing, there are no breakouts of that kind."
  [query                                         :- ::lib.schema/query
   stage-number                                  :- :int
   {:keys [column dimensions value] :as context} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value)
             (= (:lib/source column) :source/aggregations)
             (-> (lib.aggregation/aggregations query stage-number) count pos?))
    (let [breakout-pivot-types (permitted-pivot-types query stage-number)
          pivots               (into {} (for [pivot-type breakout-pivot-types
                                              :let [pred    (get pivot-type-predicates pivot-type)
                                                    columns (pivot-drill-pred query stage-number context pred)]
                                              :when (not-empty columns)]
                                          [pivot-type columns]))]
      (when-not (empty? pivots)
        {:lib/type   :metabase.lib.drill-thru/drill-thru
         :type       :drill-thru/pivot
         :dimensions dimensions
         :pivots     pivots}))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/pivot
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

;; Note that pivot drills have specific public functions for accessing the nested pivoting options.
;; Therefore the [[drill-thru-info-method]] is just the default `{:type :drill-thru/pivot}`.

(mu/defn pivot-types :- [:sequential ::lib.schema.drill-thru/pivot-types]
  "A helper for the FE. Returns the set of pivot types (category, location, time) that apply to this drill-thru."
  [drill-thru :- [:and ::lib.schema.drill-thru/drill-thru
                  [:map [:type [:= :drill-thru/pivot]]]]]
  (-> drill-thru :pivots keys sort))

(mu/defn pivot-columns-for-type :- [:sequential ::lib.schema.metadata/column]
  "A helper for the FE. Returns all the columns of the given type which can be used to pivot the query."
  [drill-thru :- [:and ::lib.schema.drill-thru/drill-thru
                  [:map [:type [:= :drill-thru/pivot]]]]
   pivot-type :- ::lib.schema.drill-thru/pivot-types]
  (get-in drill-thru [:pivots pivot-type]))

(defn- breakouts->filters [query stage-number {:keys [column value] :as _dimension}]
  (-> query
      (lib.breakout/remove-existing-breakouts-for-column stage-number column)
      (lib.filter/filter stage-number (lib.filter/= column value))))

;; Pivot drills are in play when clicking an aggregation cell. Pivoting is applied by:
;; 1. For each "dimension", ie. the specific values for all breakouts at the originally clicked cell:
;;     a. Filter the query to have the dimension's column = the dimension's value at that cell.
;;     b. Go through the breakouts, and remove any that match this dimension from the query.
;; 2. Add a new breakout for the selected column.
(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/pivot
  [query stage-number drill-thru & [column]]
  (let [filtered (reduce #(breakouts->filters %1 stage-number %2) query (:dimensions drill-thru))]
    (lib.breakout/breakout filtered stage-number column)))
