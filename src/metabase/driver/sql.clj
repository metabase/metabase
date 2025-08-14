(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
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
                 :database-routing]]
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

;; TODO Although these methods are implemented here, in fact they only work for sql-jdbc drivers, because
;; execute-raw-queries! is not in implemented for plain sql drivers.
(defmethod driver/run-transform! [:sql :table]
  [driver {:keys [connection-details query output-table]} {:keys [overwrite?]}]
  (let [driver (keyword driver)
        queries (cond->> [(driver/compile-transform driver
                                                    {:query query
                                                     :output-table output-table})]
                  overwrite? (cons (driver/compile-drop-table driver output-table)))]
    {:rows-affected (last (driver/execute-raw-queries! driver connection-details queries))}))

(defmethod driver/run-transform! [:sql :view]
  [driver {:keys [connection-details query output-table]} {:keys [overwrite?]}]
  (let [driver (keyword driver)
        statement (if overwrite?
                    :create-or-replace-view
                    :create-view)
        sql (sql.qp/format-honeysql driver {statement [(keyword output-table)]
                                            :raw query})]
    {:rows-affected (last (driver/execute-raw-queries! driver connection-details [sql]))}))

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

(defmethod driver/drop-transform-target! [:sql :view]
  [driver database target]
  ;; driver/drop-table! takes table-name as a string, but the :sql-jdbc implementation uses
  ;; honeysql, and accepts a keyword too. This way we delegate proper escaping and qualification to honeysql.
  (let [driver (keyword driver)
        sql (sql.qp/format-honeysql driver {:drop-view [(qualified-name target)]})]
    (driver/execute-raw-queries! driver (driver/connection-details driver database) [sql])))

(defmulti normalize-name
  "Normalizes the (primarily table/column) name passed in.

  Should return a value that matches the name listed in the appdb. Drivers that support any of the `:transforms/...`
  features must implement this method."
  {:added "0.57.0" :arglists '([driver name-str])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod normalize-name :sql
  [driver name-str]
  (if (and (= (first name-str) \")
           (= (last name-str) \"))
    (-> name-str
        (subs 1 (dec (count name-str)))
        (str/replace #"\"\"" "\""))
    (str/lower-case name-str)))

(defmulti default-schema
  "Returns the default schema for a given database driver.

  Drivers that support any of the `:transforms/...` features must implement this method."
  {:added "0.57.0" :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod default-schema :sql
  [_]
  "public")

(defmulti find-table
  "Finds the table matching a given name and schema.

  Names and schemas are potentially taken from a raw sql query and will be normalized accordingly. Drivers that
  support any of the `:transforms/...` features must implement this method."
  {:added "0.57.0" :arglists '([driver {:keys [table schema]}])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod find-table :sql
  [driver {:keys [table schema]}]
  (let [normalized-table (normalize-name driver table)
        normalized-schema (if (seq schema)
                            (normalize-name driver schema)
                            (default-schema driver))]
    (->> (driver-api/metadata-provider)
         driver-api/tables
         (some (fn [{db-table :name db-schema :schema id :id}]
                 (and (= normalized-table db-table)
                      (= normalized-schema db-schema)
                      id))))))

(defmethod driver/native-query-deps :sql
  [driver query]
  (->> query
       macaw/parsed-query
       macaw/query->components
       :tables
       (into #{} (keep #(->> % :component (find-table driver))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [sql.params.substitution ->prepared-substitution PreparedStatementSubstitution])
