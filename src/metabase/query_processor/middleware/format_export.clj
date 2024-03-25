(ns metabase.query-processor.middleware.format-export)

(defn format-export
  "Apply formatting to exports."
  [{{:keys [format-export?] :or {format-export? true}} :middleware, :as _query} rff]
  (if format-export?
    (fn format-export-rff* [metadata]
      (rff (assoc metadata :format-export? format-export?)))
    rff))
