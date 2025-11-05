(ns metabase.app-db.format
  (:require
   [metabase.app-db.connection :as app-db.connection]
   [metabase.util.malli :as mu])
  (:import
   (com.github.vertical_blank.sqlformatter SqlFormatter SqlFormatter$Formatter)
   (com.github.vertical_blank.sqlformatter.languages Dialect)))

(set! *warn-on-reflection* true)

;;; some of this code is duplicated with stuff in [[metabase.driver.sql.util]] but this duplication is minor and
;;; necessary to prevent a dependency of `app-db` on `driver`.

(defn- formatter
  "Mapping of dialect kw to dialect, used by sql formatter in [[format-sql]], to dialect."
  ^SqlFormatter$Formatter []
  (let [^Dialect dialect (case (app-db.connection/db-type)
                           :mysql    Dialect/MySql
                           :postgres Dialect/PostgreSql
                           :h2       Dialect/StandardSql)]
    (SqlFormatter/of dialect)))

(mu/defn format-sql :- [:maybe :string]
  "Pretty format `sql` string using appropriate `dialect`. `dialect` is derived from `driver-or-dialect-kw`. If there is
  no corresponding value in [[dialects]]. fallback to `Dialect/StandardSql`. "
  ^String [^String sql :- [:maybe :string]]
  (when (string? sql)
    (.format (formatter) sql)))
