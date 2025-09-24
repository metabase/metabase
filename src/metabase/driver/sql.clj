(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:refer-clojure :exclude [some])
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.impl :as driver.impl]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [some]]
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

(def ^:const tmp-transform-suffix
  "Suffix used for a temporary transform table that will be renamed to the final transform table."
  "__metabase_transform_tmp_name")

(defn- get-tmp-transform-name [table-name suffix]
  (str (driver.impl/truncate-alias (str table-name "__" (str/replace (random-uuid) "-" ""))
                                   (- driver.impl/default-alias-max-length-bytes (count suffix)))
       suffix))

;; TODO(rileythomp, 2025-09-09): This probably doesn't need to be a driver multi-method
(defmethod driver/run-transform! [:sql :table]
  [driver {:keys [db-id query target conn-spec]}]
  (let [db (driver-api/with-metadata-provider db-id (driver-api/database (driver-api/metadata-provider)))
        {schema :schema table-name :name} target
        output-table (keyword schema table-name)
        queries (if (driver/table-exists? driver db target)
                  (let [tmp-name (get-tmp-transform-name table-name tmp-transform-suffix)
                        tmp-table (keyword schema tmp-name)]
                    [(driver/compile-transform driver query tmp-table)
                     (driver/compile-drop-table driver output-table)
                     (driver/compile-rename-table driver tmp-table table-name)])
                  [(driver/compile-transform driver query output-table)])]
    {:rows-affected (first (driver/execute-raw-queries! driver conn-spec queries))}))

(defmethod driver/drop-transform-target! [:sql :table]
  [driver database {:keys [schema name]}]
  ;; driver/drop-table! takes table-name as a string, but the :sql-jdbc implementation uses
  ;; honeysql, and accepts a keyword too. This way we delegate proper escaping and qualification to honeysql.
  (driver/drop-table! driver (:id database) (keyword schema name)))

(defn normalize-name
  "Normalizes the (primarily table/column) name passed in.
  Should return a value that matches the name listed in the appdb."
  [driver name-str]
  (let [quote-style (sql.qp/quote-style driver)
        quote-char (if (= quote-style :mysql) \` \")]
    (if (and (= (first name-str) quote-char)
             (= (last name-str) quote-char))
      (let [quote-quote (str quote-char quote-char)
            quote (str quote-char)]
        (-> name-str
            (subs 1 (dec (count name-str)))
            (str/replace quote-quote quote)))
      (u/lower-case-en name-str))))

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
  (let [normalized-table (normalize-name driver table)
        normalized-schema (or (some->> schema (normalize-name driver))
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
  [driver query]
  (let [db-tables (driver-api/tables (driver-api/metadata-provider))
        transforms (t2/select [:model/Transform :id :target])]
    (->> query
         macaw/parsed-query
         macaw/query->components
         :tables
         (map :component)
         (into #{} (keep #(find-table-or-transform driver db-tables transforms %))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [sql.params.substitution ->prepared-substitution PreparedStatementSubstitution])
