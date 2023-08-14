(ns metabase.driver.mysql.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:mysql."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.actions.error :as actions.error]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

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

(defn- remove-backticks [id]
  (when id
    (-> id
        (str/replace "``" "`")
        (str/replace #"^`?(.+?)`?$" "$1"))))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/violate-not-null-constraint]
  [_driver error-type _database error-message]
  (when-let [[_ column]
             (re-find #"Column '(.+)' cannot be null" error-message)]
    {:type    error-type
     :message (tru "Value for column {0} must be not null" column)
     :errors  {column (tru "The value must be not null")}}))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/violate-unique-constraint]
  [_driver error-type database error-message]
  (when-let [[_match table constraint]
             (re-find #"Duplicate entry '.+' for key '(.+)\.(.+)'" error-message)]
    (let [constraint (remove-backticks constraint)
          table      (remove-backticks table)
          columns    (constraint->column-names database table constraint)]
      {:type    error-type
       :message (tru "Value for column(s) {0} is duplicated" (str/join ", " columns))
       :errors  (reduce (fn [acc col]
                          (assoc acc col (tru "This column has unique constraint and this value is existed")))
                        {}
                        columns)})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/violate-foreign-key-constraint]
  [_driver error-type _database error-message]
  (when-let [[_match ref-table _constraint _fkey-cols _table key-cols]
             (re-find #"Cannot delete or update a parent row: a foreign key constraint fails \((.+), CONSTRAINT (.+) FOREIGN KEY \((.+)\) REFERENCES (.+) \((.+)\)\)" error-message)]
    (let [ref-table  (-> ref-table (str/split #"\.") last remove-backticks)
          columns    (map remove-backticks (str/split key-cols #", "))]
      {:type       error-type
       :message (tru "Column(s) {0} is referenced from {1} table" (str/join ", " columns) ref-table)
       :errors  (reduce (fn [acc col]
                          (assoc acc col (tru "The value is referenced from {0} table" ref-table)))
                        {}
                        columns)})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/incorrect-value-type]
  [_driver error-type _database error-message]
  (when-let [[_ expected-type _value _database _table column _row]
             (re-find #"Incorrect (.+?) value: '(.+)' for column (?:(.+)\.)??(?:(.+)\.)?(.+) at row (\d+)"  error-message)]
    (let [column (-> column (str/replace #"^'(.*)'$" "$1") remove-backticks)]
      {:type    error-type
       :message (tru "Value for column {0} should be of type {1}" column expected-type)
       :errors  {column (tru "The value should be of type {0}" expected-type)}})))

(comment
  (sql-jdbc.actions/maybe-parse-sql-error :mysql actions.error/violate-foreign-key-constraint nil
                                          "(conn=21) Cannot delete or update a parent row: a foreign key constraint fails (`action-error-handling`.`user`, CONSTRAINT `user_group-id_group_-159406530` FOREIGN KEY (`group-id`) REFERENCES `group` (`id`))")
  (sql-jdbc.actions/maybe-parse-sql-error :mysql actions.error/violate-unique-constraint {:id 3}
                                          "(conn=10) Duplicate entry 'ID' for key 'string_pk.PRIMARY'")
  (sql-jdbc.actions/maybe-parse-sql-error :mysql actions.error/violate-not-null-constraint nil
                                          "Column 'f1' cannot be null")
  (sql-jdbc.actions/maybe-parse-sql-error :mysql actions.error/incorrect-value-type nil
                                          "(conn=183) Incorrect integer value: 'STRING' for column `table`.`id` at row 1")
  nil)

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

;;; MySQL doesn't need to do anything special with nested transactions; the
;;; original transaction can proceed even if some specific statement errored.
(defmethod sql-jdbc.actions/do-nested-transaction :mysql
  [_driver _conn thunk]
  (thunk))

(defn- primary-keys [driver jdbc-spec table-components]
  (let [schema (when (next table-components) (first table-components))
        table  (last table-components)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     jdbc-spec
     nil
     (fn [^java.sql.Connection conn]
       (let [metadata (.getMetaData conn)]
         (with-open [rset (.getPrimaryKeys metadata nil schema table)]
           (loop [acc []]
             (if-not (.next rset)
               acc
               (recur (conj acc (.getString rset "COLUMN_NAME")))))))))))

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
  (let [jdbc-spec {:connection conn}
        table-components (-> create-hsql :insert-into :components)
        pks (primary-keys driver jdbc-spec table-components)
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
        query-results (jdbc/query jdbc-spec
                                  select-sql-args
                                  {:identifiers identity, :transaction? false})]
    (if (next query-results)
      (log/warn "cannot identify row inserted by" create-hsql "using results" results)
      (first query-results))))
