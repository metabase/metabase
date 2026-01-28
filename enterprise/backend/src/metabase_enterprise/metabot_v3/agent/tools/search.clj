(ns metabase-enterprise.metabot-v3.agent.tools.search
  "Search tool wrappers for Metabot v3."
  (:require
   [metabase-enterprise.metabot-v3.tools.search :as search-tools]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- invalid-entity-types
  [entity-types allowed]
  (when (seq entity-types)
    (seq (remove allowed entity-types))))

(mu/defn ^{:tool-name "search"} search-tool
  "Search for tables, models, metrics, dashboards, and saved questions."
  [{:keys [semantic_queries keyword_queries entity_types]} :- [:map {:closed true}
                                                               [:semantic_queries [:sequential :string]]
                                                               [:keyword_queries [:sequential :string]]
                                                               [:entity_types {:optional true}
                                                                [:maybe [:sequential [:enum "table" "model" "metric" "dashboard" "question"]]]]]]
  (if-let [invalid (invalid-entity-types entity_types #{"table" "model" "metric" "dashboard" "question"})]
    {:output (str "Invalid entity_types for search: " (pr-str (vec invalid))
                  ". Allowed types: table, model, metric, dashboard, question.")}
    (try
      (let [results (search-tools/search {:semantic-queries semantic_queries
                                          :term-queries keyword_queries
                                          :entity-types entity_types
                                          :limit 10})]
        {:structured-output {:result-type :search
                             :data results
                             :total_count (count results)}})
      (catch Exception e
        (log/error e "Error in search")
        {:output (str "Search failed: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "search"} sql-search-tool
  "Search for SQL-queryable data sources (tables and models) within a database."
  [{:keys [semantic_queries keyword_queries entity_types database_id]} :- [:map {:closed true}
                                                                           [:semantic_queries [:sequential :string]]
                                                                           [:keyword_queries [:sequential :string]]
                                                                           [:database_id :int]
                                                                           [:entity_types {:optional true}
                                                                            [:maybe [:sequential [:enum "table" "model"]]]]]]
  (if-let [invalid (invalid-entity-types entity_types #{"table" "model"})]
    {:output (str "Invalid entity_types for SQL search: " (pr-str (vec invalid))
                  ". Allowed types: table, model.")}
    (try
      (let [results (search-tools/search {:semantic-queries semantic_queries
                                          :term-queries keyword_queries
                                          :entity-types entity_types
                                          :database-id database_id
                                          :limit 10})]
        {:structured-output {:result-type :search
                             :data results
                             :total_count (count results)}})
      (catch Exception e
        (log/error e "Error in SQL search")
        {:output (str "Search failed: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "search"} nlq-search-tool
  "Search for NLQ-queryable data sources (models, metrics, tables)."
  [{:keys [semantic_queries keyword_queries entity_types]} :- [:map {:closed true}
                                                               [:semantic_queries [:sequential :string]]
                                                               [:keyword_queries [:sequential :string]]
                                                               [:entity_types {:optional true}
                                                                [:maybe [:sequential [:enum "model" "metric" "table"]]]]]]
  (if-let [invalid (invalid-entity-types entity_types #{"model" "metric" "table"})]
    {:output (str "Invalid entity_types for NLQ search: " (pr-str (vec invalid))
                  ". Allowed types: model, metric, table.")}
    (try
      (let [results (search-tools/search {:semantic-queries semantic_queries
                                          :term-queries keyword_queries
                                          :entity-types entity_types
                                          :profile-id "nlq"
                                          :limit 10})]
        {:structured-output {:result-type :search
                             :data results
                             :total_count (count results)}})
      (catch Exception e
        (log/error e "Error in NLQ search")
        {:output (str "Search failed: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "search"} transform-search-tool
  "Search for transforms, tables, and models."
  [{:keys [semantic_queries keyword_queries entity_types search_native_query]} :- [:map {:closed true}
                                                                                   [:semantic_queries [:sequential :string]]
                                                                                   [:keyword_queries [:sequential :string]]
                                                                                   [:search_native_query {:optional true} [:maybe :boolean]]
                                                                                   [:entity_types {:optional true}
                                                                                    [:maybe [:sequential [:enum "table" "model" "transform"]]]]]]
  (if-let [invalid (invalid-entity-types entity_types #{"table" "model" "transform"})]
    {:output (str "Invalid entity_types for transform search: " (pr-str (vec invalid))
                  ". Allowed types: table, model, transform.")}
    (try
      (let [results (search-tools/search {:semantic-queries semantic_queries
                                          :term-queries keyword_queries
                                          :entity-types entity_types
                                          :search-native-query search_native_query
                                          :limit 10})]
        {:structured-output {:result-type :search
                             :data results
                             :total_count (count results)}})
      (catch Exception e
        (log/error e "Error in transform search")
        {:output (str "Search failed: " (or (ex-message e) "Unknown error"))}))))
