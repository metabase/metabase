(ns metabase.warehouses.app-db-copy
  "How copying the application database to another database copies databases."
  (:require
   [metabase.util.encryption :as encryption]))

(set! *warn-on-reflection* true)

(defn transform-database
  "The database row to write, with empty connection details for an attached data warehouse, and for an H2 database
  unless `copy-h2-database-details?`, since H2 connection parameters are a pathway to remote code execution and the
  Sample Database resets its own details on every launch."
  [row {:keys [copy-h2-database-details?]}]
  (cond-> row
    (or (:is_attached_dwh row)
        (and (not copy-h2-database-details?)
             (= (:engine row) "h2")))
    (assoc :details (encryption/maybe-encrypt "{}"))))
