(ns metabase.driver.sql
  "Shared code for all drivers that use SQL under the hood."
  (:refer-clojure :exclude [some])
  (:require
   [clojure.set :as set]
   ;; TODO (Cam 10/1/25) -- Isn't having drivers use Macaw directly against the spirt of all the work we did to make a
   ;; Driver API namespace?
   [macaw.core :as macaw]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters.parse :as params.parse]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.references :as sql.references]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [some]]
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

(defn find-table-or-transform
  "Given a table and schema that has been parsed out of a native query, finds either a matching table or a matching transform.
   It will return either {:table table-id} or {:transform transform-id}, or nil if neither is found."
  [driver tables transforms {search-table :table raw-schema :schema}]
  (let [search-schema (or raw-schema
                          (default-schema driver))
        matches? (fn [db-table db-schema]
                   (and (= search-table db-table)
                        (= search-schema db-schema)))]
    (or (some (fn [{:keys [name schema id]}]
                (when (matches? name schema)
                  {:table id}))
              tables)
        (some (fn [{:keys [id] {:keys [name schema]} :target}]
                (when (matches? name schema)
                  {:transform id}))
              transforms))))

(defn- normalize-table-spec
  [driver {:keys [table schema]}]
  {:table (sql.normalize/normalize-name driver table)
   :schema (some->> schema (sql.normalize/normalize-name driver))})

(mu/defmethod driver/native-query-deps :sql :- ::driver/native-query-deps
  [driver :- :keyword
   query  :- :metabase.lib.schema/native-only-query]
  (let [db-tables (driver-api/tables query)
        db-transforms (driver-api/transforms query)]
    (-> query
        driver-api/raw-native-query
        macaw/parsed-query
        (macaw/query->components {:strip-contexts? true})
        :tables
        (->> (map :component))
        (->> (into #{} (keep #(->> (normalize-table-spec driver %)
                                   (find-table-or-transform driver db-tables db-transforms))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Dependencies                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ^:private resolve-field
  "Resolves a field reference to one or more actual database fields.

  This uses a supplied metadata provider instead of hitting the db directly.  'Field reference' refers to the field
  references returned by sql.references/field-references.

  Note: this currently sets :lib/desired-column-alias but no other :lib/* fields, because the callers of this function
  don't need the other fields.  If we care about other :lib/* fields in the future, we can add them then."
  {:added "0.57.0" :arglists '([driver metadata-provider col-spec])}
  (fn [_driver _metadata-provider col-spec]
    (:type col-spec)))

(defmethod resolve-field :all-columns
  [driver metadata-provider col-spec]
  (or (some->> (:table col-spec)
               (find-table-or-transform driver (driver-api/tables metadata-provider) (driver-api/transforms metadata-provider))
               :table
               (driver-api/active-fields metadata-provider)
               (map #(assoc % :lib/desired-column-alias (:name %))))
      [(assoc col-spec ::bad-reference true)]))

(defmethod resolve-field :single-column
  [driver metadata-provider {:keys [alias] :as col-spec}]
  [(if-let [{:keys [name] :as found}
            (->> (:source-columns col-spec)
                 (some (fn [source-col-set]
                         ;; in cases like `select (select blah from ...) from ...`, if blah refers to a
                         ;; column in both the inner query and the outer query, the column from the inner
                         ;; query will be preferred.  However, if blah doesn't refer to something in the
                         ;; inner query, it can also refer to something in the outer query.
                         ;; sql.references/field-references organizes source-cols into a list of lists
                         ;; to account for this.
                         (->> (mapcat (fn [current-col]
                                        ;; :unknown-columns is a placeholder for "we know there are columns being
                                        ;; returned, but have no way of knowing what those are -- this is primarily
                                        ;; used for table-functions like `select * from my_func()`.  If we encounter
                                        ;; something like that, assume that the query is valid and make up a matching
                                        ;; column to avoid false positives.
                                        (if (= (:type current-col) :unknown-columns)
                                          (let [name (:column col-spec)]
                                            [{:base-type :type/*
                                              :name name
                                              :display-name (->> name (u.humanization/name->human-readable-name :simple))
                                              :effective-type :type/*
                                              :semantic-type :Semantic/*}])
                                          (resolve-field driver metadata-provider current-col)))
                                      source-col-set)
                              (some #(when (= (:name %) (:column col-spec))
                                       %))))))]
     (assoc found :lib/desired-column-alias (or alias name))
     (assoc col-spec ::bad-reference true))])

(defn- get-name [m]
  (or (:alias m) (str (gensym "new-col"))))

(defn- get-display-name [m]
  (->> (get-name m)
       (u.humanization/name->human-readable-name :simple)))

(defmethod resolve-field :custom-field
  [_driver _metadata-provider col-spec]
  [{:base-type :type/*
    :name (get-name col-spec)
    :lib/desired-column-alias (get-name col-spec)
    :display-name (get-display-name col-spec)
    :effective-type :type/*
    :semantic-type :Semantic/*}])

(defmethod resolve-field :invalid-table-wildcard
  [_driver _metadata-provider col-spec]
  [(assoc col-spec ::bad-reference true)])

(defn- lca [default-type & types]
  (let [ancestor-sets (for [t types
                            :when t]
                        (conj (ancestors t) t))
        common-ancestors (when (seq ancestor-sets)
                           (apply set/intersection ancestor-sets))]
    (if (seq common-ancestors)
      (apply (partial max-key (comp count ancestors)) common-ancestors)
      default-type)))

(defmethod resolve-field :composite-field
  [driver metadata-provider col-spec]
  (let [member-fields (mapcat (partial resolve-field driver metadata-provider)
                              (:member-fields col-spec))]
    [{:name (get-name col-spec)
      :lib/desired-column-alias (get-name col-spec)
      :display-name (get-display-name col-spec)
      :base-type (apply lca :type/* (map :base-type member-fields))
      :effective-type (apply lca :type/* (map :effective-type member-fields))
      :semantic-type (apply lca :Semantic/* (map :semantic-type member-fields))}]))

(defmethod resolve-field :unknown-columns
  [_driver _metadata-provider _col-spec]
  [])

(mu/defmethod driver/native-result-metadata :sql
  [driver       :- :keyword
   native-query :- :metabase.lib.schema/native-only-query]
  (let [{:keys [returned-fields]} (->> native-query
                                       driver-api/raw-native-query
                                       macaw/parsed-query
                                       macaw/->ast
                                       (sql.references/field-references driver))]
    (->> (mapcat (partial resolve-field driver native-query) returned-fields)
         (remove ::bad-reference))))

(mu/defmethod driver/validate-native-query-fields :sql
  [driver       :- :keyword
   native-query :- :metabase.lib.schema/native-only-query]
  (let [{:keys [used-fields returned-fields bad-sql]} (->> native-query
                                                           driver-api/raw-native-query
                                                           macaw/parsed-query
                                                           macaw/->ast
                                                           (sql.references/field-references driver))
        check-fields #(mapcat (fn [col-spec]
                                (->> (resolve-field driver (driver-api/->metadata-provider native-query) col-spec)
                                     (filter ::bad-reference)))
                              %)]
    (-> (concat (when bad-sql
                  [{:error ::bad-sql}])
                (check-fields used-fields)
                (check-fields returned-fields))
        distinct)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Convenience Imports                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(p/import-vars [sql.params.substitution ->prepared-substitution PreparedStatementSubstitution])
