(ns metabase.util.connection
  (:require [metabase.util :as u]
            [toucan2.core :as t2])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn app-db-column-types
  "Returns a map of all column names to their respective type names for the given `table-name` in the provided
  application-db."
  [app-db table-name']
  (let [table-name (cond-> table-name'
                     (= (:db-type app-db) :h2) u/upper-case-en)]
    (t2/with-connection [^Connection conn]
      (with-open [rset (.getColumns (.getMetaData conn) nil nil table-name nil)]
        (into {}
              (iteration
               (fn [_]
                 (when (.next rset)
                   [(.getString rset "COLUMN_NAME") (.getString rset "TYPE_NAME")]))))))))
