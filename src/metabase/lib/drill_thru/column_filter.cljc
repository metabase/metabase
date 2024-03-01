(ns metabase.lib.drill-thru.column-filter
  "Enables \"Filter by this column\" menu item.

  The caveat here is that for aggregation and breakout columns we need to append a stage before adding a filter. There
  is a helper function called `filterDrillDetails` which returns the query with a possibly appended stage, and the
  corresponding column for that stage. In each test case where drill thru is allowed we need to verify that
  `filterDrillDetails` appended the stage where needed.

  Another caveat is that we need to verify that `filterDrillDetails` returned a _filterable_ column, i.e. a column
  obtained from `filterableColumns` call. A good way to verify that is to call `filterableColumnOperators` and check
  that a non-empty list is returned.

  Entry points:

  - Column header

  Requirements:

  - Column not `type/Structured`

  Query transformation:

  - None/identity. The FE will show the FilterPicker and not call `drillThru` for this drill.

  Question transformation:
  - None"
  (:require
   [medley.core :as m]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn prepare-query-for-drill-addition :- [:map
                                              [:query ::lib.schema/query]
                                              [:stage-number :int]
                                              [:column lib.filter/ColumnWithOperators]]
  "If the column we're filtering on is an aggregation, the filtering must happen in a later stage. This function returns
  a map with that possibly-updated `:query` and `:stage-number`, plus the `:column` for filtering in that stage (with
  filter operators, as returned by [[lib.filter/filterable-columns]]).

  If the column is an aggregation but the query already has a later stage, that stage is reused.
  If the column is not an aggregation, the query and stage-number are returned unchanged, but the
  [[lib.filter/filterable-columns]] counterpart of the input `column` is still returned.

  This query and filterable column are exactly what the FE needs to render the filtering UI for a column filter drill,
  or certain tricky cases of quick filter."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.schema.metadata/column
   column-ref   :- ::lib.schema.ref/ref]
  (let [next-stage    (->> (lib.util/canonical-stage-index query stage-number)
                           (lib.util/next-stage-number query))
        base          (cond
                        ;; Not an aggregation or breakout: just the input query and stage.
                        (and
                          (not= (:lib/source column) :source/aggregations)
                          (not= (:lib/source column) :source/breakouts))
                        {:query        query
                         :stage-number stage-number}

                        ;; Aggregation or breakout column: if there's a later stage, use it.
                        next-stage {:query        query
                                    :stage-number next-stage}

                        ;; Aggregation or breakout column with no later stage; append a stage.
                        :else      {:query        (lib.stage/append-stage query)
                                    :stage-number -1})
        columns       (lib.filter/filterable-columns (:query base) (:stage-number base))
        filter-column (or (lib.equality/find-matching-column
                            (:query base) (:stage-number base) column-ref columns)
                          (and (:lib/source-uuid column)
                               (m/find-first #(= (:lib/source-uuid %) (:lib/source-uuid column))
                                             columns)))]
    (assoc base :column filter-column)))

(mu/defn column-filter-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.column-filter]
  "Filtering at the column level, based on its type. Displays a submenu of eg. \"Today\", \"This Week\", etc. for date
  columns.

  Note that if the clicked column is an aggregation, filtering by it will require a new stage. Therefore this drill
  returns a possibly-updated `:query` and `:stage-number` along with a `:column` referencing that later stage."
  [query                             :- ::lib.schema/query
   stage-number                      :- :int
   {:keys [column column-ref value]} :- ::lib.schema.drill-thru/context]
  ;; Note: original code uses an addition `clicked.column.field_ref != null` condition.
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column)))
    (let [initial-op (when-not (lib.types.isa/temporal? column) ; Date fields have special handling in the FE.
                       (-> (lib.filter.operator/filter-operators column)
                           first
                           (assoc :lib/type :operator/filter)))]

      (merge
        {:lib/type   :metabase.lib.drill-thru/drill-thru
         :type       :drill-thru/column-filter
         :initial-op initial-op}
        ;; When the column we would be filtering on is an aggregation, it can't be filtered without adding a stage.
        (prepare-query-for-drill-addition query stage-number column column-ref)))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/column-filter
  [_query _stage-number {:keys [initial-op]}]
  {:type       :drill-thru/column-filter
   :initial-op initial-op})

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/column-filter :- ::lib.schema/query
  [query                            :- ::lib.schema/query
   stage-number                     :- :int
   {:keys [column] :as _drill-thru} :- ::lib.schema.drill-thru/drill-thru.column-filter
   filter-op                        :- [:or :keyword :string] ; filter tag
   value                            :- :any]
  (lib.filter/filter query stage-number (lib.filter/filter-clause filter-op column value)))
