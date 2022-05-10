(ns metabase.driver.sql-jdbc.actions
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.actions :as actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.table :refer [Table]]
   [metabase.util.honeysql-extensions :as hx]
   [toucan.db :as db]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]))

(defn- pk-where-clause [pk]
  {:pre [(map? pk) (seq pk)]}
  (into [:and] (for [[k v] pk]
                 [:= (keyword k) v])))

(defmethod actions/row-action! [:delete :sql-jdbc]
  [_action driver {:keys [table-id pk]}]
  (let [{database-id  :db_id
         table-name   :name
         table-schema :schema} (db/select-one [Table :name :schema :db_id] :id table-id)
        connection-spec        (sql-jdbc.conn/db->pooled-connection-spec database-id)
        select-sql-args        (sql.qp/format-honeysql driver {:select [[:%count.* :row-count]]
                                                               :from   [(hx/identifier :table table-schema table-name)]
                                                               :where  (pk-where-clause pk)})
        delete-sql-args        (sql.qp/format-honeysql driver {:delete-from (hx/identifier :table table-schema table-name)
                                                               :where       (pk-where-clause pk)})]
    (println (u/pprint-to-str (list `jdbc/execute! connection-spec select-sql-args))) ; NOCOMMIT
    (let [[{:keys [row-count]}] (jdbc/query connection-spec select-sql-args)]
      (println "row-count:" row-count) ; NOCOMMIT
      (when (> row-count 1)
        (throw (ex-info (i18n/tru "Hey buddy this would delete {0} rows!!!" row-count)
                        {:sql select-sql-args})))
      )
    #_(println (u/pprint-to-str (list `jdbc/execute! connection-spec delete-sql-args))) ; NOCOMMIT
    #_(jdbc/execute! connection-spec delete-sql-args))
  ;; placeholder until we really implement it.
  )

#_(defmethod row-action! [:update ::driver/driver]
  [_action _driver {:keys [table-id pk values]}]
  {:update (db/select-one-field :name Table :id table-id)
   :set    values
   :where  (pk-where-clause pk)})

;; TODO -- should we do the conditions with this ???
#_(#'toucan.db/where {} {:id 1, :user_id [:> 2]})
#_{:where [:and [:= :id 1] [:> :user_id 2]]}
