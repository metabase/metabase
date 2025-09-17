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
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.references :as sql.references]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [potemkin :as p]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

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
                 :dependencies/native]]
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

(defmethod driver/run-transform! [:sql :table]
  [driver {:keys [conn-spec output-table] :as transform-details} {:keys [overwrite?]}]
  (let [queries (cond->> [(driver/compile-transform driver transform-details)]
                  overwrite? (cons (driver/compile-drop-table driver output-table)))]
    {:rows-affected (last (driver/execute-raw-queries! driver conn-spec queries))}))

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

(defn find-table-or-transform
  "Given a table and schema that has been parsed out of a native query, finds either a matching table or a matching transform.
   It will return either {:table table-id} or {:transform transform-id}, or nil if neither is found."
  [driver tables transforms {:keys [table schema]}]
  (let [normalized-table (sql.normalize/normalize-name driver table)
        normalized-schema (or (some->> schema (sql.normalize/normalize-name driver))
                              (default-schema driver))
        matches? (fn [db-table db-schema]
                   (and (= normalized-table db-table)
                        (= normalized-schema db-schema)))]
    (or (some (fn [{:keys [name schema id]}]
                (when (matches? name schema)
                  {:table id}))
              tables)
        (some (fn [{:keys [id] {:keys [name schema]} :target}]
                (when (matches? name schema)
                  {:transform id}))
              transforms))))

(defmethod driver/native-query-deps :sql
  ([driver query]
   (driver/native-query-deps driver query
                             (driver-api/metadata-provider)
                             (t2/select [:model/Transform :id :target])))
  ([driver query metadata-provider transforms]
   (let [db-tables (driver-api/tables metadata-provider)]
     (->> query
          macaw/parsed-query
          macaw/query->components
          :tables
          (map :component)
          (into #{} (keep #(find-table-or-transform driver db-tables transforms %)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Dependencies                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- table-key [entity]
  (select-keys entity [:table :schema]))

(defmulti resolve-field (fn [_driver _metadata-provider col-spec]
                          (:type col-spec)))

(defmethod resolve-field :all-columns
  [driver metadata-provider col-spec]
  (or (some->> (:table col-spec)
               (find-table-or-transform driver (driver-api/tables metadata-provider) [])
               :table
               (driver-api/fields metadata-provider))
      [(assoc col-spec ::bad-reference true)]))

(defmethod resolve-field :single-column
  [driver metadata-provider col-spec]
  [(or (->> (:source-columns col-spec)
            (some (fn [source-col-set]
                    ;; in cases like `select (select blah from ...) from ...`, if blah refers to a
                    ;; column in both the inner query and the outer query, the column from the inner
                    ;; query will be preferred.  However, if blah doesn't refer to something in the
                    ;; inner query, it can also refer to something in the outer query.
                    ;; sql.references/field-references organizes source-cols into a list of lists
                    ;; to account for this.
                    (->> (mapcat (partial resolve-field driver metadata-provider) source-col-set)
                         (some #(when (= (:name %) (:column col-spec))
                                  %))))))
       (assoc col-spec ::bad-reference true))])

(defmethod resolve-field :custom-field
  [_driver _metadata-provider col-spec]
  [{:type :type/*
    :name (:alias col-spec)}])

(defmethod resolve-field :invalid-table-wildcard
  [_driver _metadata-provider col-spec]
  [(assoc col-spec ::bad-reference true)])

(defmethod driver/native-result-metadata :sql
  [driver metadata-provider native-query]
  (let [{:keys [returned-fields]} (->> (macaw/parsed-query native-query)
                                       macaw/->ast
                                       (sql.references/field-references driver))]
    (map (partial resolve-field driver metadata-provider) returned-fields)))

(defmethod driver/validate-native-query-fields :sql
  [driver metadata-provider native-query]
  (let [{:keys [used-fields returned-fields]} (->> (macaw/parsed-query native-query)
                                                   macaw/->ast
                                                   (sql.references/field-references driver))
        check-fields #(every? (fn [col-spec]
                                (->> (resolve-field driver metadata-provider col-spec)
                                     (every? (comp not ::bad-reference))))
                              %)]
    (and (check-fields used-fields)
         (check-fields returned-fields))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [sql.params.substitution ->prepared-substitution PreparedStatementSubstitution])
