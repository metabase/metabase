(ns metabase.driver.thing
  "Security-lint test example: a driver, where raw SQL splices, hand-rolled quoting and the shared connection
  checks live."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]))

;; a keyword's name spliced as text -- the :datetime-add hole (a local named `unit` is the MBQL enum; a `kind` is not)
(defmethod sql.qp/add-interval-honeysql-form :thing
  [_driver hsql-form amount kind]
  [:dateadd [:raw (name kind)] [:inline amount] hsql-form])

;; an identifier quoted by wrapping it in backticks
(defn- quote-name [s] (str "`" s "`"))

;; DDL built from an unquoted target name, reached from a transform run
(defmethod driver/drop-table! :thing
  [_driver _db-id table-name]
  (format "DROP TABLE %s" table-name))

;; the shared JDBC property denylist is dropped by an override that never runs the parent
(defmethod driver/validate-db-details! :thing
  [_driver details]
  (when (:bad details) (throw (Exception. "no"))))

;; a table name the warehouse reported, spliced into the next statement -- the field-values sync hole
(defmethod driver/describe-table :thing
  [_driver _database table]
  {:name (:name table) :fields #{}})

(defn- count-rows [driver database spec table]
  (let [described (driver/describe-table driver database table)]
    (jdbc/query spec (format "SELECT count(*) FROM %s" (:name described)))))
