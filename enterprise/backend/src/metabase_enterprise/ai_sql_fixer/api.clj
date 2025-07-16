(ns metabase-enterprise.ai-sql-fixer.api
  "`/api/ee/ai-sql-fixer/` routes"
  (:require
   [metabase-enterprise.metabot-v3.core :as metabot-v3]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io StringWriter Writer)))

(set! *warn-on-reflection* true)

;; some arbitrary limits
(def ^:private max-schema-sample-tables
  "If the number of tables in the database doesn't exceed this number, we send them all to the agent."
  10)

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
                  (metabot-v3/used-tables query)
                  tables)
         tables (t2/hydrate tables :fields)]
     (format-schema-ddl tables))))

(api.macros/defendpoint :post "/fix"
  "Suggest fixes for a SQL query."
  [_route-params
   _query-params
   {:keys [query error_message]} :- [:map
                                     [:query [:map
                                              [:database ::ms/PositiveInt]]]
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
