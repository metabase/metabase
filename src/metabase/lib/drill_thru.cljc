(ns metabase.lib.drill-thru
  (:require
    [metabase.lib.dispatch :as lib.dispatch]
    [metabase.lib.hierarchy :as lib.hierarchy]
    [metabase.lib.metadata :as lib.metadata]
    [metabase.lib.metadata.calculation :as lib.metadata.calculation]
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

;;; ------------------------------------- Quick Filters ------------------------------------------
(mu/defn ^:private object-detail-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
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
                       (lib.types.isa/foreign-key? column)                 :drill-thru/fk)]
      (when drill-type
        {:lib/type  ::drill-thru
         :type      drill-type
         :object-id value
         :many-pks? many-pks?}))))

;;; --------------------------------------- Top Level --------------------------------------------
(mu/defn available-drill-thrus :- [:sequential [:ref ::lib.schema.drill-thru/drill-thru]]
  "Get a list (possibly empty) of available drill-thrus for a column, or a column + value pair.

  Note that `stage-number` is required because to avoid ambiguous arities."
  ([query stage-number column]
   (available-drill-thrus query stage-number column nil))

  ([query        ;:- ::lib.schema/query
    stage-number ;:- :int
    column       :- lib.metadata/ColumnMetadata
    value]
   (keep #(% query stage-number column value)
         [object-detail-drill
          quick-filter-drill])))

(comment
  (let [query    (metabase.lib.dev/query-for-table-name
                   (metabase.lib.metadata.jvm/application-database-metadata-provider 1)
                   "ORDERS")
        stage    (metabase.lib.util/query-stage query -1)
        cols     (metabase.lib.metadata.calculation/visible-columns query -1 stage)
        subtotal (nth cols 3)
        ops      (operators-for subtotal 100)
        filters  (map :filter ops)]
    #_(quick-filter-drill query -1 subtotal 200)
    (available-drill-thrus query -1 (nth cols 1) 100)
    )
  *e
  )
