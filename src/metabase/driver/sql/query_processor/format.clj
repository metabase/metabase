(ns metabase.driver.sql.query-processor.format
  "Compiling a Honey SQL form to a SQL string for a driver.

  Drivers implement these as [[metabase.driver.sql.query-processor]] vars; that namespace re-exports them. They live
  here because [[metabase.driver.sql.util/quote-name]] needs [[format-honeysql]], and `sql.util` is in turn used
  by [[metabase.query-processor.util.persisted-cache]], which [[metabase.driver.sql.query-processor]] requires."
  (:require
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmulti quote-style
  "Return the dialect that should be used by Honey SQL 2 when building a SQL statement. Defaults to `:ansi`, but other
  valid options are `:mysql`, `:sqlserver`, `:oracle`, and `:h2` (added in
  [[metabase.util.honey-sql-2]]; like `:ansi`, but uppercases the result). Check [[honey.sql/dialects]] for all
  available dialects, or register a custom one with [[honey.sql/register-dialect!]].

    (honey.sql/format ... :quoting (quote-style driver), :allow-dashed-names? true)

  (The name of this method reflects Honey SQL 1 terminology, where \"dialect\" was called \"quote style\". To avoid
  needless churn, I haven't changed it yet. -- Cam)"
  {:added "0.32.0" :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod quote-style :sql [_] :ansi)

(defn- format-honeysql-2 [driver dialect honeysql-form]
  ;; make sure [[driver/*driver*]] is bound, we need it for [[sqlize-value]]
  (binding [driver/*driver* driver]
    (sql/format honeysql-form {:dialect      dialect
                               :quoted       true
                               :quoted-snake false
                               :inline       driver/*compile-with-inline-parameters*
                               ;; Enable :nested when we want to compile just one particular snippet.
                               :nested (not (map? honeysql-form))})))

(defmulti format-honeysql
  "Compile `honeysql-form` to a `[sql & args]` vector. Prior to 0.51.0, this was a plain function, but was made a
  multimethod in 0.51.0 to support drivers that need to always
  specify [[metabase.driver/*compile-with-inline-parameters*]]."
  {:arglists '([driver honeysql-form]), :added "0.51.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod format-honeysql :sql
  [driver honeysql-form]
  (let [dialect (quote-style driver)]
    (try
      (format-honeysql-2 driver dialect honeysql-form)
      (catch Throwable e
        (try
          (log/error (u/format-color :red "Invalid HoneySQL form: %s" (ex-message e)))
          (finally
            (throw (ex-info (tru "Error compiling HoneySQL form: {0}" (ex-message e))
                            {:dialect dialect
                             :form    honeysql-form
                             :type    qp.error-type/driver}
                            e))))))))
