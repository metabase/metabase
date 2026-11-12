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

(defn log-changes!
  "Adds an entry for each row id in `changes`, a seq of `[table-name row-ids action]`."
  [changes]
  (doseq [entries (partition-all 1000 (for [[table-name row-ids action] changes, id row-ids]
                                        {:table_name table-name, :row_id id, :action action}))]
    (t2/insert! :change_log entries)))

(defn unnumbered-ids
  "The ids of up to `limit` committed entries that have no `position`, lowest first."
  [limit]
  (t2/select-fn-vec :id [:change_log :id] {:where [:= :position nil], :order-by [[:id :asc]], :limit limit}))

(defn highest-position
  "The highest `position` of an entry, or nil when no entry has one."
  []
  (t2/select-one-fn :position :change_log {:select [[[:max :position] :position]]}))

(defn set-positions!
  "Sets the `position` of the entries `ids`, lowest id first: `start` for the first, and for each other `start` plus
  how far its id is above the first. On Postgres it is one statement for each 1,000 entries. Elsewhere it is one for
  each entry on purpose: an update of many rows can scan the table, and on MariaDB a scan waits for the rows that open
  transactions inserted (`ids-out-of-order-test`)."
  [ids start]
  (let [position [:+ start [:- :id (first ids)]]]
    (doseq [where (if (= :postgres (mdb/db-type))
                    (map #(vector :in :id %) (partition-all 1000 ids))
                    (map #(vector := :id %) ids))]
      (t2/query-one {:update :change_log, :set {:position position}, :where where}))))

(defn foreign-keys
  "The `ON DELETE CASCADE` and `SET NULL` foreign keys of the app DB's tables:

      {:parent \"metabase_table\", :parent-column :id, :child \"metabase_field\", :column :table_id, :rule :cascade}

  `:rule` is `:cascade` or `:set-null`. Names are lower-cased, since H2 reports them in upper case."
  []
  (t2/with-connection [^Connection conn]
    (let [md      ^DatabaseMetaData (.getMetaData conn)
          catalog (.getCatalog conn)
          schema  (.getSchema conn)
          names   (with-open [rs (.getTables md catalog schema "%" (into-array String ["TABLE"]))]
                    (mapv :table_name (resultset-seq rs)))]
      (vec (for [table names
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
  "The `columns` of the rows that a Toucan write to `model` will change, selected with the write's own `parsed-args`
  and `resolved-query`."
  [model select-query-type parsed-args resolved-query columns]
  (t2.pipeline/transduce-query (t2.pipeline/default-rf select-query-type)
                               select-query-type
                               model
                               (assoc (dissoc parsed-args :queryable :changes) :columns (vec (distinct columns)))
                               resolved-query))

(defn delete-before!
  "Deletes up to `batch-size` entries created before `t`, and returns how many. It runs the same statements as
  `metabase.audit-app.db` does for the audit tables."
  [t batch-size]
  (t2/query-one (case (mdb/db-type)
                  (:postgres :h2)
                  {:delete-from :change_log
                   :where       [:in :id ^:allow-subquery {:select   [:id]
                                                           :from     :change_log
                                                           :where    [:< :created_at t]
                                                           :order-by [[:id :asc]]
                                                           :limit    batch-size}]}

                  (:mysql :mariadb)
                  {:delete-from :change_log
                   :where       [:< :created_at t]
                   :limit       batch-size})))
