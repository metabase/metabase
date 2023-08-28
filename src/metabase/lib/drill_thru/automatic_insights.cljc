(ns metabase.lib.drill-thru.automatic-insights)

#_(mu/defn ^:private automatic-insights-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
    ""
    [query        :- ::lib.schema/query
     stage-number :- :int
     column       :- lib.metadata/ColumnMetadata
     value]
    (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
               (lib.metadata/setting query :enable-xrays)
               column
               (nil? value)
               (not (lib.types.isa/structured? column)))
      ;; TODO: Check for expression dimensions; don't show if so, they don't work see metabase#16680.
      ;; TODO: Implement this - it's actually a URL in v1 rather than a click handler.
      ))
