(ns metabase.driver.mysql.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:mysql."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.actions.core :as actions]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-trun tru]]
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

(defn- remove-backticks [id]
  (when id
    (-> id
        (str/replace "``" "`")
        (str/replace #"^`?(.+?)`?$" "$1"))))

(defn- constraint->column-names
  "Given a constraint with `constraint-name` fetch the column names associated with that constraint."
  [database constraint-name]
  (let [jdbc-spec (sql-jdbc.conn/db->pooled-connection-spec (u/the-id database))
        sql-args  ["select table_catalog, table_schema, column_name from information_schema.key_column_usage where constraint_name = ?" constraint-name]]
    (first
     (reduce
      (fn [[columns catalog schema] {:keys [table_catalog table_schema column_name]}]
        (if (and (or (nil? catalog) (= table_catalog catalog))
                 (or (nil? schema) (= table_schema schema)))
          [(conj columns column_name) table_catalog table_schema]
          (do (log/warnf "Ambiguous catalog/schema for constraint %s in table"
                         constraint-name)
              (reduced nil))))
      [[] nil nil]
      (jdbc/reducible-query jdbc-spec sql-args {:identifers identity, :transaction? false})))))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions/violate-not-null-constraint]
  [_driver error-type _database _action-type error-message]
  (or
   (when-let [[_ column]
              (re-find #"Column '(.+)' cannot be null" error-message)]
     {:type    error-type
      :message (tru "{0} must have values." (str/capitalize column))
      :errors  {column (tru "You must provide a value.")}})
   (when-let [[_ column]
              (re-find #"Field '(.+)' doesn't have a default value" error-message)]
     {:type    error-type
      :message (tru "{0} must have values." (str/capitalize column))
      :errors  {column (tru "You must provide a value.")}})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions/violate-unique-constraint]
  [_driver error-type database _action-type error-message]
  (when-let [[_match constraint]
             (re-find #"Duplicate entry '.+' for key '(.+)'" error-message)]
    (let [constraint (last (str/split constraint #"\."))
          columns (constraint->column-names database constraint)]
      {:type    error-type
       :message (tru "{0} already {1}." (u/build-sentence (map str/capitalize columns) :stop? false) (deferred-trun "exists" "exist" (count columns)))
       :errors  (reduce (fn [acc col]
                          (assoc acc col (tru "This {0} value already exists." (str/capitalize col))))
                        {}
                        columns)})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions/violate-foreign-key-constraint]
  [_driver error-type _database action-type error-message]
  (or
   (when-let [[_match _ref-table _constraint _fkey-cols column _key-cols]
              (re-find #"Cannot delete or update a parent row: a foreign key constraint fails \((.+), CONSTRAINT (.+) FOREIGN KEY \((.+)\) REFERENCES (.+) \((.+)\)\)" error-message)]
     (merge {:type error-type}
            (case action-type
              :row/delete
              {:message (tru "Other tables rely on this row so it cannot be deleted.")
               :errors  {}}

              :row/update
              (let [column (remove-backticks column)]
                {:message (tru "Unable to update the record.")
                 :errors  {column (tru "This {0} does not exist." (str/capitalize column))}}))))
   (when-let [[_match _ref-table _constraint column _fk-table _fk-col]
              (re-find #"Cannot add or update a child row: a foreign key constraint fails \((.+), CONSTRAINT (.+) FOREIGN KEY \((.+)\) REFERENCES (.+) \((.+)\)\)" error-message)]
     (let [column (remove-backticks column)]
       {:type    error-type
        :message (case action-type
                   :row/create
                   (tru "Unable to create a new record.")

                   :row/update
                   (tru "Unable to update the record."))
        :errors  {(remove-backticks column) (tru "This {0} does not exist." (str/capitalize (remove-backticks column)))}}))))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions/incorrect-value-type]
  [_driver error-type _database _action-type error-message]
  (when-let [[_ expected-type _value _database _table column _row]
             (re-find #"Incorrect (.+?) value: '(.+)' for column (?:(.+)\.)??(?:(.+)\.)?(.+) at row (\d+)"  error-message)]
    (let [column (-> column (str/replace #"^'(.*)'$" "$1") remove-backticks)]
      {:type    error-type
       :message (tru "Some of your values aren’t of the correct type for the database.")
       :errors  {column (tru "This value should be of type {0}." (str/capitalize expected-type))}})))

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

(defn- select-created-row-sql-args
  [driver create-hsql pks insert-id]
  (let [where-clause (if insert-id
                       [:= (-> pks first keyword) insert-id]
                       (into [:and]
                             (for [[col val] (first (:values create-hsql))]
                               [:= (keyword col) val])))
        select-hsql  (-> create-hsql
                         (dissoc :insert-into :values)
                         (assoc :select [:*]
                                :from [(:insert-into create-hsql)]
                                :where where-clause))]
    (sql.qp/format-honeysql driver select-hsql)))

(defmethod sql-jdbc.actions/select-created-row :mysql
  [driver create-hsql conn {:strs [insert_id] :as results}]
  (let [jdbc-spec        {:connection conn}
        table-components (-> create-hsql :insert-into :components)
        pks              (primary-keys driver jdbc-spec table-components)
        select-sql-args  (select-created-row-sql-args driver create-hsql pks insert_id)
        query-results    (jdbc/query jdbc-spec
                           select-sql-args
                           {:identifiers identity, :transaction? false, :keywordize? false})]
    (if (next query-results)
      (log/warn "cannot identify row inserted by" create-hsql "using results" results)
      (first query-results))))
