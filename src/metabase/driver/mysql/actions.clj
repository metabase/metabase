(ns metabase.driver.mysql.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:mysql"
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(defn- remove-backticks [id]
  (when id
    (-> id
        (str/replace "``" "`")
        (str/replace #"^`?(.+?)`?$" "$1"))))

(defn- maybe-parse-not-null-error [_database error-message]
  (when-let [[_ col]
             (re-find #"Column '(.+)' cannot be null" error-message)]
    [{:message (tru "violates not-null constraint")
      :column  col}]))

;;; TODO -- we should probably be TTL caching this information. Otherwise
;;; parsing 100 errors for a bulk action will result in 100 identical data
;;; warehouse queries. It's not like constraint columns are something we would
;;; expect to change regularly anyway. (See the twin function in namespace
;;; metabase.driver.postgres.actions.)
;;;
;;; In the error message we have no information about catalog and schema, so we
;;; do the query with the information we have and check if the result is unique.
;;; If it's not, we log a warning and signal that we couldn't find the columns
;;; names.
(defn- constraint->column-names
  "Given a constraint with `constraint-name` fetch the column names associated with that constraint."
  [database table-name constraint-name]
  (let [jdbc-spec (sql-jdbc.conn/db->pooled-connection-spec (u/the-id database))
        sql-args  ["select table_catalog, table_schema, column_name from information_schema.key_column_usage where table_name = ? and constraint_name = ?" table-name constraint-name]]
    (first
     (reduce
      (fn [[columns catalog schema] {:keys [table_catalog table_schema column_name]}]
        (if (and (or (nil? catalog) (= table_catalog catalog))
                 (or (nil? schema) (= table_schema schema)))
          [(conj columns column_name) table_catalog table_schema]
          (do (log/warnf "Ambiguous catalog/schema for constraint %s in table %s"
                         constraint-name table-name)
              (reduced nil))))
      [[] nil nil]
      (jdbc/reducible-query jdbc-spec sql-args {:identifers identity, :transaction? false})))))

(defn- maybe-parse-unique-constraint-error [database error-message]
  (let [[match table constraint]
        (re-find #"Duplicate entry '.+' for key '(.+)\.(.+)'" error-message)
        constraint (remove-backticks constraint)
        table (remove-backticks table)]
    (when match
      (some->> (constraint->column-names database table constraint)
               (mapv (fn [col]
                       {:message    (tru "violates unique constraint {0}" constraint)
                        :table      table
                        :constraint constraint
                        :column     col}))))))

(defn- maybe-parse-fk-constraint-error [database error-message]
  (let [[match table constraint fkey-cols ref-table key-cols]
        (re-find #"Cannot delete or update a parent row: a foreign key constraint fails \((.+), CONSTRAINT (.+) FOREIGN KEY \((.+)\) REFERENCES (.+) \((.+)\)\)" error-message)
        constraint (remove-backticks constraint)
        table (remove-backticks table)
        ref-table (remove-backticks ref-table)]
    (when match
      (mapv
       (fn [fkey-col key-col]
         {:message     (tru "violates foreign key constraint {0}" constraint)
          :table       table
          :ref-table   ref-table
          :constraint  constraint
          :foreign-key (remove-backticks fkey-col)
          :column      (remove-backticks key-col)})
       (str/split fkey-cols #", ")
       (str/split key-cols #", ")))))

(comment
  (let [error-message "Cannot delete or update a parent row: a foreign key constraint fails (`food`.`y`, CONSTRAINT `y_ibfk_1` FOREIGN KEY (`x_id1`, `x_id2`) REFERENCES `x` (`id1`, `id2`))"]
    (re-find #"Cannot delete or update a parent row: a foreign key constraint fails \((.+), CONSTRAINT (.+) FOREIGN KEY \((.+)\) REFERENCES (.+) \((.+)\)\)" error-message))
  (maybe-parse-unique-constraint-error {:id 480} "(conn=10) Duplicate entry 'ID' for key 'string_pk.PRIMARY'")
  (maybe-parse-not-null-error nil "Column 'f1' cannot be null")
  nil)

(defmethod sql-jdbc.actions/parse-sql-error :mysql
  [_driver database message]
  (tap> [:parse-sql-error message])
  (some #(% database message)
        [maybe-parse-not-null-error
         maybe-parse-unique-constraint-error
         maybe-parse-fk-constraint-error]))

;;; There is a huge discrepancy between the types used in DDL statements and
;;; types that can be used in CAST:
;;; cf https://dev.mysql.com/doc/refman/8.0/en/data-types.html
;;; et https://dev.mysql.com/doc/refman/5.7/en/data-types.html
;;; vs https://dev.mysql.com/doc/refman/5.7/en/cast-functions.html#function_cast
;;; et https://dev.mysql.com/doc/refman/8.0/en/cast-functions.html#function_cast
(defmethod sql-jdbc.actions/base-type->sql-type-map :mysql
  [_driver]
  {:type/Date           "DATE"
   ;; (3) is fractional seconds precision, i.e. millisecond precision
   :type/DateTime       "DATETIME(3)"
   :type/DateTimeWithTZ "DATETIME(3)"
   :type/JSON           "JSON"
   :type/Time           "TIME(3)"})

;;; For MySQL creating a Savepoint and rolling back to it on error seems to be
;;; enough to let the parent transaction proceed if some particular statement
;;; encounters an error.
(defmethod sql-jdbc.actions/do-nested-transaction :mysql
  [_driver ^java.sql.Connection conn thunk]
  (let [savepoint (.setSavepoint conn)]
    (try
      (thunk)
      (catch Throwable e
        (.rollback conn savepoint)
        (throw e))
      (finally
        (.releaseSavepoint conn savepoint)))))

(defn- get-primary-keys [db-spec table-components]
  (let [schema (when (next table-components) (first table-components))
        table (last table-components)]
    (jdbc/with-db-metadata [md db-spec]
      (->> (.getPrimaryKeys md nil schema table)
           jdbc/metadata-result
           (mapv :column_name)))))

;;; MySQL returns the generated ID (of which cannot be more than one)
;;; as insert_id. If this is not null, we determine the name of the
;;; primary key and query the corresponding record. If the table has
;;; no auto_increment primary key, then we make a query with the
;;; values inserted in order to get the default values. If the table
;;; has no primary key and this query returns multiple rows, then we
;;; cannot know which one resulted from this insert, so we log a
;;; warning and return nil.
(defmethod sql-jdbc.actions/select-created-row :mysql
  [driver create-hsql conn {:keys [insert_id] :as results}]
  (let [db-spec {:connection conn}
        table-components (-> create-hsql :insert-into :components)
        pks (get-primary-keys db-spec table-components)
        where-clause (if insert_id
                       [:= (-> pks first keyword) insert_id]
                       (into [:and]
                             (for [[col val] (:insert-into create-hsql)]
                               [:= (keyword col) val])))
        select-hsql (-> create-hsql
                        (dissoc :insert-into :values)
                        (assoc :select [:*]
                               :from [(:insert-into create-hsql)]
                               :where where-clause))
        select-sql-args (sql.qp/format-honeysql driver select-hsql)
        query-results (jdbc/query db-spec
                                  select-sql-args
                                  {:identifiers identity, :transaction? false})]
    (if (next query-results)
      (log/warn "cannot identify row inserted by" create-hsql "using results" results)
      (first query-results))))
