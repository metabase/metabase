(ns metabase.test.data.sql
  "Common test extension functionality for all SQL drivers."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql]
   [metabase.driver.sql.util :as sql.u]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test.data :as data]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.random :as u.random]))

(comment metabase.driver.sql/keep-me)

(driver/register! :sql/test-extensions, :abstract? true)

(tx/add-test-extensions! :sql/test-extensions)

(defn add-test-extensions! [driver]
  (driver/add-parent! driver :sql/test-extensions)
  (log/infof "Added SQL test extensions for %s ✏️" driver))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Interface (Identifier Names)                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti pk-field-name
  "Name of a the PK fields generated for our test datasets. Defaults to `\"id\"`."
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod pk-field-name :sql/test-extensions [_] "id")

;; TODO - WHAT ABOUT SCHEMA NAME???
;; Tech debt issue - #39356
(defmulti qualified-name-components
  "Return a vector of String names that can be used to refer to a Database, Table, or Field. This is provided so drivers
  have the opportunity to inject things like schema names or even modify the names themselves.

    (qualified-name-components [driver \"my-db\" \"my-table\"]) -> [\"my-db\" \"dbo\" \"my-table\"]

   By default, this qualifies field names with their table name, but otherwise does no other specific
  qualification."
  {:arglists '([driver database-name table-name? field-name?])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod qualified-name-components :sql/test-extensions
  ([_ db-name]                        [db-name])
  ([_ _db-name table-name]            [table-name])
  ([_ _db-name table-name field-name] [table-name field-name]))

(defn qualify-and-quote
  "Qualify names and combine into a single, quoted string. By default, this passes the results of
  [[qualified-name-components]] to [[metabase.test.data.interface/format-name]] and then
  to [[metabase.driver.sql.util/quote-name]].

    (qualify-and-quote [driver \"my-db\" \"my-table\"]) -> \"my-db\".\"dbo\".\"my-table\"

  You should only use this function in places where you are working directly with SQL. For HoneySQL forms, use
  [[metabase.util.honey-sql-2/identifier]] instead."
  {:arglists '([driver db-name] [driver db-name table-name] [driver db-name table-name field-name]), :style/indent 1}
  [driver & names]
  (let [identifier-type (condp = (count names)
                          1 :database
                          2 :table
                          :field)]
    (->> (apply qualified-name-components driver names)
         (map (partial ddl.i/format-name driver))
         (apply sql.u/quote-name driver identifier-type))))


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
      (qualify-and-quote driver database-name table-name field-name)
      field-comment)))

(defmulti inline-table-comment-sql
  "Return an inline `COMMENT` statement for a table."
  {:arglists '([driver comment])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod inline-table-comment-sql :sql/test-extensions [_ _] nil)

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
      (qualify-and-quote driver database-name table-name)
      table-comment)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Interface (DDL SQL Statements)                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti field-base-type->sql-type
  "Return a native SQL type that should be used for fields of `base-type`."
  {:arglists '([driver base-type])}
  (fn [driver base-type] [(tx/dispatch-on-driver-with-test-extensions driver) base-type])
  :hierarchy #'driver/hierarchy)

(defmethod field-base-type->sql-type :default
  [driver base-type]
  (or (some
       (fn [ancestor-type]
         (when-not (= ancestor-type :type/*)
           (when-let [method (get (methods field-base-type->sql-type) [driver ancestor-type])]
             (log/infof "No test data type mapping for driver %s for base type %s, falling back to ancestor base type %s"
                        driver base-type ancestor-type)
             (method driver base-type))))
       (ancestors base-type))
      (throw
       (Exception.
        (format "No test data type mapping for driver %s for base type %s; add an impl for field-base-type->sql-type."
                driver base-type)))))

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
  (format "CREATE DATABASE %s;" (qualify-and-quote driver database-name)))

(defmulti drop-db-if-exists-sql
  "Return a `DROP DATABASE` statement."
  {:arglists '([driver dbdef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod drop-db-if-exists-sql :sql/test-extensions [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s;" (qualify-and-quote driver database-name)))

(defmulti create-table-sql
  "Return a `CREATE TABLE` statement."
  {:arglists '([driver dbdef tabledef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti create-index-sql
  "Return a `CREATE INDEX` statement.
  `options` is a map. The supported keys are: unique?, method and condition"
  {:arglists '([driver table-name field-names]
               [driver table-name field-names options])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defn format-and-quote-field-name
  "Format and quote a field name."
  [driver field-name]
  (sql.u/quote-name driver :field (ddl.i/format-name driver field-name)))

(defmethod create-index-sql :sql/test-extensions
  ([driver table-name field-names]
   (create-index-sql driver table-name field-names {}))
  ([driver table-name field-names {:keys [unique? method condition]}]
   (format "CREATE %sINDEX %s ON %s%s (%s)%s;"
           (if unique? "UNIQUE " "")
           (format-and-quote-field-name driver (str "idx_" table-name "_" (str/join "_" field-names)))
           (qualify-and-quote driver table-name)
           (if method (str "USING " method) "")
           (str/join ", " (map #(format-and-quote-field-name driver %) field-names))
           (if condition (str " WHERE " condition) ""))))

(defn- field-definition-sql
  [driver {:keys [field-name base-type field-comment not-null? unique?], :as field-definition}]
  (let [field-name (format-and-quote-field-name driver field-name)
        field-type (or (cond
                         (and (map? base-type) (contains? base-type :native))
                         (:native base-type)

                         (and (map? base-type) (contains? base-type :natives))
                         (get-in base-type [:natives driver])

                         base-type
                         (field-base-type->sql-type driver base-type))
                       (throw (ex-info (format "Missing datatype for field %s for driver: %s"
                                               field-name driver)
                                       {:field  field-definition
                                        :driver driver})))
        not-null       (when not-null?
                         "NOT NULL")
        unique         (when unique?
                         "UNIQUE")
        inline-comment (inline-column-comment-sql driver field-comment)]
    (str/join " " (filter some? [field-name field-type not-null unique inline-comment]))))

(defn fielddefs->pk-field-names
  "Find the pk field names in fieldefs"
  [fieldefs]
  (->> fieldefs (filter :pk?) (map :field-name)))

(defmethod create-table-sql :sql/test-extensions
  [driver {:keys [database-name], :as _dbdef} {:keys [table-name field-definitions table-comment]}]
  (let [pk-field-names (->> (fielddefs->pk-field-names field-definitions)
                            (map (partial format-and-quote-field-name driver))
                            (str/join ", "))]
    (format "CREATE TABLE %s (%s, PRIMARY KEY (%s)) %s;"
            (qualify-and-quote driver database-name table-name)
            (str/join
             ", "
             (for [field-def field-definitions]
               (field-definition-sql driver field-def)))
            pk-field-names
            (or (inline-table-comment-sql driver table-comment) ""))))

(defmulti drop-table-if-exists-sql
  {:arglists '([driver dbdef tabledef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod drop-table-if-exists-sql :sql/test-extensions [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s;" (qualify-and-quote driver database-name table-name)))

(defn drop-table-if-exists-cascade-sql
  "Alternate implementation of `drop-table-if-exists-sql` that adds `CASCADE` to the statement for DBs that support it."
  [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s CASCADE;" (qualify-and-quote driver database-name table-name)))

(defmulti add-fk-sql
  "Return a `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` statement."
  {:arglists '([driver dbdef tabledef fielddef])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defn- get-tabledef
  [dbdef table-name]
  (->> dbdef
       :table-definitions
       (filter #(= (:table-name %) table-name))
       first))

(defmethod add-fk-sql :sql/test-extensions
  [driver {:keys [database-name] :as dbdef} {:keys [table-name]} {dest-table-name :fk, field-name :field-name}]
  (let [quot            #(sql.u/quote-name driver %1 (ddl.i/format-name driver %2))
        dest-table-name (name dest-table-name)
        pk-names        (->> (get-tabledef dbdef dest-table-name)
                             :field-definitions
                             fielddefs->pk-field-names)
        _ (when (< 1 (count pk-names))
            (throw (IllegalArgumentException. "`add-fk-sql` only works with tables with a single PK field")))
        pk-name             (first pk-names)]

    (format "ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s);"
            (qualify-and-quote driver database-name table-name)
            ;; limit FK constraint name to 30 chars since Oracle doesn't support names longer than that
            (let [fk-name (format "fk_%s_%s_%s_%s" database-name table-name field-name dest-table-name)
                  fk-name (if (> (count fk-name) 30)
                            (str/join (take-last 30 (str fk-name \_ (hash fk-name))))
                            fk-name)]
              (quot :constraint fk-name))
            (quot :field field-name)
            (qualify-and-quote driver database-name dest-table-name)
            (quot :field pk-name))))

(defmethod tx/count-with-template-tag-query :sql/test-extensions
  [driver table field _param-type]
  ;; generate a SQL query like SELECT count(*) ... WHERE last_login = 1
  ;; then replace 1 with a template tag like {{last_login}}
  (driver/with-driver driver
    (let [mbql-query      (data/mbql-query nil
                            {:source-table (data/id table)
                             :aggregation  [[:count]]
                             :filter       [:= [:field-id (data/id table field)] 1]})
          {:keys [query]} (qp.compile/compile mbql-query)
          ;; preserve stuff like cast(1 AS datetime) in the resulting query
          query           (str/replace query (re-pattern #"= (.*)(?:1)(.*)") (format "= $1{{%s}}$2" (name field)))]
      {:query query})))

(defmethod tx/count-with-field-filter-query :sql/test-extensions
  [driver table field]
  (driver/with-driver driver
    (let [mbql-query      (data/mbql-query nil
                            {:source-table (data/id table)
                             :aggregation  [[:count]]
                             :filter       [:= [:field-id (data/id table field)] 1]})
          {:keys [query]} (qp.compile/compile mbql-query)
          query           (str/replace query (re-pattern #"WHERE .* = .*") (format "WHERE {{%s}}" (name field)))]
      {:query query})))

(defmulti session-schema
  "Return the unquoted schema name for the current test session, if any. This can be used in test code that needs
  to use the schema to create tables outside the regular test data setup. Test code that uses this should assume that
  the schema is already created during initialization, and that the tables inside it will be cleaned up between test
  runs in CI. Returns nil by default if there is no session schema, or the database doesn't support schemas.
  For non-cloud drivers, this is typically the default schema that the driver uses when no schema is specified."
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod session-schema :sql/test-extensions [_] nil)

(defmethod tx/native-query-with-card-template-tag :sql
  [_driver card-template-tag-name]
  (let [source-table-name (u/lower-case-en (u.random/random-name))]
    (format "SELECT * FROM {{%s}} %s" card-template-tag-name source-table-name)))
