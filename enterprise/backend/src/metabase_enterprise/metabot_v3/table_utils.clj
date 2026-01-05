(ns metabase-enterprise.metabot-v3.table-utils
  "Shared table utilities for enterprise modules."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.metabot-v3.query-analyzer :as query-analyzer]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.io StringWriter Writer)
   (org.apache.commons.text.similarity LevenshteinDistance)))

(set! *warn-on-reflection* true)

;; some arbitrary limits
(def ^:private max-database-tables
  "If the number of tables in the database doesn't exceed this number, we send them all to the agent."
  100)

(def ^:private max-schema-sample-tables
  "If the number of tables in the database doesn't exceed this number, we send them all to the agent."
  10)

(defn database-tables
  "Get database tables formatted for AI context, with proper permissions filtering.

  Options:
  - :all-tables-limit - Maximum number of tables to return (default: 100)
  - :priority-tables - Collection of tables to prioritize (will be included first)
  - :exclude-table-ids - Set of table IDs to exclude from the results

  Returns tables formatted with :name, :schema, :description, and :columns."
  ([database-id]
   (database-tables database-id nil))
  ([database-id {:keys [all-tables-limit priority-tables exclude-table-ids]
                 :or {all-tables-limit max-database-tables
                      priority-tables []
                      exclude-table-ids #{}}}]
   (let [priority-table-ids (set (map :id priority-tables))
         {table-where-clause :clause table-cte :with} (mi/visible-filter-clause :model/Table
                                                                                :id
                                                                                {:user-id       api/*current-user-id*
                                                                                 :is-superuser? api/*is-superuser?*}
                                                                                {:perms/view-data      :unrestricted
                                                                                 :perms/create-queries :query-builder-and-native})
         ;; Fetch most viewed tables, excluding priority tables and excluded tables
         fill-tables (t2/select [:model/Table :id :db_id :name :schema :description]
                                :db_id           database-id
                                :active          true
                                :visibility_type nil
                                (cond-> {:where    table-where-clause
                                         :order-by [[:view_count :desc]]
                                         :limit    all-tables-limit}
                                  table-cte (assoc :with table-cte)))
         fill-tables (remove #(or (priority-table-ids (:id %))
                                  (exclude-table-ids (:id %))) fill-tables)
         fill-tables (t2/hydrate fill-tables :fields)
         priority-tables (t2/hydrate priority-tables :fields)
         all-tables (concat priority-tables fill-tables)
         all-tables (take all-tables-limit all-tables)]
     (mapv (fn [{:keys [fields] :as table}]
             (merge (select-keys table [:id :name :schema :description])
                    {:columns (mapv (fn [{:keys [database_type] :as field}]
                                      (merge (select-keys field [:id :name :description])
                                             {:data_type database_type}))
                                    fields)}))
           all-tables))))

(defn enhanced-database-tables
  "Get database tables formatted with the new metabot tools schema format.

  Returns tables with :type, :display_name, :database_id, :database_schema, :fields (with field-id), :metrics.
  This format is used by metabot context and other modern tools."
  ([database-id]
   (enhanced-database-tables database-id nil))
  ([database-id {:keys [all-tables-limit priority-tables exclude-table-ids]
                 :or {all-tables-limit max-database-tables
                      priority-tables []
                      exclude-table-ids #{}}}]
   (let [priority-table-ids (set (map :id priority-tables))
         {table-where-clause :clause table-cte :with} (mi/visible-filter-clause :model/Table
                                                                                :id
                                                                                {:user-id       api/*current-user-id*
                                                                                 :is-superuser? api/*is-superuser?*}
                                                                                {:perms/view-data      :unrestricted
                                                                                 :perms/create-queries :query-builder-and-native})
         ;; Fetch most viewed tables, excluding priority tables and excluded tables
         fill-tables (t2/select [:model/Table :id :db_id :name :schema :description]
                                :db_id database-id
                                :active true
                                :visibility_type nil
                                (cond-> {:where    table-where-clause
                                         :order-by [[:view_count :desc]]
                                         :limit    all-tables-limit}
                                  table-cte (assoc :with table-cte)))
         fill-tables (remove #(or (priority-table-ids (:id %))
                                  (exclude-table-ids (:id %))) fill-tables)
         all-tables (concat priority-tables fill-tables)
         all-tables (take all-tables-limit all-tables)]
     (lib-be/with-metadata-provider-cache
       (let [mp (lib-be/application-database-metadata-provider database-id)
             table-ids (map :id all-tables)
             _ (lib.metadata/bulk-metadata mp :metadata/table table-ids)]
         (mapv (fn [{:keys [id name schema description]}]
                 (let [table-query (lib/query mp (lib.metadata/table mp id))
                       cols (->> (lib/visible-columns table-query)
                                 (map #(metabot-v3.tools.u/add-table-reference table-query %)))
                       field-id-prefix (metabot-v3.tools.u/table-field-id-prefix id)]
                   {:id id
                    :type :table
                    :name name
                    :display_name (u.humanization/name->human-readable-name :simple name)
                    :database_id database-id
                    :database_schema schema
                    :description description
                    :fields (into [] (map-indexed #(metabot-v3.tools.u/->result-column table-query %2 %1 field-id-prefix) cols))
                    :metrics []}))
               all-tables))))))

(defn get-tables
  "Get information about the tables in a given database.

  Returns a map with :structured-output containing :database and :tables info.
  This is the handler for the /get-tables tool endpoint."
  [{:keys [database-id]}]
  {:structured-output
   {:database (t2/select-one [:model/Database :id :name :description :engine] database-id)
    :tables   (database-tables database-id)}})

(defn similar?
  "Check if two strings are similar using Levenshtein distance with a max distance of 4."
  [left right]
  (cond
    ;; One empty, one non-empty are not similar
    (not= (empty? left) (empty? right)) false
    ;; Use Levenshtein distance for other cases
    :else
    (let [max-distance 4
          matcher (LevenshteinDistance. (int max-distance))]
      (nat-int? (.apply matcher (u/lower-case-en left) (u/lower-case-en right))))))

(defn matching-tables?
  "Check if two table maps match based on name similarity and optionally schema similarity.

  Uses fuzzy string matching (Levenshtein distance) to determine if two table references
  likely refer to the same table, even with typos or case differences.

  Args:
  - First table map with :name and :schema keys
  - Second table map with :name and :schema keys
  - Options map with :match-schema? boolean flag

  Returns:
  Boolean indicating whether the tables are considered a match."
  [{tschema :schema, tname :name} {uschema :schema, uname :name} {:keys [match-schema?]}]
  (and (similar? uname tname)
       (or (not match-schema?)
           (nil? uschema)
           (nil? tschema)
           (similar? uschema tschema))))

(defn- visible-filter-clause
  []
  (let [{table-where-clause :clause table-cte :with} (mi/visible-filter-clause :model/Table
                                                                               :id
                                                                               {:user-id       api/*current-user-id*
                                                                                :is-superuser? api/*is-superuser?*}
                                                                               {:perms/view-data      :unrestricted
                                                                                :perms/create-queries :query-builder-and-native})]
    (cond-> {:where table-where-clause}
      table-cte (assoc :with table-cte))))

(defn find-matching-tables
  "Find tables in the database that are similar to the unrecognized tables using fuzzy matching.

  This function performs fuzzy string matching using Levenshtein distance to find tables
  that might be referenced with typos or slight variations in name. It respects user
  permissions and only returns tables the current user can view.

  Args:
  - database-id: ID of the database to search in
  - unrecognized-tables: Collection of table maps with :name and :schema keys that need matching
  - used-ids: Collection of table IDs to exclude from results (already recognized tables)

  Returns:
  A vector of realized Table model instances that match the unrecognized tables."
  [database-id unrecognized-tables used-ids]

  (into []
        (keep (fn [table]
                (when (some #(matching-tables? table % {:match-schema? false}) unrecognized-tables)
                  (t2.realize/realize table))))
        (t2/reducible-select [:model/Table :id :name :schema]
                             :db_id database-id
                             :active true
                             :visibility_type nil
                             (cond-> (assoc (visible-filter-clause)
                                            :limit 10000)
                               (seq used-ids) (update :where #(if %
                                                                [:and % [:not-in :id used-ids]]
                                                                [:not-in :id used-ids]))))))

(defn used-tables-from-ids
  "Return table info for `table-ids` in the same shape as [[used-tables]].

  Useful for cases where you don't have a native query (e.g. python transforms), but do have a seq of used table ids."
  [database-id table-ids]
  (if-not (seq table-ids)
    []
    (t2/select [:model/Table :id :name :schema]
               :db_id database-id
               :id [:in table-ids]
               :active true
               :visibility_type nil
               (visible-filter-clause))))

(defn used-tables
  "Return all tables used in the query, including fuzzy-matched ones.

  This function analyzes a native SQL query to identify all referenced tables.
  It handles two types of table references:
  1. Recognized tables - Tables that already exist as model instances in Metabase
  2. Unrecognized tables - Table names from the query that need fuzzy matching

  For unrecognized tables, it performs fuzzy string matching using Levenshtein distance
  to find similar table names in the database (handling typos, case differences, etc.).
  All results respect user permissions - only tables the current user can view are returned.

  Args:
  - query: A query map containing :database key and native SQL content

  Returns:
  A sequence of table model instances representing all tables used in the query,
  both directly recognized and fuzzy-matched ones."
  [{:keys [database] :as query}]
  (let [analysis-result (query-analyzer/tables-for-native query :all-drivers-trusted? true)
        queried-tables (->> analysis-result
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

(defn- format-column-ddl
  [{:keys [^String data_type], fname :name} ^Writer writer]
  (format-escaped fname writer)
  (.append writer " ")
  (.append writer data_type))

(defn- format-table-ddl
  [{:keys [schema fields columns], tname :name} ^Writer writer]
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
  (when (seq columns)
    (.append writer "\n  ")
    (format-column-ddl (first columns) writer)
    (doseq [column (rest columns)]
      (.append writer ",\n  ")
      (format-column-ddl column writer)))
  (.append writer "\n);"))

(defn- format-schema-ddl
  [tables]
  (let [sw (StringWriter.)]
    (doseq [table tables]
      (format-table-ddl table sw)
      (.append sw \newline))
    (str sw)))

(defn schema-sample
  "Returns the DDL for the tables available in the given schema"
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

(defn schema-full
  "Returns the DDL for all tables in a database."
  [database-id]
  (let [tables (database-tables database-id)]
    (format-schema-ddl (t2/hydrate tables :fields))))
