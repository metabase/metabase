(ns metabase.query-processor.middleware.bind-effective-timezone
  (:require [metabase.util.date :as ud]))

(defn bind-effective-timezone
  "Middlware that ensures the report-timezone and data-timezone are bound based on the database being queried against"
  [qp]
  (fn [query]
    (ud/with-effective-timezone (:database query)
      (qp query))))
