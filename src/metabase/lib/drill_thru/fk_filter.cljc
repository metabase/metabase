(ns metabase.lib.drill-thru.fk-filter
  "Adds a simple `=` filter for the selected FK column. Enables option like `View this Product's Reviews`.

  Entry points:

  - Cell

  Requirements:

  - Selected column is `type/FK`

  - Structured (MBQL) query

  - Return `columnName` and `tableName` for the FK column. On the FE we strip `ID` suffix and turn `Product ID` into
    `Product's` and pluralize the table name.

  Query transformation:

  - Add a `=` filter for the selected column and value. Make sure to append the query stage when needed.

  Question transformation:
  - None"
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn fk-filter-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.fk-filter]
  "When clicking on a foreign key value, filter this query by that column.

  This has the same effect as the `=` filter on a generic field (ie. not a key), but renders differently.

  Contrast [[metabase.lib.drill-thru.object-details/object-detail-drill]], which shows the details of the foreign
  object."
  [query                                           :- ::lib.schema/query
   stage-number                                    :- :int
   {:keys [column column-ref value], :as _context} :- ::lib.schema.drill-thru/context]
  (when (and column
             (some? value)
             (not= value :null)         ; If the FK is null, don't show this option.
             (lib.drill-thru.common/mbql-stage? query stage-number)
             (not (lib.types.isa/primary-key? column))
             (lib.types.isa/foreign-key? column))
    (let [source (or (some->> query lib.util/source-table-id (lib.metadata/table query))
                     (some->> query lib.util/source-card-id (lib.metadata/card query)))]
      {:lib/type :metabase.lib.drill-thru/drill-thru
       :type     :drill-thru/fk-filter
       :filter   (lib.options/ensure-uuid [:= {} column-ref value])
       :column-name (lib.metadata.calculation/display-name query stage-number column :long)
       :table-name (lib.metadata.calculation/display-name query 0 source)})))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/fk-filter
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:type :column-name :table-name]))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/fk-filter :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   drill-thru   :- ::lib.schema.drill-thru/drill-thru.fk-filter
   & _args]
  ;; If the stage in question is an MBQL stage, we can simply add a `=` filter to it.
  ;; If it's a native stage, we have to apply the drill to the stage after that stage, which will be an MBQL stage,
  ;; adding it if needed (native stages are currently only allowed to be the first stage.)
  ;; Similarly if the query contains aggregations we will have to add a new stage to do the filtering.
  (let [[query stage-number] (if (lib.drill-thru.common/mbql-stage? query stage-number)
                               ;; MBQL stage - append a stage if there are aggregations
                               (if (seq (lib.aggregation/aggregations query stage-number))
                                 (lib.stage/ensure-extra-stage query stage-number)
                                 [query stage-number])
                               ;; native stage - append an MBQL stage
                               (let [;; convert the stage number e.g. `-1` to the canonical non-relative stage number
                                     stage-number      (lib.util/canonical-stage-index query stage-number)
                                     ;; make sure the query has at least one MBQL stage after the native stage, which we
                                     ;; know is the first stage.
                                     query             (lib.util/ensure-mbql-final-stage query)
                                     next-stage-number (lib.util/next-stage-number query stage-number)]
                                 (assert (lib.util/query-stage query next-stage-number)
                                         "Sanity check: there should be an additional stage by now")
                                 [query next-stage-number]))]
    (lib.filter/filter query stage-number (:filter drill-thru))))
