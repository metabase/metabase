(ns metabase.query-processor.middleware.pivot-export)

(defn add-data-for-pivot-export
  "Provide `:pivot-export-options` in the query metadata so that `qp.si/streaming-results-writer` implementations can
  post-process query results."
  [query rff]
  (fn add-query-for-pivot-rff* [metadata]
    ;; the `qp.si/streaming-results-writer` implmementations can apply/not-apply formatting based on the key's value
    (let [opts     (get-in query [:middleware :pivot-options])
          pivot    (get-in query [:middleware :pivot?])
          metadata (cond-> metadata
                     opts  (assoc :pivot-export-options opts)
                     pivot (assoc :pivot? pivot))]
      (rff metadata))))
