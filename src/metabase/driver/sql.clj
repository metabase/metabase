(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:refer-clojure :exclude [mapv])
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql.normalize]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.parameters.values :as params.values]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv]]
   [potemkin :as p]))

(comment metabase.driver.sql.parameters.substitution/keep-me
         metabase.driver.sql.normalize/keep-me) ; this is so `cljr-clean-ns` and the linter don't remove the `:require`

(driver/register! :sql, :abstract? true)

(doseq [feature [:advanced-math-expressions
                 :binning
                 :database-routing
                 :dependencies/native
                 :distinct-where
                 :distinct-where
                 :expression-aggregations
                 :expressions
                 :expressions/date
                 :expressions/datetime
                 :expressions/text
                 :expressions/today
                 :full-join
                 :inner-join
                 :left-join
                 :metadata/key-constraints
                 :native-parameters
                 :native-temporal-units
                 :nested-queries
                 :parameterized-sql
                 :parameters/table-reference
                 :percentile-aggregations
                 :regex
                 :right-join
                 :standard-deviation-aggregations
                 :window-functions/cumulative
                 :window-functions/offset]]
  (defmethod driver/database-supports? [:sql feature] [_driver _feature _db] true))

;; True when the driver's `run-transform!` `:rows-affected` reflects rows actually written.
;; Drivers whose CTAS count is unreliable override to false; the transforms layer then falls back
;; to a native `COUNT(*)` on the target.
(defmethod driver/database-supports? [:sql :transforms/accurate-rows-affected]
  [_driver _feature _db]
  true)

(defmethod driver/database-supports? [:sql :persist-models-enabled]
  [driver _feat db]
  (and
   (driver/database-supports? driver :persist-models db)
   (-> db :settings :persist-models-enabled)))

(defmethod driver/mbql->native :sql
  [driver query]
  (sql.qp/mbql->native driver query))

(defmethod driver/prettify-native-form :sql
  [driver native-form]
  (sql.u/format-sql-and-fix-params driver native-form))

(mu/defmethod driver/substitute-native-parameters-in-stage-method :sql :- ::lib.schema/stage.native
  [_driver                                  :- :keyword
   metadata-providerable                    :- ::lib.schema.metadata/metadata-providerable
   {native-query :native, :as native-stage} :- ::lib.schema/stage.native]
  (let [params-map            (params.values/stage->params-map metadata-providerable native-stage)
        referenced-card-ids   (params.values/referenced-card-ids params-map)
        parsed-query          (lib/parse-parameters native-query)
        [native-query params] (sql.params.substitute/substitute metadata-providerable parsed-query params-map)]
    (cond-> (assoc native-stage
                   :native native-query
                   :params params)
      (seq referenced-card-ids)
      (update :query-permissions/referenced-card-ids set/union referenced-card-ids))))

(defmulti json-field-length
  "Return a HoneySQL expression that calculates the number of characters in a JSON field for a given driver.
  `json-field-identifier` is the Identifier ([[metabase.util.honey-sql-2/Identifier]]) for a JSON field."
  {:added "0.49.22", :arglists '([driver json-field-identifier])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod json-field-length :default
  [_driver _native-form]
  ;; we rely on this to tell if the method is implemented for this driver or not
  ::nyi)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Connection Impersonation                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti set-role-statement
  "SQL for setting the active role for a connection, such as USE ROLE or equivalent, for the given driver.

  DEPRECATED: prefer [[metabase.driver.sql-jdbc/set-role-statement]] going forward."
  {:added "0.47.0", :deprecated "0.61.0", :arglists '([driver role])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod set-role-statement :default
  [_driver _role]
  nil)

(defmulti default-database-role
  "The name of the default role for a given database, used for queries that do not have custom user
  impersonation rules configured for them. This must be implemented for each driver that supports user impersonation."
  {:added "0.47.0" :arglists '(^String [driver database])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod default-database-role :default
  [_ _database]
  nil)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Table identifier qualification                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti table-qualification-style
  "Returns the shape of identifiers this driver emits for tables in compiled SQL. One of:

   - `:table-qualification-style/table`           — bare `table` (no current driver uses this)
   - `:table-qualification-style/schema-table`    — `schema.table` (e.g. Postgres, Redshift, H2, ClickHouse) — default
   - `:table-qualification-style/db-table`        — `db.table` (e.g. MySQL, which calls its table-containers
                                                    \"database\"; the default db name is fixed by the JDBC connection URL)
   - `:table-qualification-style/db-schema-table` — `db.schema.table` (e.g. SQL Server, BigQuery)"
  {:added "0.62.0" :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod table-qualification-style :default
  [_]
  :table-qualification-style/schema-table)

(defmulti db-slot-value
  "Returns the project-id / catalog string a driver places in the `db` segment of a fully-qualified
   table reference. Meaningful only for drivers whose [[table-qualification-style]] includes a `db`
   segment; returns `nil` otherwise."
  {:added "0.62.0" :arglists '([driver database])}
  (fn [driver _] driver)
  :hierarchy #'driver/hierarchy)

(defmethod db-slot-value :default
  [_ _database]
  nil)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Transforms                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- create-table-and-insert-data!
  [driver transform-details conn-spec]
  (let [create-query (driver/compile-transform driver transform-details)]
    ;; `execute-raw-queries!` returns one `{:rows-affected N}` map per statement; the last
    ;; statement's map is the transform's row count. Return it as-is — callers propagate it.
    (last (driver/execute-raw-queries! driver conn-spec [create-query]))))

(defn- run-with-rename-tables-strategy!
  [driver database output-table transform-details conn-spec]
  (let [new-temp (driver.u/temp-table-name driver output-table)
        old-temp (driver.u/temp-table-name driver output-table)]
    (try
      (let [new-temp-details (assoc transform-details :output-table new-temp)
            result           (create-table-and-insert-data! driver new-temp-details conn-spec)]
        (driver/rename-tables! driver (:id database) {output-table old-temp
                                                      new-temp     output-table})
        (driver/drop-table! driver (:id database) old-temp)
        result)
      (catch Exception e
        (log/error e "Failed to run transform using rename-tables strategy")
        (try (driver/drop-table! driver (:id database) new-temp) (catch Exception _))
        (throw e)))))

(defn- run-with-create-drop-rename-strategy!
  [driver database output-table transform-details conn-spec]
  (let [tmp-table (driver.u/temp-table-name driver output-table)]
    (try
      (let [tmp-table-details (assoc transform-details :output-table tmp-table)
            result            (create-table-and-insert-data! driver tmp-table-details conn-spec)]
        (driver/drop-table! driver (:id database) output-table)
        (driver/rename-table! driver (:id database) tmp-table output-table)
        result)
      (catch Exception e
        (log/error e "Failed to run transform using create-drop-rename strategy")
        (try (driver/drop-table! driver (:id database) tmp-table) (catch Exception _))
        (throw e)))))

(defn- run-with-drop-create-fallback-strategy!
  [driver database output-table transform-details conn-spec]
  (try
    (driver/drop-table! driver (:id database) output-table)
    (create-table-and-insert-data! driver transform-details conn-spec)
    (catch Exception e
      (log/error e "Failed to run transform using drop-create strategy")
      (throw e))))

;; Follows similar logic to `transfer-file-to-db :table`
(mu/defmethod driver/run-transform! [:sql :table] :- ::driver/run-transform-result
  [driver {:keys [conn-spec output-table database] :as transform-details} _opts]
  (let [table-exists? (driver/table-exists? driver database
                                            {:schema (namespace output-table)
                                             :name   (name output-table)})]
    (cond
      (or (not table-exists?)
          (driver/database-supports? driver :create-or-replace-table database))
      (create-table-and-insert-data! driver transform-details conn-spec)

      ;; Atomic renames fully supported
      (driver/database-supports? driver :atomic-renames database)
      (run-with-rename-tables-strategy! driver database output-table transform-details conn-spec)

      ;; Single rename supported, partial atomicity
      (driver/database-supports? driver :rename database)
      (run-with-create-drop-rename-strategy! driver database output-table transform-details conn-spec)

      ;; Drop then create, no atomicity
      :else
      (run-with-drop-create-fallback-strategy! driver database output-table transform-details conn-spec))))

(mu/defmethod driver/run-transform! [:sql :table-incremental] :- ::driver/run-transform-result
  [driver {:keys [conn-spec database output-table] :as transform-details} _opts]
  (let [queries (if (driver/table-exists? driver database {:schema (namespace output-table)
                                                           :name (name output-table)})
                  (driver/compile-insert driver transform-details)
                  (driver/compile-transform driver transform-details))]
    (log/tracef "Executing incremental transform queries: %s" (pr-str queries))
    ;; `execute-raw-queries!` already yields `{:rows-affected N}` maps; take the last as-is.
    (last (driver/execute-raw-queries! driver conn-spec [queries]))))

(defn qualified-name
  "Return the name of the target table of a transform as a possibly qualified symbol."
  [{schema :schema, table-name :name}]
  (if schema
    (keyword schema table-name)
    (keyword table-name)))

(defmethod driver/drop-transform-target! [:sql :table]
  [driver database target]
  ;; driver/drop-table! takes table-name as a string, but the :sql-jdbc implementation uses
  ;; honeysql, and accepts a keyword too. This way we delegate proper escaping and qualification to honeysql.
  (driver/drop-table! driver (:id database) (qualified-name target)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Dependencies                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defmethod driver/native-query-table-refs :sql :- ::driver/native-query-table-refs
  [driver :- :keyword
   query  :- :metabase.lib.schema/native-only-query]
  (into #{} (sql-tools/referenced-tables-raw driver (driver-api/raw-native-query query))))

(mu/defmethod driver/native-query-deps :sql :- ::driver/native-query-deps
  [driver :- :keyword
   query  :- :metabase.lib.schema/native-only-query]
  (into (driver-api/native-query-table-references query)
        (sql-tools/referenced-tables driver query)))

(mu/defmethod driver/native-result-metadata :sql
  [driver       :- :keyword
   native-query :- :metabase.lib.schema/native-only-query]
  (sql-tools/returned-columns driver native-query))

(mu/defmethod driver/validate-native-query-fields :sql :- [:set [:ref driver-api/schema.validate.error]]
  [driver       :- :keyword
   native-query :- :metabase.lib.schema/native-only-query]
  (sql-tools/validate-query driver native-query))

(defn validate-impersonated-query*
  "Validates a native query by parsing it and ensuring that it is a single statement.
   Reads `:impersonation/allow-write?` on the query to decide what to require: when truthy (set by
   [[metabase.query-processor.writeback/execute-write-query!]] for custom write actions) require a single
   write statement (insert, update, delete); otherwise require a single select statement.

   Queries that cannot be parsed are always rejected. Admins are allowed to run parseable queries that
   aren't a single select/write statement (e.g. `SHOW TIMEZONE`); non-admins are restricted to a single
   statement of the required type."
  [driver query]
  (update query :stages
          (fn [stages]
            (mapv (fn [stage]
                    (if (lib.util/native-stage? stage)
                      (let [[stmt-type allowed-stmts] (if (:impersonation/allow-write? query)
                                                        ["write" (tru "insert, update, or delete")]
                                                        ["read" (tru "select")])
                            {:keys [is-single-stmt? allowed-stmt-type? sql error]}
                            (sql-tools/is-single-stmt-of-type? driver (:native stage) stmt-type)]
                        (cond error
                              (do
                                (log/warnf "Failed to parse native query: %s\n: Query: %s" error (:native stage))
                                (throw (ex-info (tru "Unable to parse native query. There might be something wrong with your query.")
                                                {:type qp.error-type/invalid-query
                                                 :sql  (:native stage)})))

                              (and is-single-stmt?
                                   (or allowed-stmt-type? (:impersonation/admin? query)))
                              (assoc stage :native sql)

                              :else
                              (throw (ex-info (tru "Invalid impersonated native query. Must be a single {0} statement." allowed-stmts)
                                              {:type qp.error-type/invalid-query
                                               :sql  (:native stage)}))))
                      stage))
                  stages))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars
 [metabase.driver.sql.parameters.substitution ->prepared-substitution PreparedStatementSubstitution]
 [metabase.driver.sql.normalize default-schema normalize-error normalize-name reserved-literal])
