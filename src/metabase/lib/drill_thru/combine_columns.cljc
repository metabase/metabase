(ns metabase.lib.drill-thru.combine-columns
  "Adds an expression clause that concatenates several string columns.

  Entry points:

  - Column header

  Query transformation:

  - Add an expression that `concat`s the clicked column with 1 or more `[separator column]` pairs."
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(mu/defn combine-columns-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.combine-columns]
  "Column clicks on string columns.

  Might add a stage, like `:drill-thru/column-filter` does, if the current stage has aggregations."
  [query                 :- ::lib.schema/query
   stage-number          :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and column
             (nil? value)
             (lib.drill-thru.common/mbql-stage? query stage-number)
             (lib.types.isa/string? column))
    {:lib/type :metabase.lib.drill-thru/drill-thru
     :type     :drill-thru/combine-columns
     :column   column}))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/combine-columns
  [_query _stage-number _drill & _args]
  (throw (ex-info "Do not call drill-thru for combine-columns; add the expression directly" {})))
