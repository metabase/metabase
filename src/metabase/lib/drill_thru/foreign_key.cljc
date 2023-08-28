(ns metabase.lib.drill-thru.foreign-key
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(mu/defn foreign-key-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.fk-filter]
  "When clicking on a foreign key value, filter this query by that column.

  This has the same effect as the `=` filter on a generic field (ie. not a key), but renders differently.

  Contrast [[object-detail-drill]], which shows the details of the foreign object."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value)
             (not (lib.types.isa/primary-key? column))
             (lib.types.isa/foreign-key? column))
    {:lib/type  :metabase.lib.drill-thru/drill-thru
     :type      :drill-thru/fk-filter
     :filter    (lib.options/ensure-uuid [:= {} (lib.ref/ref column) value])}))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/fk-filter
  [query stage-number drill-thru & _]
  (lib.filter/filter query stage-number (:filter drill-thru)))
