(ns metabase.test.data.sql
  "Common test extension functionality for all SQL drivers."
  (:require [clojure.string :as s]
            [honeysql.format :as h.format]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.test.data.interface :as tx]
            [metabase.util.honeysql-extensions :as hx])
  (:import metabase.test.data.interface.FieldDefinition))

(driver/register! :sql/test-extensions, :abstract? true)

(tx/add-test-extensions! :sql/test-extensions)

(defn add-test-extensions! [driver]
  (driver/add-parent! driver :sql/test-extensions)
  (println "Added SQL test extensions for" driver "✏️"))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Interface (Identifier Names)                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti prepare-identifier
  "Prepare a string identifier, such as a Table or Field name, when it is used in a SQL query. This is used by drivers
  like H2 to transform names to upper-case. This method should return a String. The default implementation is
  `identity`."
  {:arglists '([driver s])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod prepare-identifier :sql/test-extensions [_ s] s)


(defmulti pk-field-name
  "Name of a the PK fields generated for our test datasets. Defaults to `\"id\"`."
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod pk-field-name :sql/test-extensions [_] "id")


;; TODO - WHAT ABOUT SCHEMA NAME???
(defmulti qualified-name-components
  "Return a vector of String names that can be used to refer to a Database, Table, or Field. This is provided so drivers
  have the opportunity to inject things like schema names or even modify the names themselves.

    (qualified-name-components [driver \"my-db\" \"my-table\"]) -> [\"my-db\" \"dbo\" \"my-table\"]

   By default, this qualifies field names with their table name, but otherwise does no other specific
  qualification."
  {:arglists '([driver database-name? table-name? field-name?])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod qualified-name-components :sql/test-extensions
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [table-name])
  ([_ db-name table-name field-name] [table-name field-name]))


(defn quote-name
  "Quote an unqualified string or keyword identifier using `driver`'s implementation of `prepare-identifier` and its
  `quote-style`.

    (quote-name :mysql \"wow\") ; -> \"`wow`\"
    (quote-name :h2 \"wow\")    ; -> \"\\\"WOW\\\"\""
  [driver identifier]
  (as-> identifier <>
    (u/keyword->qualified-name <>)
    (prepare-identifier driver <>)
    (hx/escape-dots <>)
    (binding [h.format/*allow-dashed-names?* true]
      (h.format/quote-identifier <> :style (sql.qp/quote-style driver)))
    (hx/unescape-dots <>)))


;; TODO - what about schemas?
(defmulti qualify+quote-name
  "Qualify names and combine into a single, quoted name. By default, this combines the results of
  `qualified-name-components`and `quote-name`.

    (qualify+quote-name [driver \"my-db\" \"my-table\"]) -> \"my-db\".\"dbo\".\"my-table\""
  {:arglists '([driver database-name table-name? field-name?])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defn- quote+combine-names [driver names]
  (s/join \. (for [n names]
               (name (hx/qualify-and-escape-dots (quote-name driver n))))))

(defmethod qualify+quote-name :sql/test-extensions
  ([driver db-name]
   (quote+combine-names driver (qualified-name-components driver db-name)))
  ([driver db-name table-name]
   (quote+combine-names driver (qualified-name-components driver db-name table-name)))
  ([driver db-name table-name field-name]
   (quote+combine-names driver (qualified-name-components driver db-name table-name field-name))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Interface (Comments)                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; By default, the comment multimethods below return `nil`, and comment-related functionality, such as saving comments
;; as descriptions during sync, is not tested. Opt-in to testing by implementing one or more of these methods. Default
;; implementations are provided below by the functions prefixed by `standard-`.

(defmulti inline-column-comment-sql
  "Return an inline `COMMENT` statement for a column."
  {:arglists '([driver comment])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod inline-column-comment-sql :sql/test-extensions [_ _] nil)

(defn standard-inline-column-comment-sql
  "Implementation of `inline-column-comment-sql` for driver test extensions that wish to use it."
  [_ field-comment]
  (when (seq field-comment)
    (format "COMMENT '%s'" field-comment)))


(defmulti standalone-column-comment-sql
  "Return standalone `COMMENT` statement for a column."
  {:arglists '([driver dbdef tabledef fielddef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod standalone-column-comment-sql :sql/test-extensions [_ _ _ _] nil)

(defn standard-standalone-column-comment-sql
  "Implementation of `standalone-column-comment-sql` for driver test extensions that wish to use it."
  [driver {:keys [database-name]} {:keys [table-name]} {:keys [field-name field-comment]}]
  (when (seq field-comment)
    (format "COMMENT ON COLUMN %s IS '%s';"
      (qualify+quote-name driver database-name table-name field-name)
      field-comment)))


(defmulti inline-table-comment-sql
  "Return an inline `COMMENT` statement for a table."
  {:arglists '([driver comment])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod inline-table-comment-sql :sql/test-extensions [_ _] nil)

(defn standard-inline-table-comment-sql
  "Implementation of `inline-table-comment-sql` for driver test extenstions that wish to use it."
  [_ table-comment]
  (when (seq table-comment)
    (format "COMMENT '%s'" table-comment)))


(defmulti standalone-table-comment-sql
  "Return standalone `COMMENT` statement for a table."
  {:arglists '([driver dbdef tabledef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod standalone-table-comment-sql :sql/test-extensions [_ _ _] nil)

(defn standard-standalone-table-comment-sql
  "Implementation of `standalone-table-comment-sql` for driver test extenstions that wish to use it."
  [driver {:keys [database-name]} {:keys [table-name table-comment]}]
  (when (seq table-comment)
    (format "COMMENT ON TABLE %s IS '%s';"
      (qualify+quote-name driver database-name table-name)
      table-comment)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Interface (DDL SQL Statements)                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti field-base-type->sql-type
  "Return a native SQL type that should be used for fields of BASE-TYPE."
  {:arglists '([driver base-type])}
  (fn [driver base-type] [(tx/dispatch-on-driver-with-test-extensions driver) base-type])
  :hierarchy #'driver/hierarchy)


(defmulti pk-sql-type
  "SQL type of a primary key field."
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)


(defmulti create-db-sql
  "Return a `CREATE DATABASE` statement."
  {:arglists '([driver dbdef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod create-db-sql :sql/test-extensions [driver {:keys [database-name]}]
  (format "CREATE DATABASE %s;" (qualify+quote-name driver database-name)))


(defmulti drop-db-if-exists-sql
  "Return a `DROP DATABASE` statement."
  {:arglists '([driver dbdef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod drop-db-if-exists-sql :sql/test-extensions [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s;" (qualify+quote-name driver database-name)))


(defmulti create-table-sql
  "Return a `CREATE TABLE` statement."
  {:arglists '([driver dbdef tabledef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod create-table-sql :sql/test-extensions
  [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions table-comment]}]
  (let [quot          (partial quote-name driver)
        pk-field-name (quot (pk-field-name driver))]
    (format "CREATE TABLE %s (%s, %s %s, PRIMARY KEY (%s)) %s;"
            (qualify+quote-name driver database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type field-comment]}]
                        (format "%s %s %s"
                                (quot field-name)
                                (if (map? base-type)
                                  (:native base-type)
                                  (field-base-type->sql-type driver base-type))
                                (or (inline-column-comment-sql driver field-comment) ""))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (pk-sql-type driver)
            pk-field-name
            (or (inline-table-comment-sql driver table-comment) ""))))


(defmulti drop-table-if-exists-sql
  {:arglists '([driver dbdef tabledef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod drop-table-if-exists-sql :sql/test-extensions [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s;" (qualify+quote-name driver database-name table-name)))

(defn drop-table-if-exists-cascade-sql
  "Alternate implementation of `drop-table-if-exists-sql` that adds `CASCADE` to the statement for DBs that support it."
  [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s CASCADE;" (qualify+quote-name driver database-name table-name)))


(defmulti add-fk-sql
  "Return a `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` statement."
  {:arglists '([driver dbdef tabledef, ^FieldDefinition fielddef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod add-fk-sql :sql/test-extensions
  [driver {:keys [database-name]} {:keys [table-name]} {dest-table-name :fk, field-name :field-name}]
  (let [quot            (partial quote-name driver)
        dest-table-name (name dest-table-name)]
    (format "ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s);"
            (qualify+quote-name driver database-name table-name)
            ;; limit FK constraint name to 30 chars since Oracle doesn't support names longer than that
            (quot (apply str (take 30 (format "fk_%s_%s_%s" table-name field-name dest-table-name))))
            (quot field-name)
            (qualify+quote-name driver database-name dest-table-name)
            (quot (pk-field-name driver)))))
