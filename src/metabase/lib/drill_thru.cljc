(ns metabase.lib.drill-thru
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

;; TODO: Different ways to apply drill-thru to a query.
;; So far:
;; - :filter on each :operators of :drill-thru/quick-filter applied with (lib/filter query stage filter-clause)

;; TODO: ActionMode, PublicMode, MetabotMode need to be captured in the FE before calling `available-drill-thrus`.


;;; ---------------------------------------- Internals -------------------------------------------
(defn- structured-query? [query stage-number]
  (-> (lib.util/query-stage query stage-number)
      :lib/type
      (= :mbql.stage/mbql)))

(defn- drill-thru-dispatch [_query _stage-number drill-thru]
  (:type drill-thru))

(defmulti drill-thru-method
  "`(drill-thru-method query stage-number drill-thru)`

  Applies the `drill-thru` to the query and stage. Keyed on the `:type` of the drill-thru.
  Returns the updated query."
  drill-thru-dispatch)

(defmulti drill-thru-info-method
  "Helper for getting the display-info of each specific type of drill-thru."
  drill-thru-dispatch)

(defmethod drill-thru-info-method :default
  [_query _stage-number drill-thru]
  ;; Several drill-thrus are rendered as a fixed label for that type, with no reference to the column or value,
  ;; so the default is simply the drill-thru type.
  (select-keys drill-thru [:type]))

(defmethod lib.metadata.calculation/display-info-method ::drill-thru
  [query stage-number drill-thru]
  (drill-thru-info-method query stage-number drill-thru))

;;; -------------------------------------- Quick Filters -----------------------------------------
(defn- operator [op & args]
  (lib.options/ensure-uuid (into [op {}] args)))

(mu/defn ^:private operators-for :- [:sequential [:map [:name string?] [:filter ::lib.schema.expression/boolean]]]
  [column :- lib.metadata/ColumnMetadata
   value]
  (let [field-ref (lib.ref/ref column)]
    (cond
      (lib.types.isa/structured? column)  []
      (= value :null)                     [{:name "=" :filter (operator :is-null  field-ref)}
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
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (structured-query? query stage-number)
             ;(editable? query stage-number)
             column
             (some? value)
             (not (lib.types.isa/primary-key? column))
             (not (lib.types.isa/foreign-key? column)))
    {:lib/type  ::drill-thru
     :type      :drill-thru/quick-filter
     :operators (operators-for column value)}))

(defmethod drill-thru-info-method :drill-thru/quick-filter
  [_query _stage-number drill-thru]
  {:type      (:type drill-thru)
   :operators (map :name (:operators drill-thru))})

(defmethod drill-thru-method :drill-thru/quick-filter
  [query stage-number drill-thru filter-op & _more]
  (if-let [quick-filter (first (filter #(= (:name %) filter-op) (:operators drill-thru)))]
    (lib.filter/filter query stage-number (:filter quick-filter))
    (throw (ex-info (str "No matching filter for operator " filter-op)
                    {:drill-thru   drill-thru
                     :operator     filter-op
                     :query        query
                     :stage-number stage-number}))))

;;; ------------------------------------ Object Details ------------------------------------------
(defn- object-detail-drill-for [query stage-number {:keys [column row value] :as context} many-pks?]
  (let [base {:lib/type  ::drill-thru
              :type      :drill-thru/pk
              :column    column
              :object-id value
              :many-pks? many-pks?}]
    (cond
      (and (lib.types.isa/primary-key? column) many-pks?) (assoc base :type :drill-thru/pk)
      ;; TODO: Figure out clicked.extraData and the dashboard flow.
      (lib.types.isa/primary-key? column)                 (assoc base :type :drill-thru/zoom)
      (lib.types.isa/foreign-key? column)                 (assoc base :type :drill-thru/fk-details)
      (and (not many-pks?)
           (not-empty row)
           (empty? (lib.aggregation/aggregations query stage-number)))
      (let [[pk-column] (lib.metadata.calculation/primary-keys query) ; Already know there's only one.
            pk-value    (->> row
                             (filter #(= (:column-name %) (:name pk-column)))
                             first
                             :value)]
        (when (and pk-value
                   ;; Only recurse if this is a different column - otherwise it's an infinite loop.
                   (not= (:name column) (:name pk-column)))
          (object-detail-drill-for query
                                   stage-number
                                   (assoc context :column pk-column :value pk-value)
                                   many-pks?))))))

(mu/defn ^:private object-detail-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "When clicking a foreign key or primary key value, drill through to the details for that specific object.

  Contrast [[foreign-key-drill]], which filters this query to only those rows with a specific value for a FK column."
  [query                              :- ::lib.schema/query
   stage-number                       :- :int
   {:keys [column value] :as context} :- ::lib.schema.drill-thru/context]
  (when (and (structured-query? query stage-number)
             column
             (some? value))
    (object-detail-drill-for query stage-number context
                             (> (count (lib.metadata.calculation/primary-keys query)) 1))))

(defmethod drill-thru-info-method :drill-thru/pk
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(defmethod drill-thru-info-method :drill-thru/zoom
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(defmethod drill-thru-info-method :drill-thru/fk-details
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(defmethod drill-thru-method :drill-thru/pk
  [query stage-number {:keys [column object-id]} & _]
  ;; This type is only used when there are multiple PKs and one was selected - [= pk x] filter.
  (lib.filter/filter query stage-number
                     (lib.options/ensure-uuid [:field {} (lib.ref/ref column) object-id])))

(defn- field-id [x]
  (cond
    (int? x)                   x
    (string? x)                x
    (and (vector? x)
         (= :field (first x))) (field-id (nth x 2))
    (map? x)                   (:id x)))

(defmethod drill-thru-method :drill-thru/fk
  [query stage-number {:keys [column object-id]} & _]
  (let [fk-column-id     (:fk-target-field-id column)
        fk-column        (lib.metadata/field query fk-column-id)
        fk-filter        (lib.options/ensure-uuid [:= {} (lib.ref/ref fk-column) object-id])
        ;; Only filters which specify other PKs of the table are allowed to remain.
        other-pk?        (fn [[op _opts lhs :as _old-filter]]
                           (and lhs
                                (not= (field-id lhs) fk-column-id)
                                (= op :=)
                                (when-let [filter-field (lib.metadata.calculation/metadata query stage-number lhs)]
                                  (and (lib.types.isa/primary-key? filter-field)
                                       (= (:table-id fk-column) (:table-id filter-field))))))
        other-pk-filters (filter other-pk? (lib.filter/filters query stage-number))]
    (reduce #(lib.filter/filter %1 stage-number %2)
            (lib.util/update-query-stage query stage-number dissoc :filters)
            (concat [fk-filter] other-pk-filters))))

;;; ------------------------------------- Foreign Key --------------------------------------------
(mu/defn ^:private foreign-key-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "When clicking on a foreign key value, filter this query by that column.

  This has the same effect as the `=` filter on a generic field (ie. not a key), but renders differently.

  Contrast [[object-detail-drill]], which shows the details of the foreign object."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (structured-query? query stage-number)
             column
             (some? value)
             (not (lib.types.isa/primary-key? column))
             (lib.types.isa/foreign-key? column))
    {:lib/type  ::drill-thru
     :type      :drill-thru/fk-filter
     :filter    (lib.options/ensure-uuid [:= {} (lib.ref/ref column) value])}))

(defmethod drill-thru-method :drill-thru/fk-filter
  [query stage-number drill-thru & _]
  (lib.filter/filter query stage-number (:filter drill-thru)))

;;; ------------------------------------- Distribution -------------------------------------------
;; TODO: The original `Question.distribution()` sets the display to `bar`, but that's out of scope for MLv2.
;; Make sure the FE does this on the question after evolving the query.
(mu/defn ^:private distribution-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Select a column and see a histogram of how many rows fall into an automatic set of bins/buckets.
  - For dates, breaks out by month by default.
  - For numeric values, by an auto-selected set of bins
  - For strings, by each distinct value (which might be = the number of rows)"
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (structured-query? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/primary-key? column))
             (not (lib.types.isa/structured?  column))
             (not (lib.types.isa/comment?     column))
             (not (lib.types.isa/description? column)))
    {:lib/type  ::drill-thru
     :type      :drill-thru/distribution
     :column    column}))

(defmethod drill-thru-method :drill-thru/distribution
  [query stage-number {:keys [column] :as _drill-thru} & _]
  (when (structured-query? query stage-number)
    (let [breakout (cond
                     (lib.types.isa/date? column)    (lib.temporal-bucket/with-temporal-bucket column :month)
                     (lib.types.isa/numeric? column) (lib.binning/with-binning column (lib.binning/default-auto-bin))
                     :else                           (lib.ref/ref column))]
      (-> query
          ;; Remove most of the target stage.
          (lib.util/update-query-stage stage-number dissoc :aggregation :breakout :limit :order-by)
          ;; Then set a count aggregation and the breakout above.
          (lib.aggregation/aggregate stage-number (lib.aggregation/count))
          (lib.breakout/breakout stage-number breakout)))))

;;; -------------------------------------- Pivot Drill--------------------------------------------
(mu/defn ^:private pivot-drill-pred :- [:sequential lib.metadata/ColumnMetadata]
  "Implementation for pivoting on various kinds of fields.

  Don't call this directly; call [[pivot-drill]]."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context
   field-pred             :- [:=> [:cat lib.metadata/ColumnMetadata] boolean?]]
  (when (and (structured-query? query stage-number)
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

(mu/defn ^:private pivot-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Return all possible pivoting options on the given column and value.

  See `:pivots` key, which holds a map `{t [breakouts...]}` where `t` is `:category`, `:location`, or `:time`.
  If a key is missing, there are no breakouts of that kind."
  [query                              :- ::lib.schema/query
   stage-number                       :- :int
   {:keys [column value] :as context} :- ::lib.schema.drill-thru/context]
  (when (and (structured-query? query stage-number)
             column
             (some? value)
             (= (:lib/source column) :source/aggregations)
             (-> (lib.aggregation/aggregations query stage-number) count pos?))
    (let [pivot-types (case (mapv #(breakout-type query stage-number %)
                                  (lib.breakout/breakouts query stage-number))
                        ([:date]
                         [:date :category])     #{:category :location}
                        [:address]              #{:category :time}
                        ([]
                         [:category]
                         [:category :category]) #{:category :location :time}
                        #{})
          by-category (when (pivot-types :category)
                        (pivot-by-category-drill query stage-number context))
          by-location (when (pivot-types :location)
                        (pivot-by-location-drill query stage-number context))
          by-time     (when (pivot-types :time)
                        (pivot-by-time-drill     query stage-number context))
          pivots      (merge (when (seq by-category) {:category by-category})
                             (when (seq by-location) {:location by-location})
                             (when (seq by-time)     {:time     by-time}))]
      ;; TODO: Do dimensions need to be attached? How is clicked.dimensions calculated in the FE?
      (when-not (empty? pivots)
        {:lib/type ::drill-thru
         :type     :drill-thru/pivot
         :pivots   pivots}))))

(defmethod drill-thru-info-method :drill-thru/pivot
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

;;; ----------------------------------------- Sort -----------------------------------------------
(mu/defn ^:private sort-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Sorting on a clicked column."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (structured-query? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column))
             (or (:lib/source column)
                 (:id column)))
    (let [orderable  (->> (lib.order-by/orderable-columns query stage-number)
                          (map :id)
                          set)
          this-order (first (for [[dir _opts field] (lib.order-by/order-bys query stage-number)
                                  :when (lib.equality/find-closest-matching-ref query (lib.ref/ref column) [field])]
                              dir))]
      (when (orderable (:id column))
        {:lib/type        ::drill-thru
         :type            :drill-thru/sort
         :column          column
         :sort-directions (case this-order
                            :asc  [:desc]
                            :desc [:asc]
                            [:asc :desc])}))))

(defmethod drill-thru-info-method :drill-thru/sort
  [_query _stage-number {directions :sort-directions}]
  {:type       :drill-thru/sort
   :directions directions})

;;; ------------------------------ Summarize Column (single value) -------------------------------
(mu/defn ^:private summarize-column-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "A set of possible aggregations that can summarize this column: distinct values, sum, average.
  Separate from [[summarize-column-by-time-drill]] which breaks out a column over time."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (structured-query? query stage-number)
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

(defmethod drill-thru-info-method :drill-thru/summarize-column
  [_query _stage-number {:keys [aggregations]}]
  {:type         :drill-thru/summarize-column
   :aggregations aggregations})

(defmethod drill-thru-method :drill-thru/summarize-column
  [query stage-number {:keys [column] :as _drill-thru} aggregation & _]
  ;; TODO: The original FE code for this does `setDefaultDisplay` as well.
  (let [aggregation-fn (case (keyword aggregation)
                         :distinct lib.aggregation/distinct
                         :sum      lib.aggregation/sum
                         :avg      lib.aggregation/avg)]
    (lib.aggregation/aggregate query stage-number (aggregation-fn column))))

;;; -------------------------------- Summarize Column (by time) ----------------------------------
(mu/defn ^:private summarize-column-by-time-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "A breakout summarizing a column over time.
  Separate from single-value [[summarize-column-drill]] for sum, average, and distinct value count."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (structured-query? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column))
             (lib.types.isa/summable? column))
    ;; There must be a date dimension available.
    (when-let [breakout-column (->> (lib.breakout/breakoutable-columns query stage-number)
                                    (filter lib.types.isa/date?)
                                    first)]
      {:lib/type ::drill-thru
       :type     :drill-thru/summarize-column-by-time
       :column   column
       :breakout breakout-column})))

(defmethod drill-thru-method :drill-thru/summarize-column-by-time
  [query stage-number {:keys [breakout column] :as _drill-thru} & _]
  (let [bucketed (->> (lib.temporal-bucket/available-temporal-buckets query stage-number breakout)
                      (filter :default)
                      first
                      (lib.temporal-bucket/with-temporal-bucket breakout))]
    (-> query
        (lib.aggregation/aggregate stage-number (lib.aggregation/sum column))
        (lib.breakout/breakout stage-number bucketed))))

;;; ------------------------------------- Column Filter ------------------------------------------
(mu/defn ^:private column-filter-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Filtering at the column level, based on its type. Displays a submenu of eg. \"Today\", \"This Week\", etc. for date
  columns."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (structured-query? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column))
             ;; Must be a real field in the DB. Note: original code uses `clicked.column.field_ref != null` for this.
             (some? (:id column)))
    (let [initial-op (when-not (lib.types.isa/date? column) ; Date fields have special handling in the FE.
                       (-> (lib.filter.operator/filter-operators column)
                           first
                           (assoc :lib/type :operator/filter)))]
      {:lib/type   ::drill-thru
       :type       :drill-thru/column-filter
       :column     column
       :initial-op initial-op})))

(defmethod drill-thru-info-method :drill-thru/column-filter
  [_query _stage-number {:keys [initial-op]}]
  {:type       :drill-thru/column-filter
   :initial-op initial-op})

(defmethod drill-thru-method :drill-thru/column-filter
  [query stage-number {:keys [column] :as _drill-thru} filter-op value & _]
  (lib.filter/filter query stage-number (lib.options/ensure-uuid [(keyword filter-op) {} (lib.ref/ref column) value])))

;;; ----------------------------------- Underlying Records ---------------------------------------
(mu/defn ^:private underlying-records-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "When clicking on a particular broken-out group, offer a look at the details of all the rows that went into this
  bucket. Eg. distribution of People by State, then click New York and see the table of all People filtered by
  `STATE = 'New York'`."
  [query                             :- ::lib.schema/query
   stage-number                      :- :int
   {:keys [column dimensions value]} :- ::lib.schema.drill-thru/context]
  ;; Clicking on breakouts is weird. Clicking on Count(People) by State: Minnesota yields a FE `clicked` with:
  ;; - column is COUNT
  ;; - row[0] has col: STATE, value: "Minnesota"
  ;; - row[1] has col: count (source: "aggregation")
  ;; - dimensions which is [{column: STATE, value: "MN"}]
  ;; - value: the count.
  ;; So dimensions is exactly what we want.
  ;; It returns the table name and row count, since that's used for pluralization of the name.
  (when (and (structured-query? query stage-number)
             column
             (some? value)
             (not-empty dimensions)
             (not (lib.types.isa/structured? column)))
    {:lib/type   ::drill-thru
     :type       :drill-thru/underlying-records
     ;; TODO: This is a bit confused for non-COUNT aggregations. Perhaps it should just always be 10 or something?
     ;; Note that some languages have different plurals for exactly 2, or for 1, 2-5, and 6+.
     :row-count  (if (number? value) value 2)
     :table-name (some->> (lib.util/source-table-id query)
                          (lib.metadata/table query)
                          (lib.metadata.calculation/display-name query stage-number))}))

(defmethod drill-thru-info-method :drill-thru/underlying-records
  [_query _stage-number {:keys [row-count table-name]}]
  {:type       :drill-thru/underlying-records
   :row-count  row-count
   :table-name table-name})

(defmethod drill-thru-method :drill-thru/underlying-records
  [_query _stage-number _drill-thru & _]
  (throw (ex-info "Not implemented" {}))
  #_(lib.filter/filter query stage-number (lib.options/ensure-uuid [(keyword filter-op) {} (lib.ref/ref column) value])))

;;; ----------------------------------- Automatic Insights ---------------------------------------
#_(mu/defn ^:private automatic-insights-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  ""
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value]
  (when (and (structured-query? query stage-number)
             (lib.metadata/setting query :enable-xrays)
             column
             (nil? value)
             (not (lib.types.isa/structured? column)))
    ;; TODO: Check for expression dimensions; don't show if so, they don't work see metabase#16680.
    ;; TODO: Implement this - it's actually a URL in v1 rather than a click handler.
    ))

;;; --------------------------------------- Top Level --------------------------------------------
(mu/defn available-drill-thrus :- [:sequential [:ref ::lib.schema.drill-thru/drill-thru]]
  "Get a list (possibly empty) of available drill-thrus for a column, or a column + value pair.

  Note that if `:value nil` in the `context`, that implies the value is *missing*, ie. that this was a column click.
  For a value of `NULL` from the database, use the sentinel `:null`. Most of this file only cares whether the value was
  provided or not, but some things (eg. quick filters) treat `NULL` values differently."
  [query        :- ::lib.schema/query
   stage-number :- :int
   context      :- ::lib.schema.drill-thru/context]
  (keep #(% query stage-number context)
        ;; TODO: Missing drills: automatic insights, format.
        [distribution-drill
         column-filter-drill
         foreign-key-drill
         object-detail-drill
         pivot-drill
         quick-filter-drill
         sort-drill
         summarize-column-drill
         summarize-column-by-time-drill
         #_underlying-records-drill]))

(mu/defn drill-thru :- ::lib.schema/query
  "`(drill-thru query stage-number drill-thru)`

  Applies the `drill-thru` to the query and stage. Keyed on the `:type` of the drill-thru. The `drill-thru` should be
  one of those returned by a call to [[available-drill-thrus]] with the same `query` and `stage-number`.

  Returns the updated query."
  [query        :- ::lib.schema/query
   stage-number :- :int
   drill        :- ::lib.schema.drill-thru/drill-thru]
  (drill-thru-method query stage-number drill))
