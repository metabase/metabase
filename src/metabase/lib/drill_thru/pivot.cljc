(ns metabase.lib.drill-thru.pivot
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(def ^:private pivot-predicates
  {:category (every-pred lib.types.isa/category?
                         (complement lib.types.isa/address?))
   :location lib.types.isa/address?
   :time     lib.types.isa/temporal?})

(defn- breakout-type [query stage-number breakout]
  (let [column (lib.metadata.calculation/metadata query stage-number breakout)]
    (cond
      (lib.types.isa/temporal? column) :date
      (lib.types.isa/address? column)  :address
      (lib.types.isa/category? column) :category)))

(defn- breakout-pivot-types [query stage-number]
  (case (mapv #(breakout-type query stage-number %)
              (lib.breakout/breakouts query stage-number))
    ([:date] [:date :category])
    #{:category :location}

    [:address]
    #{:category :time}

    ([]
     [:category]
     [:category :category])
    #{:category :location :time}

    #{}))

(mu/defn ^:private pivot-drill-options :- [:maybe [:map-of
                                                   ::lib.schema.drill-thru/pivot-types
                                                   [:sequential lib.metadata/ColumnMetadata]]]
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value)
             (= (:lib/source column) :source/aggregations)
             (-> (lib.aggregation/aggregations query stage-number) count pos?))
    (let [available-pivots (breakout-pivot-types query stage-number)
          breakoutable     (lib.breakout/breakoutable-columns query stage-number)]
      (->> (for [[pivot-type pred] pivot-predicates
                 :when (available-pivots pivot-type)
                 :let  [pivots (not-empty (filter pred breakoutable))]
                 :when pivots]
             [pivot-type pivots])
           (into {})
           not-empty))))

(mu/defn has-pivot-drill :- :boolean
  "Return true if there are legal pivoting options for the given column and value."
  [query        :- ::lib.schema/query
   stage-number :- :int
   context      :- ::lib.schema.drill-thru/context]
  (boolean (pivot-drill-options query stage-number context)))

(mu/defn pivot-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.pivot]
  "Return all possible pivoting options on the given column and value.

  See `:pivots` key, which holds a map `{t [breakouts...]}` where `t` is `:category`, `:location`, or `:time`.
  If a key is missing, there are no breakouts of that kind."
  [query        :- ::lib.schema/query
   stage-number :- :int
   context      :- ::lib.schema.drill-thru/context]
  (when-let [pivots (pivot-drill-options query stage-number context)]
    {:lib/type :metabase.lib.drill-thru/drill-thru
     :type     :drill-thru/pivot
     :pivots   pivots}))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/pivot
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

;; Note that pivot drills have specific public functions for accessing the nested pivoting options.
;; Therefore the [[drill-thru-info-method]] is just the default `{:type :drill-thru/pivot}`.

(mu/defn pivot-types :- [:sequential ::lib.schema.drill-thru/drill-thru-pivot-types]
  "A helper for the FE. Returns the set of pivot types (category, location, time) that apply to this drill-thru."
  [drill-thru :- [:and ::lib.schema.drill-thru/drill-thru
                  [:map [:type [:= :drill-thru/pivot]]]]]
  (keys (:pivots drill-thru)))

(mu/defn pivot-columns-for-type :- [:sequential lib.metadata/ColumnMetadata]
  "A helper for the FE. Returns all the columns of the given type which can be used to pivot the query."
  [drill-thru :- [:and ::lib.schema.drill-thru/drill-thru
                  [:map [:type [:= :drill-thru/pivot]]]]
   pivot-type :- ::lib.schema.drill-thru/drill-thru-pivot-types]
  (get-in drill-thru [:pivots pivot-type]))
