(ns metabase.change-log.db
  "Application database queries for the change-log module."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.sql Connection DatabaseMetaData)))

(set! *warn-on-reflection* true)

(defn log-rows!
  "Logs `action` on each of the rows `row-ids` of `table-name`."
  [table-name row-ids action]
  (doseq [ids (partition-all 1000 row-ids)]
    (t2/insert! :change_log (for [id ids] {:table_name table-name, :row_id id, :action action}))))

(defn log-start!
  "Logs a start marker on a second connection, which it takes from the app DB, so it commits whatever happens to the
  transaction it is called in. It only inserts, so it waits on no lock the caller holds."
  []
  (t2/with-connection [_conn (mdb/app-db)]
    (log-rows! "*" [0] "start")))

(defn foreign-keys
  "The foreign keys into the logged `tables`, a set of table names, by the referenced table:
  `{:column :parent-column :child :rule}`, `:rule` being `:cascade` or `:set-null`. Table and column names are lower
  case, as the app DB's engines differ there."
  [tables]
  (t2/with-connection [^Connection conn]
    (let [md      ^DatabaseMetaData (.getMetaData conn)
          catalog (.getCatalog conn)
          schema  (.getSchema conn)
          names   (with-open [rs (.getTables md catalog schema "%" (into-array String ["TABLE"]))]
                    (filterv #(contains? tables (u/lower-case-en %)) (map :table_name (resultset-seq rs))))]
      (group-by :parent
                (for [table names
                      fk    (with-open [rs (.getImportedKeys md catalog schema table)]
                              (doall (resultset-seq rs)))
                      :let  [rule (condp = (some-> (:delete_rule fk) int)
                                    DatabaseMetaData/importedKeyCascade :cascade
                                    DatabaseMetaData/importedKeySetNull :set-null
                                    nil)]
                      :when rule]
                  {:parent        (u/lower-case-en (:pktable_name fk))
                   :parent-column (keyword (u/lower-case-en (:pkcolumn_name fk)))
                   :child         (u/lower-case-en (:fktable_name fk))
                   :column        (keyword (u/lower-case-en (:fkcolumn_name fk)))
                   :rule          rule})))))

(defn rows-where
  "The `columns` of the rows of `table-name` whose `column` is in `values`."
  [table-name column values columns]
  (into []
        (mapcat #(t2/query {:select (vec (distinct columns)), :from [(keyword table-name)], :where [:in column %]}))
        (partition-all 1000 values)))

(defn rows-to-change
  "The `columns` of the rows of `model` that a write with Toucan's `parsed-args` and `resolved-query` will change,
  read in one `select-query-type` SELECT, in the write's transaction."
  [model select-query-type parsed-args resolved-query columns]
  (t2.pipeline/transduce-query (t2.pipeline/default-rf select-query-type)
                               select-query-type
                               model
                               (assoc (dissoc parsed-args :queryable :changes) :columns (vec (distinct columns)))
                               resolved-query))

(defn delete-before!
  "Deletes the entries created before the instant `t`."
  [t]
  (t2/delete! :change_log :created_at [:< t]))
