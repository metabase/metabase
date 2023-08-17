(ns metabase.driver.mysql.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:mysql."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.actions.error :as actions.error]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
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

(defn- remove-backticks [id]
  (when id
    (-> id
        (str/replace "``" "`")
        (str/replace #"^`?(.+?)`?$" "$1"))))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/violate-not-null-constraint]
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

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/violate-unique-constraint]
  [_driver error-type _database _action-type error-message]
  (when-let [[_match fk]
             (re-find #"Duplicate entry '.+' for key '(.+)'" error-message)]
    (let [column (last (str/split fk #"\."))]
      {:type    error-type
       :message (tru "{0} already exists." (str/capitalize column))
       :errors  {column (tru "This {0} value already exists." (str/capitalize column))}})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/violate-foreign-key-constraint]
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
                 {:message (tru "Unable to update the record.")
                  :errors  {column (tru "This {0} does not exist." (str/capitalize column))}})))
   (when-let [[_match _ref-table _constraint column _fk-table _fk-col]
              (re-find #"Cannot add or update a child row: a foreign key constraint fails \((.+), CONSTRAINT (.+) FOREIGN KEY \((.+)\) REFERENCES (.+) \((.+)\)\)" error-message)]
     {:type    error-type
      :message (case action-type
                 :row/create
                 (tru "Unable to create a new record.")

                 :row/update
                 (tru "Unable to update the record."))
      :errors  {(remove-backticks column) (tru "This {0} does not exist." (str/capitalize (remove-backticks column)))}})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:mysql actions.error/incorrect-value-type]
  [_driver error-type _database _action-type error-message]
  (when-let [[_ expected-type _value _database _table column _row]
             (re-find #"Incorrect (.+?) value: '(.+)' for column (?:(.+)\.)??(?:(.+)\.)?(.+) at row (\d+)"  error-message)]
    (let [column (-> column (str/replace #"^'(.*)'$" "$1") remove-backticks)]
      {:type    error-type
       :message (tru "Some of your values aren’t of the correct type for the database.")
       :errors  {column (tru "This value should be of type {0}." (str/capitalize expected-type))}})))

(comment
  (sql-jdbc.actions/maybe-parse-sql-error :mysql actions.error/violate-foreign-key-constraint nil nil
                                          "(conn=21) Cannot delete or update a parent row: a foreign key constraint fails (`action-error-handling`.`user`, CONSTRAINT `user_group-id_group_-159406530` FOREIGN KEY (`group-id`) REFERENCES `group` (`id`))")

  (sql-jdbc.actions/maybe-parse-sql-error :mysql actions.error/violate-foreign-key-constraint nil nil
                                          "(conn=45) Cannot add or update a child row: a foreign key constraint fails (`action-error-handling`.`user`, CONSTRAINT `user_group-id_group_-159406530` FOREIGN KEY (`group-id`) REFERENCES `group` (`id`))")
  (sql-jdbc.actions/maybe-parse-sql-error :mysql actions.error/violate-unique-constraint {:id 3} nil
                                          "(conn=10) Duplicate entry 'ID' for key 'string_pk.PRIMARY'")
  (sql-jdbc.actions/maybe-parse-sql-error :mysql actions.error/violate-not-null-constraint nil nil
                                          "Column 'f1' cannot be null")
  (sql-jdbc.actions/maybe-parse-sql-error :mysql actions.error/incorrect-value-type nil nil
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
