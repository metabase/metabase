(ns metabase.driver.sql-jdbc.quoting
  (:require
   [honey.sql :as sql]
   [metabase.driver.sql.query-processor :as sql.qp]))

(defmacro with-quoting
  "Helper macro for quoting identifiers."
  [driver & body]
  `(binding [sql/*dialect* (sql/get-dialect (sql.qp/quote-style ~driver))
             sql/*options* (assoc @#'sql/*options* :quoted true)]
     ~@body))

(defn dot-qualified
  "Rewrite a schema-qualified keyword so the whole dotted path lives in its name: `:schema/tbl` -> `:schema.tbl`.
  Takes a keyword or a dot-qualified string; returns a keyword."
  [table-name]
  ;; not (keyword table-name) straight through: HoneySQL munges dashes to underscores in a
  ;; keyword's namespace but not in its name, so a catalog named `test-data` would reach the
  ;; database as `test_data`.
  (let [kw (keyword table-name)]
    (keyword (if-let [schema (namespace kw)]
               (str schema "." (name kw))
               (name kw)))))

(defn quote-table
  "Protect against a table being interpreted as a function call."
  [table-name]
  (keyword (str "'" (sql/format-entity (dot-qualified table-name)))))

(defn quote-identifier
  "Quote an identifier, in case it looks like a function call."
  [ref]
  [:raw (sql/format-entity ref)])

(defn quote-columns
  "Used to quote column names when building HoneySQL queries, in case they look like function calls."
  [driver columns]
  (with-quoting driver
    (map quote-identifier columns)))
