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

(defn- remove-backticks [id]
  (when id
    (-> id
        (str/replace "``" "`")
        (str/replace #"^`?(.+?)`?$" "$1"))))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/violate-not-null-constraint]
  [_driver error-type _database error-message]
  (when-let [[_ col]
             (re-find #"Column '(.+)' cannot be null" error-message)]
    {:type    error-type
     :message (tru "violates not-null constraint")
     :columns [col]}))

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

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/violate-unique-constraint]
  [_driver error-type database error-message]
  (let [[match table constraint]
        (re-find #"Duplicate entry '.+' for key '(.+)\.(.+)'" error-message)
        constraint (remove-backticks constraint)
        table (remove-backticks table)]
    (when match
      {:type    error-type
       :columns (constraint->column-names database table constraint)})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/violate-foreign-key-constraint]
  [_driver error-type _database error-message]
  (let [[match table _constraint _fkey-cols ref-table key-cols]
        (re-find #"Cannot delete or update a parent row: a foreign key constraint fails \((.+), CONSTRAINT (.+) FOREIGN KEY \((.+)\) REFERENCES (.+) \((.+)\)\)" error-message)
        ref-table  (remove-backticks ref-table)]
    (when match
      {:type       error-type
       :ref-table  ref-table
       :columns    (map remove-backticks (str/split key-cols #", "))})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/incorrect-value-type]
  [_driver error-type _database error-message]
  (when-let [[_ expected-type _value database table column _row]
             (re-find #"Incorrect (.+?) value: '(.+)' for column (?:(.+)\.)??(?:(.+)\.)?(.+) at row (\d+)" error-message)]
    (cond-> {:type          error-type
             :columns       [(-> column
                                 (str/replace #"^'(.*)'$" "$1")
                                 remove-backticks)]
             :expected-type expected-type}
      table    (assoc :table (remove-backticks table))
      database (assoc :database (remove-backticks database)))))

(comment
  (maybe-parse-fk-constraint-error nil "Cannot delete or update a parent row: a foreign key constraint fails (`food`.`y`, CONSTRAINT `y_ibfk_1` FOREIGN KEY (`x_id1`, `x_id2`) REFERENCES `x` (`id1`, `id2`))")
  (maybe-parse-unique-constraint-error {:id 1} "(conn=10) Duplicate entry 'ID' for key 'string_pk.PRIMARY'")
  (maybe-parse-not-null-error nil "Column 'f1' cannot be null")
  (maybe-parse-incorrect-type nil "Incorrect integer value: 'not boolean' for column `G__168815`.`types`.`boolean` at row 1")
  (sql-jdbc.actions/maybe-parse-sql-error :mysql :incorrect-type  nil "(conn=183) Incorrect integer value: 'STRING' for column 'id' at row 1")
  (maybe-parse-incorrect-type nil "(conn=183) Incorrect integer value: 'STRING' for column `table`.`id` at row 1")
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
