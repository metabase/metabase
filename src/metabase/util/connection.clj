(ns metabase.util.connection
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn app-db-column-types
  "Returns a map of all column names to their respective type names, for the given `table-name`, by using the JDBC
  .getMetaData method of the given `conn` (which is presumed to be an app DB connection)."
  [^Connection conn table-name]
  (with-open [rset (.getColumns (.getMetaData conn) nil nil table-name nil)]
    (into {} (take-while some?)
             (repeatedly
               (fn []
                 (when (.next rset)
                   [(.getString rset "COLUMN_NAME") (.getString rset "TYPE_NAME")]))))))
