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

(mu/defn ^:private pivot-drill-pred :- [:sequential lib.metadata/ColumnMetadata]
  "Implementation for pivoting on various kinds of fields.

  Don't call this directly; call [[pivot-drill]]."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context
   field-pred             :- [:=> [:cat lib.metadata/ColumnMetadata] boolean?]]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value)
             (= (:lib/source column) :source/aggregations))
    (->> (lib.breakout/breakoutable-columns query stage-number)
         (filter field-pred))))

(mu/defn ^:private pivot-by-time-drill :- [:sequential lib.metadata/ColumnMetadata]
  "Pivots this column and value on a time dimension."
  [query        :- ::lib.schema/query
   stage-number :- :int
   context      :- ::lib.schema.drill-thru/context]
  (pivot-drill-pred query stage-number context lib.types.isa/date?))

(mu/defn ^:private pivot-by-location-drill :- [:sequential lib.metadata/ColumnMetadata]
  "Pivots this column and value on an address dimension."
  [query        :- ::lib.schema/query
   stage-number :- :int
   context      :- ::lib.schema.drill-thru/context]
  (pivot-drill-pred query stage-number context lib.types.isa/address?))

(mu/defn ^:private pivot-by-category-drill :- [:sequential lib.metadata/ColumnMetadata]
  "Pivots this column and value on an category dimension."
  [query        :- ::lib.schema/query
   stage-number :- :int
   context      :- ::lib.schema.drill-thru/context]
  (pivot-drill-pred query stage-number context
                    (every-pred lib.types.isa/category?
                                (complement lib.types.isa/address?))))

(defn- breakout-type [query stage-number breakout]
  (let [column (lib.metadata.calculation/metadata query stage-number breakout)]
    (cond
      (lib.types.isa/date? column) :date
      (lib.types.isa/address? column) :address
      (lib.types.isa/category? column) :category)))

(mu/defn pivot-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.pivot]
  "Return all possible pivoting options on the given column and value.

  See `:pivots` key, which holds a map `{t [breakouts...]}` where `t` is `:category`, `:location`, or `:time`.
  If a key is missing, there are no breakouts of that kind."
  [query                              :- ::lib.schema/query
   stage-number                       :- :int
   {:keys [column value] :as context} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value)
             (= (:lib/source column) :source/aggregations)
             (-> (lib.aggregation/aggregations query stage-number) count pos?))
    (let [breakout-pivot-types (case (mapv #(breakout-type query stage-number %)
                                           (lib.breakout/breakouts query stage-number))
                                 ([:date] [:date :category])
                                 #{:category :location}

                                 [:address]
                                 #{:category :time}

                                 ([]
                                  [:category]
                                  [:category :category])
                                 #{:category :location :time}

                                 #{})
          by-category (when (breakout-pivot-types :category)
                        (pivot-by-category-drill query stage-number context))
          by-location (when (breakout-pivot-types :location)
                        (pivot-by-location-drill query stage-number context))
          by-time     (when (breakout-pivot-types :time)
                        (pivot-by-time-drill     query stage-number context))
          pivots      (merge (when (seq by-category) {:category by-category})
                             (when (seq by-location) {:location by-location})
                             (when (seq by-time)     {:time by-time}))]
      ;; TODO: Do dimensions need to be attached? How is clicked.dimensions calculated in the FE?
      (when-not (empty? pivots)
        {:lib/type :metabase.lib.drill-thru/drill-thru
         :type     :drill-thru/pivot
         :pivots   pivots}))))

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
