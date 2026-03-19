(ns metabase.metabot.agent.tools.search
  "Search tool wrappers for Metabot v3."
  (:require
   [clojure.string :as str]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.instructions :as instructions]
   [metabase.metabot.tools.llm-representations :as llm-rep]
   [metabase.metabot.tools.search :as search-tools]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- format-search-output
  "Format search results as an LLM-ready string."
  [results]
  (let [results-xml (llm-rep/search-results->xml results)]
    (te/lines
     "<result>"
     results-xml
     ""
     (str "Total results: " (count results))
     "</result>"
     "<instructions>"
     instructions/search-result-instructions "</instructions>")))

(defn- invalid-entity-types
  [entity-types allowed]
  (when (seq entity-types)
    (seq (remove allowed entity-types))))

(defn- do-search
  [label allowed-types search-opts {:keys [semantic_queries keyword_queries entity_types] :as _args}]
  (if-let [invalid (invalid-entity-types entity_types allowed-types)]
    {:output (str "Invalid entity_types for " label ": " (pr-str (vec invalid))
                  ". Allowed types: " (str/join ", " (sort allowed-types)) ".")}
    (try
      (let [results (search-tools/search (merge {:semantic-queries semantic_queries
                                                 :term-queries keyword_queries
                                                 :entity-types entity_types
                                                 :limit 10}
                                                search-opts))]
        {:output (format-search-output results)
         :structured-output {:result-type :search
                             :data results
                             :total_count (count results)}})
      (catch Exception e
        (log/error e (str "Error in " label))
        {:output (str "Search failed: " (or (ex-message e) "Unknown error"))}))))

(def ^:private search-schema
  [:map {:closed true}
   [:semantic_queries {:feature :semantic-search} [:sequential :string]]
   [:keyword_queries [:sequential :string]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model" "metric" "dashboard" "question"]]]]])

(defn search-tool "search-tool" []
  {:tool-name "search"
   :doc       "Search for tables, models, metrics, dashboards, and saved questions."
   :schema    [:=> [:cat search-schema] :any]
   :fn        (fn [args]
                (do-search "search" #{"table" "model" "metric" "dashboard" "question"} {} args))})

(def ^:private sql-search-schema
  [:map {:closed true}
   [:semantic_queries {:feature :semantic-search} [:sequential :string]]
   [:keyword_queries [:sequential :string]]
   [:database_id :int]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model"]]]]])

(defn sql-search-tool []
  {:tool-name "search"
   :prompt    "sql_search.md"
   :doc       "Search for SQL-queryable data sources (tables and models) within a database."
   :schema    [:=> [:cat sql-search-schema] :any]
   :fn        (fn [{:keys [database_id] :as args}]
                (do-search "SQL search" #{"table" "model"} {:database-id database_id} args))})

(def ^:private nlq-search-schema
  [:map {:closed true}
   [:semantic_queries {:feature :semantic-search} [:sequential :string]]
   [:keyword_queries [:sequential :string]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "model" "metric" "table"]]]]])

(defn nlq-search-tool []
  {:tool-name "search"
   :prompt    "nql_search.md"
   :doc       "Search for NLQ-queryable data sources (models, metrics, tables)."
   :schema    [:=> [:cat nlq-search-schema] :any]
   :fn        (fn [args]
                (do-search "NLQ search" #{"model" "metric" "table"} {:profile-id "nlq"} args))})

(def ^:private transform-search-schema
  [:map {:closed true}
   [:semantic_queries {:feature :semantic-search} [:sequential :string]]
   [:keyword_queries [:sequential :string]]
   [:search_native_query {:optional true} [:maybe :boolean]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model" "transform"]]]]])

(defn transform-search-tool []
  {:tool-name "search"
   :prompt    "transform_search"
   :doc       "Search for transforms, tables, and models."
   :schema    [:=> [:cat transform-search-schema] :any]
   :fn        (fn [{:keys [search_native_query] :as args}]
                (do-search "transform search" #{"table" "model" "transform"}
                           {:search-native-query search_native_query} args))})
