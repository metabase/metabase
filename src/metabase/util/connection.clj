(ns metabase.util.connection
  (:require [metabase.util :as u]
            [toucan2.core :as t2])
  (:import
   (java.sql Connection ResultSet ResultSetMetaData)))

(set! *warn-on-reflection* true)

(defn- consume-rset [^ResultSet rset cb]
  (into {} (iteration
            (fn [_]
              (when (.next rset)
                (cb rset))))))

(defn app-db-column-types
  "Returns a map of all column names to their respective type names for the given `table-name` in the provided
  application-db."
  [app-db table-name']
  (let [table-name (cond-> (name table-name')
                     (= (:db-type app-db) :h2) u/upper-case-en)]
    (t2/with-connection [^Connection conn]
      (let [md (.getMetaData conn)]
        (with-open [cols (.getColumns md nil nil table-name nil)
                    pks  (.getPrimaryKeys md nil nil table-name)
                    fks  (.getImportedKeys md nil nil table-name)]
          (let [pks (consume-rset pks (fn [^ResultSet pks]
                                        [(.getString pks "COLUMN_NAME") true]))
                fks (consume-rset fks (fn [^ResultSet fks]
                                        [(.getString fks "FKCOLUMN_NAME")
                                         (str (.getString fks "PKTABLE_NAME")
                                              "."
                                              (.getString fks "PKCOLUMN_NAME"))]))]
            (consume-rset cols (fn [^ResultSet cols]
                                 (let [col (.getString cols "COLUMN_NAME")]
                                   [col {:type    (.getString cols "TYPE_NAME")
                                         :notnull (= (.getInt cols "NULLABLE")
                                                     ResultSetMetaData/columnNoNulls)
                                         :pk      (get pks col)
                                         :fk      (get fks col)}])))))))))
