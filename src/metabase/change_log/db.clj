(ns metabase.change-log.db
  "Application database queries for the change-log module."
  (:require
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.sql Connection DatabaseMetaData)))

(set! *warn-on-reflection* true)

(defn log-changes!
  "Logs `action` on each of the rows `row-ids` of `table-name`, for each `[table-name row-ids action]` of `changes`."
  [changes]
  (doseq [entries (partition-all 1000 (for [[table-name row-ids action] changes, id row-ids]
                                        {:table_name table-name, :row_id id, :action action}))]
    (t2/insert! :change_log entries)))

(defn log-rows!
  "Logs `action` on each of the rows `row-ids` of `table-name`."
  [table-name row-ids action]
  (log-changes! [[table-name row-ids action]]))

(defn foreign-keys
  "The foreign keys from the logged `tables`, a set of table names, by the table they reference:
  `{:parent :parent-column :child :column :rule}`, `:rule` being `:cascade` or `:set-null`. Other keys are left out.
  Names are lower case, as the app DB's engines differ there."
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
  "Deletes up to `batch-size` of the entries created before the instant `t`, and returns how many it deleted."
  [t batch-size]
  (if-let [ids (not-empty (t2/select-fn-vec :id :change_log :created_at [:< t] {:limit batch-size}))]
    (t2/delete! :change_log :id [:in ids])
    0))
