(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:refer-clojure :exclude [some])
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters.parse :as params.parse]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [potemkin :as p]))

(comment sql.params.substitution/keep-me) ; this is so `cljr-clean-ns` and the linter don't remove the `:require`

(driver/register! :sql, :abstract? true)

(doseq [feature [:advanced-math-expressions
                 :binning
                 :expression-aggregations
                 :expressions
                 :full-join
                 :inner-join
                 :left-join
                 :native-parameters
                 :nested-queries
                 :parameterized-sql
                 :percentile-aggregations
                 :regex
                 :right-join
                 :standard-deviation-aggregations
                 :metadata/key-constraints
                 :window-functions/cumulative
                 :window-functions/offset
                 :distinct-where
                 :native-temporal-units
                 :expressions/datetime
                 :expressions/date
                 :expressions/text
                 :expressions/today
                 :distinct-where
                 :database-routing
                 :dependencies/native
                 :parameters/table-reference]]
  (defmethod driver/database-supports? [:sql feature] [_driver _feature _db] true))

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

(mu/defmethod driver/substitute-native-parameters :sql
  [_driver {:keys [query] :as inner-query} :- [:and [:map-of :keyword :any] [:map {:query driver-api/schema.common.non-blank-string}]]]
  (let [params-map          (params.values/query->params-map inner-query)
        referenced-card-ids (params.values/referenced-card-ids params-map)
        [query params]      (-> query
                                params.parse/parse
                                (sql.params.substitute/substitute params-map))]
    (cond-> (assoc inner-query
                   :query  query
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
  "SQL for setting the active role for a connection, such as USE ROLE or equivalent, for the given driver."
  {:added "0.47.0" :arglists '([driver role])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod set-role-statement :default
  [_ _ _]
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
;;; |                                              Transforms                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- create-table-and-insert-data!
  [driver transform-details conn-spec]
  (let [create-query (driver/compile-transform driver transform-details)
        rows-affected (last (driver/execute-raw-queries! driver conn-spec [create-query]))]
    rows-affected))

(defn- run-with-rename-tables-strategy!
  [driver database output-table transform-details conn-spec]
  (let [new-temp (driver.u/temp-table-name driver output-table)
        old-temp (driver.u/temp-table-name driver output-table)]
    (try
      (let [new-temp-details (assoc transform-details :output-table new-temp)
            rows-affected (create-table-and-insert-data! driver new-temp-details conn-spec)]
        (driver/rename-tables! driver (:id database) {output-table old-temp
                                                      new-temp output-table})
        (driver/drop-table! driver (:id database) old-temp)
        {:rows-affected rows-affected})
      (catch Exception e
        (log/error e "Failed to run transform using rename-tables strategy")
        (try (driver/drop-table! driver (:id database) new-temp) (catch Exception _))
        (throw e)))))

(defn- run-with-create-drop-rename-strategy!
  [driver database output-table transform-details conn-spec]
  (let [tmp-table (driver.u/temp-table-name driver output-table)]
    (try
      (let [tmp-table-details (assoc transform-details :output-table tmp-table)
            rows-affected (create-table-and-insert-data! driver tmp-table-details conn-spec)]
        (driver/drop-table! driver (:id database) output-table)
        (driver/rename-table! driver (:id database) tmp-table output-table)
        {:rows-affected rows-affected})
      (catch Exception e
        (log/error e "Failed to run transform using create-drop-rename strategy")
        (try (driver/drop-table! driver (:id database) tmp-table) (catch Exception _))
        (throw e)))))

(defn- run-with-drop-create-fallback-strategy!
  [driver database output-table transform-details conn-spec]
  (try
    (driver/drop-table! driver (:id database) output-table)
    {:rows-affected (create-table-and-insert-data! driver transform-details conn-spec)}
    (catch Exception e
      (log/error e "Failed to run transform using drop-create strategy")
      (throw e))))

;; Follows similar logic to `transfer-file-to-db :table`
(defmethod driver/run-transform! [:sql :table]
  [driver {:keys [conn-spec output-table database] :as transform-details} _opts]
  (let [table-exists? (driver/table-exists? driver database
                                            {:schema (namespace output-table)
                                             :name (name output-table)})]
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

(defmethod driver/run-transform! [:sql :table-incremental]
  [driver {:keys [conn-spec database output-table] :as transform-details} _opts]
  (let [queries (if (driver/table-exists? driver database {:schema (namespace output-table)
                                                           :name (name output-table)})
                  (driver/compile-insert driver transform-details)
                  (driver/compile-transform driver transform-details))]
    (log/tracef "Executing incremental transform queries: %s" (pr-str queries))
    {:rows-affected (last (driver/execute-raw-queries! driver conn-spec [queries]))}))

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

(defmulti default-schema
  "Returns the default schema for a given database driver.

  Drivers that support any of the `:transforms/...` features must implement this method."
  {:added "0.57.0" :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod default-schema :sql
  [_]
  "public")

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
  (sql-tools/referenced-tables driver query))

(mu/defmethod driver/native-result-metadata :sql
  [driver       :- :keyword
   native-query :- :metabase.lib.schema/native-only-query]
  (sql-tools/returned-columns driver native-query))

(mu/defmethod driver/validate-native-query-fields :sql :- [:set [:ref driver-api/schema.validate.error]]
  [driver       :- :keyword
   native-query :- :metabase.lib.schema/native-only-query]
  (sql-tools/validate-query driver native-query))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars
 [sql.params.substitution ->prepared-substitution PreparedStatementSubstitution]
 [sql.normalize normalize-name reserved-literal])
