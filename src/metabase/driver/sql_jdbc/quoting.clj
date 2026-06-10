(ns metabase.driver.sql-jdbc.quoting
  (:require
   [honey.sql :as sql]
   [metabase.driver.sql.query-processor :as sql.qp]))

(defmacro ^:private with-quoting
  "Helper macro for quoting identifiers."
  [driver & body]
  `(binding [sql/*dialect* (sql/get-dialect (sql.qp/quote-style ~driver))
             sql/*options* (assoc @#'sql/*options* :quoted true)]
     ~@body))

;;; TODO (Cam 2026-06-10) -- we should get rid of these and use [[metabase.util.honey-sql-2/identifier]] instead, since
;;; it ultimately serves the same purpose these do (making sure identifiers always get compiled as such, e.g. `%count`
;;; should get compiled to `"count"` rather than `count()` (which Honey SQL does depending on where you use things)
;;;
;;; I tried to make this switch but it looks like methods like [[metabase.driver/create-table!]] get called with table
;;; names like `schema.table-name` instead of passing schema and table name
;;; separately; [[metabase.util.honey-sql-2/identifier]] interprets this as a single identifier (`"schema.table"`)
;;; rather than a qualified identifier (`"schema"."table"`) like the functions below do. This is likely a source of
;;; bugs for table names that contain dots... I think the correct fix would be to pass schema and table name
;;; separately, but that will require reworking a lot of driver methods.

(defn quote-identifier
  "Quote an identifier, in case it looks like a function call."
  [driver ref]
  (with-quoting driver
    [:raw (sql/format-entity ref)]))

(defn quote-columns
  "Used to quote column names when building HoneySQL queries, in case they look like function calls."
  [driver columns]
  (with-quoting driver
    (map (partial quote-identifier driver) columns)))
