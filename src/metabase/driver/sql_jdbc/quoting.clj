(ns metabase.driver.sql-jdbc.quoting
  (:require
   [honey.sql :as sql]
   [metabase.driver.sql.query-processor :as sql.qp]))

(defmacro with-quoting
  "Helper macro for quoting identifiers."
  [driver & body]
  `(binding [sql/*dialect* (sql/get-dialect (sql.qp/quote-style ~driver))
             sql/*quoted*  true]
     ~@body))

(defn quote-table
  "Protect against a table being interpreted as a function call."
  [table-name]
  (keyword (str "'" (sql/format-entity (keyword table-name)))))

(defn quote-identifier
  "Quote an identifier, in case it looks like a function call."
  [ref]
  [:raw (sql/format-entity ref)])

(defn quote-columns
  "Used to quote column names when building HoneySQL queries, in case they look like function calls."
  [driver columns]
  (with-quoting driver
    (map quote-identifier columns)))
