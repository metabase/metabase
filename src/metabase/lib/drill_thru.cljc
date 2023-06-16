(ns metabase.lib.drill-thru
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

;; TODO: Different ways to apply drill-thru to a query.
;; So far:
;; - :filter on each :operators of :drill-thru/quick-filter applied with (lib/filter query stage filter-clause)

(defn- structured? [query stage-number]
  (-> (lib.util/query-stage query stage-number)
      :lib/type
      (= :mbql.stage/mbql)))

;;; ------------------------------------- Quick Filters ------------------------------------------
(defn- operator [op & args]
  (lib.options/ensure-uuid (into [op {}] args)))

(mu/defn ^:private operators-for #_#_:- [:sequential [:map [:name string?] [:filter ::lib.schema.expression/boolean]]]
  [column :- lib.metadata/ColumnMetadata
   value]
  (let [field-ref (lib.ref/ref column)]
    (cond
      (lib.types.isa/structured? column)  []
      (nil? value)                        [{:name "=" :filter (operator :is-null  field-ref)}
                                           {:name "≠" :filter (operator :not-null field-ref)}]
      (or (lib.types.isa/numeric? column)
          (lib.types.isa/date? column))   (for [[op label] [[:<  "<"]
                                                            [:>  ">"]
                                                            [:=  "="]
                                                            [:!= "≠"]]]
                                            {:name   label
                                             :filter (operator op field-ref value)})
      :else                               (for [[op label] [[:=  "="]
                                                            [:!= "≠"]]]
                                            {:name   label
                                             :filter (operator op field-ref value)}))))

(mu/defn ^:private quick-filter-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Filter the current query based on the value clicked.

  The options vary depending on the type of the field:
  - `:is-null` and `:not-null` for a `NULL` value;
  - `:=` and `:!=` for everything else;
  - plus `:<` and `:>` for numeric and date columns.

  Note that this returns a single `::drill-thru` value with 1 or more `:operators`; these are rendered as a set of small
  buttons in a single row of the drop-down."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (when (and (structured? query stage-number)
             ;(editable? query stage-number)
             column
             (some? value)
             (not (lib.types.isa/primary-key? column))
             (not (lib.types.isa/foreign-key? column)))
    {:lib/type  ::drill-thru
     :type      :drill-thru/quick-filter
     :operators (operators-for column value)}))

;;; ------------------------------------ Object Details ------------------------------------------
(mu/defn ^:private object-detail-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "When clicking a foreign key or primary key value, drill through to the details for that specific object.

  Contrast [[foreign-key-drill]], which filters this query to only those rows with a specific value for a FK column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (when (and (structured? query stage-number)
             column
             (some? value))
    (let [many-pks?  (> (count (lib.metadata.calculation/primary-keys query)) 1)
          drill-type (cond
                       (and (lib.types.isa/primary-key? column) many-pks?) :drill-thru/pk
                       ;; TODO: Figure out clicked.extraData and the dashboard flow.
                       (lib.types.isa/primary-key? column)                 :drill-thru/zoom
                       (lib.types.isa/foreign-key? column)                 :drill-thru/fk-details)]
      (when drill-type
        {:lib/type  ::drill-thru
         :type      drill-type
         :object-id value
         :many-pks? many-pks?}))))

;;; ------------------------------------- Foreign Key --------------------------------------------
(mu/defn ^:private foreign-key-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "When clicking on a foreign key value, filter this query by that column.

  This has the same effect as the `=` filter on a generic field (ie. not a key), but renders differently.

  Contrast [[object-detail-drill]], which shows the details of the foreign object."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (when (and (structured? query stage-number)
             column
             (some? value)
             (not (lib.types.isa/primary-key? column))
             (lib.types.isa/foreign-key? column))
    {:lib/type  ::drill-thru
     :type      :drill-thru/fk-filter
     :filter    (lib.options/ensure-uuid [:= {} (lib.ref/ref column) value])}))

;;; ------------------------------------- Distribution -------------------------------------------
(mu/defn ^:private distribution-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Select a column and see a histogram of how many rows fall into an automatic set of bins/buckets.
  - For dates, breaks out by month by default.
  - For numeric values, by an auto-selected set of bins
  - For strings, by each distinct value (which might be = the number of rows)"
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (when (and (structured? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/primary-key? column))
             (not (lib.types.isa/foreign-key? column))
             (not (lib.types.isa/structured?  column))
             (not (lib.types.isa/comment?     column))
             (not (lib.types.isa/description? column)))
    {:lib/type  ::drill-thru
     :type      :drill-thru/distribution
     :column    column}))

;;; -------------------------------------- Pivot Drill--------------------------------------------
(mu/defn ^:private pivot-drill-pred :- [:sequential lib.metadata/ColumnMetadata]
  "Implementation for pivoting on various kinds of fields.

  Don't call this directly; call [[pivot-drill]]."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value
   field-pred   :- [:=> [:cat lib.metadata/ColumnMetadata] boolean?]]
  (when (and (structured? query stage-number)
             column
             (some? value)
             (= (:lib/source column) :source/aggregations))
    (->> (lib.breakout/breakoutable-columns query stage-number)
         (filter field-pred))))

(mu/defn ^:private pivot-by-time-drill :- [:sequential lib.metadata/ColumnMetadata]
  "Pivots this column and value on a time dimension."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (pivot-drill-pred query stage-number column value lib.types.isa/date?))

(mu/defn ^:private pivot-by-location-drill :- [:sequential lib.metadata/ColumnMetadata]
  "Pivots this column and value on an address dimension."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (pivot-drill-pred query stage-number column value lib.types.isa/address?))

(mu/defn ^:private pivot-by-category-drill :- [:sequential lib.metadata/ColumnMetadata]
  "Pivots this column and value on an category dimension."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (pivot-drill-pred query stage-number column value
                    (every-pred lib.types.isa/category?
                                (complement lib.types.isa/address?))))

(mu/defn ^:private pivot-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Return all possible pivoting options on the given column and value.

  See `:pivots` key, which holds a map `{t [breakouts...]}` where `t` is `:category`, `:location`, or `:time`.
  If a key is missing, there are no breakouts of that kind."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (when (and (structured? query stage-number)
             column
             (some? value)
             (= (:lib/source column) :source/aggregations))
    (let [by-category (pivot-by-category-drill query stage-number column value)
          by-location (pivot-by-location-drill query stage-number column value)
          by-time     (pivot-by-time-drill     query stage-number column value)
          pivots      (merge (when (seq by-category) {:category by-category})
                             (when (seq by-location) {:location by-location})
                             (when (seq by-time)     {:time     by-time}))]
      ;; TODO: Do dimensions need to be attached? How is clicked.dimensions calculated in the FE?
      (when-not (empty? pivots)
        {:lib/type ::drill-thru
         :type     :drill-thru/pivot
         :pivots   pivots}))))

;;; ----------------------------------------- Sort -----------------------------------------------
(mu/defn ^:private sort-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Sorting on a clicked column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (when (and (structured? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column))
             (:lib/source column))
    (let [orderable  (->> (lib.order-by/orderable-columns query stage-number)
                          (map :id)
                          set)
          order-bys  (lib.order-by/order-bys query stage-number)
          this-order (first (for [[dir [clause _opts arg :as field]] order-bys
                                  :when (and (= clause :field)
                                             (or (= arg (:id column))
                                                 (= arg (:name column))))]
                              dir))]
      (when (orderable (:id column))
        {:lib/type        ::drill-thru
         :type            :drill-thru/sort
         :column          column
         :sort-directions (case this-order
                            :asc  [:desc]
                            :desc [:asc]
                            [:asc :desc])}))))

;;; ------------------------------------ Summarize Column ----------------------------------------
(mu/defn ^:private summarize-column-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "A set of possible aggregations that can summarize this column: distinct values, sum, average."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (when (and (structured? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column)))
    (let [aggregation-ops (concat [:distinct]
                                  (when (lib.types.isa/summable? column)
                                    [:sum :avg]))]
      {:lib/type     ::drill-thru
       :type         :drill-thru/summarize-column
       :column       column
       :aggregations aggregation-ops})))

;;; ----------------------------------- Automatic Insights ---------------------------------------
(mu/defn ^:private automatic-insights-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  ""
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (when (and (structured? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column)))
    (let [aggregation-ops (concat [:distinct]
                                  (when (lib.types.isa/summable? column)
                                    [:sum :avg]))]
      {:lib/type     ::drill-thru
       :type         :drill-thru/summarize-column
       :column       column
       :aggregations aggregation-ops})))

;;; --------------------------------------- Top Level --------------------------------------------
(mu/defn available-drill-thrus :- [:sequential [:ref ::lib.schema.drill-thru/drill-thru]]
  "Get a list (possibly empty) of available drill-thrus for a column, or a column + value pair.

  Note that `stage-number` is required because to avoid ambiguous arities."
  ([query stage-number column]
   (available-drill-thrus query stage-number column nil))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    column       :- lib.metadata/ColumnMetadata
    value]
   (keep #(% query stage-number column value)
         [distribution-drill
          foreign-key-drill
          object-detail-drill
          pivot-drill
          quick-filter-drill
          sort-drill
          summarize-column-drill])))

(comment
  (let [query    (metabase.lib.dev/query-for-table-name
                  (metabase.lib.metadata.jvm/application-database-metadata-provider 1)
                  "ORDERS")
        stage    (metabase.lib.util/query-stage query -1)
        cols     (metabase.lib.metadata.calculation/visible-columns query -1 stage)
        subtotal (nth cols 3)
        user-id  (nth cols 1)
        ops      (operators-for subtotal 100)
        filters  (map :filter ops)
        binned   (-> query
                     (metabase.lib.breakout/breakout -1 (metabase.lib.binning/with-binning subtotal
                                                          {:strategy :num-bins :num-bins 50}))
                     (metabase.lib.aggregation/aggregate (metabase.lib.aggregation/count)))
        counted  (metabase.lib.aggregation/aggregate query (metabase.lib.aggregation/count))
        countcol (first (metabase.lib.metadata.calculation/metadata counted))
        pivots   (->> (available-drill-thrus counted -1 countcol 0)
                      (keep :pivots)
                      first)
        citycol  (->> pivots :category second)]
    #_(quick-filter-drill query -1 subtotal 200)
    #_(metabase.lib.order-by/order-bys (metabase.lib.order-by/order-by query -1 subtotal :asc) -1)
    (available-drill-thrus query -1 user-id)
    #_(lib.aggregation/aggregate query (lib.aggregation/distinct subtotal))
    ;; TODO: Missing drills: automatic insights, format.
    )
  *e)
