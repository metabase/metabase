(ns metabase-enterprise.ai-sql-fixer.api
  "`/api/ee/ai-sql-fixer/` routes"
  (:require
   [clojure.set :as set]
   [metabase-enterprise.metabot-v3.core :as metabot-v3]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.query-analysis.core :as query-analyzer]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.io StringWriter Writer)
   (org.apache.commons.text.similarity LevenshteinDistance)))

(set! *warn-on-reflection* true)

;; some arbitrary limits
(def ^:private max-schema-sample-tables
  "If the number of tables in the database doesn't exceed this number, we send them all to the agent."
  10)

(def ^:private max-schema-candidate-tables
  "The maximum number of tables we process to find the ones that might be relevant for the SQL query to fix."
  10000)

(def ^:private max-distance
  "The maximal edit distance at which we consider two table (or schema) names similar."
  4)

(def ^:private ^LevenshteinDistance matcher (LevenshteinDistance. (int max-distance)))

(defn- similar?
  [left right]
  (nat-int? (.apply matcher (u/lower-case-en left) (u/lower-case-en right))))

(defn- matching-tables?
  [{tschema :schema, tname :name} {uschema :schema, uname :name} {:keys [match-schema?]}]
  (and (similar? uname tname)
       (or (not match-schema?)
           (nil? uschema)
           (nil? tschema)
           (similar? uschema tschema))))

(defn- find-matching-tables
  [database-id unrecognized-tables used-ids]
  (into []
        (keep (fn [table]
                (when (some #(matching-tables? table % {:match-schema? false}) unrecognized-tables)
                  (t2.realize/realize table))))
        (t2/reducible-select [:model/Table :id :name :schema]
                             :db_id database-id
                             :active true
                             :visibility_type nil
                             (cond-> {:limit max-schema-candidate-tables}
                               (seq used-ids) (assoc :where [:not-in :id used-ids])))))

(defn- used-tables
  [{:keys [database] :as query}]
  (let [queried-tables (->> (query-analyzer/tables-for-native query :all-drivers-trusted? true)
                            :tables
                            (map #(set/rename-keys % {:table :name, :table-id :id})))
        {recognized-tables true, unrecognized-tables false} (group-by t2/instance? queried-tables)]
    (concat recognized-tables
            (find-matching-tables database unrecognized-tables (map :id recognized-tables)))))

(defn- format-escaped
  [^String identifier ^Writer writer]
  (if (re-matches #"[\p{Alpha}_][\p{Alnum}_]*" identifier)
    (.append writer identifier)
    (do
      (.append writer \")
      (doseq [^Character c identifier]
        (when (= c \")
          (.append writer c))
        (.append writer c))
      (.append writer \"))))

(defn- format-field-ddl
  [{:keys [^String database_type], fname :name} ^Writer writer]
  (format-escaped fname writer)
  (.append writer " ")
  (.append writer database_type))

(defn- format-table-ddl
  [{:keys [schema fields], tname :name} ^Writer writer]
  (.append writer "CREATE TABLE ")
  (when (seq schema)
    (format-escaped schema writer)
    (.append writer \.))
  (format-escaped tname writer)
  (.append writer " (")
  (when (seq fields)
    (.append writer "\n  ")
    (format-field-ddl (first fields) writer)
    (doseq [field (rest fields)]
      (.append writer ",\n  ")
      (format-field-ddl field writer)))
  (.append writer "\n);"))

(defn- format-schema-ddl
  [tables]
  (let [sw (StringWriter.)]
    (doseq [table tables]
      (format-table-ddl table sw)
      (.append sw \newline))
    (str sw)))

(defn- schema-sample
  ([query]
   (schema-sample query nil))
  ([{:keys [database] :as query} {:keys [all-tables-limit] :or {all-tables-limit max-schema-sample-tables}}]
   (let [tables (t2/select [:model/Table :id :name :schema]
                           :db_id database
                           :active true
                           :visibility_type nil
                           {:limit (inc all-tables-limit)})
         tables (if (> (count tables) all-tables-limit)
                  (used-tables query)
                  tables)
         tables (t2/hydrate tables :fields)]
     (format-schema-ddl tables))))

(api.macros/defendpoint :post "/fix"
  "Suggest fixes for a SQL query."
  [_route-params
   _query-params
   {:keys [query error_message]} :- [:map
                                     [:query [:map
                                              [:database ms/PositiveInt]]]
                                     [:error_message :string]]]
  (qp.perms/check-current-user-has-adhoc-native-query-perms query)
  (let [driver (-> query :database driver.u/database->driver)]
    (-> (metabot-v3/fix-sql {:sql (-> query :native :query)
                             :dialect driver
                             :error_message error_message
                             :schema_ddl (schema-sample query)})
        (select-keys [:fixes]))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-sql-fixer` routes."
  (api.macros/ns-handler *ns* +auth))
