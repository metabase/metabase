(ns metabase.test.data.sql
  "Common test extension functionality for all SQL drivers."
  (:require
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql.util :as sql.u]
   [metabase.query-processor :as qp]
   [metabase.test.data :as data]
   [metabase.test.data.interface :as tx]))

(driver/register! :sql/test-extensions, :abstract? true)

(tx/add-test-extensions! :sql/test-extensions)

(defn add-test-extensions! [driver]
  (driver/add-parent! driver :sql/test-extensions)
  (log/infof "Added SQL test extensions for %s ✏️" driver))

;; TODO - WHAT ABOUT SCHEMA NAME???
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
  [[metabase.util.honeysql-extensions/identifier]] instead."
  {:arglists '([driver db-name] [driver db-name table-name] [driver db-name table-name field-name]), :style/indent 1}
  [driver & names]
  (let [identifier-type (condp = (count names)
                          1 :database
                          2 :table
                          :field)]
    (->> (apply qualified-name-components driver names)
         (map (partial ddl.i/format-name driver))
         (apply sql.u/quote-name driver identifier-type))))

(defmulti ^:deprecated field-base-type->sql-type
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

(defmethod tx/count-with-template-tag-query :sql/test-extensions
  [driver table field _param-type]
  ;; generate a SQL query like SELECT count(*) ... WHERE last_login = 1
  ;; then replace 1 with a template tag like {{last_login}}
  (driver/with-driver driver
    (let [mbql-query      (data/mbql-query nil
                            {:source-table (data/id table)
                             :aggregation  [[:count]]
                             :filter       [:= [:field-id (data/id table field)] 1]})
          {:keys [query]} (qp/compile mbql-query)
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
          {:keys [query]} (qp/compile mbql-query)
          query           (str/replace query (re-pattern #"WHERE .* = .*") (format "WHERE {{%s}}" (name field)))]
      {:query query})))
