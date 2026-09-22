(ns metabase.metabot.agent.data-sources
  "Prefetching data sources: the profile's search tool runs on the user's latest prompt while the turn is routed, and
  when routing says the prompt needs data the conversation doesn't know about yet, a System One model keeps the
  results likely to be needed. Their details go into the prompt context, so the agent can use them without searching
  or reading them itself."
  (:require
   [clojure.string :as str]
   [metabase.ai-tracing.core :as ait]
   [metabase.metabot.agent.timing :as timing]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.self.system-one :as s1]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(def search-tool-names
  "Tools that can run the prefetch search, preferred first."
  ["retrieve_library_entities" "search"])

(def ^:private max-candidates 10)

(def ^:private max-described
  "Data sources described in the prompt context. Each carries its full column set and its FK-related tables, so this
  trades context size against how often the agent has to search for a table the prompt needs."
  5)

(def ^:private threshold 0.5)

(def ^:private max-known-fields
  "Field names carried per known table in the routing model's input. Enough for it to judge whether a table already
  covers the attributes a prompt names, bounded so one wide table cannot dominate the routing call."
  40)

(def ^:private max-known-described 3)

(def ^:private query-intents
  "Routing intents whose turn builds or changes a query, and so needs data sources in its context. A turn that only
  restyles a chart or thanks the agent does not, and reading tables for it is pure cost."
  #{:intent-find-or-create-query :intent-modify-previous-query})

(def ^:private field-bearing-uri-types
  "URI types whose `/fields` read carries the columns a query needs; the bare URI only summarizes them."
  #{"table" "model" "question"})

(defn enabled?
  "Whether `profile` prefetches data sources for its turns."
  [profile]
  (boolean (and (:prefetch-data-sources? profile) (s1/available?))))

(defn known-data-sources
  "The data sources `conversation-id` has already queried, as the routing model reads them. Each carries its field
  names: without them the model cannot tell whether a known table covers an attribute the prompt names, and assumes
  it does."
  [conversation-id]
  (when conversation-id
    (let [tables     (metabot.db/conversation-used-tables conversation-id)
          id->fields (metabot.db/table-field-names (map :id tables))]
      (mapv (fn [{:keys [id display_name schema database_name] table-name :name}]
              (cond-> {:type    "table" :name table-name :display_name display_name
                       :schema  schema  :database database_name}
                (seq (id->fields id)) (assoc :fields (vec (take max-known-fields (id->fields id))))))
            tables))))

(defn- search-args [tool-name prompt subjects]
  (if (= tool-name "retrieve_library_entities")
    {:user_search_prompt prompt}
    {:semantic_queries [prompt]
     ;; A follow-up prompt names the change, not its subject — "break it down by acquisition source" has no
     ;; searchable subject of its own — so the tables the conversation is already working with go in as well.
     :keyword_queries  (into [prompt] (distinct subjects))}))

(defn start-search
  "Start the first of [[search-tool-names]] in `tools` (tool name -> tool definition map) searching for `prompt` in
  the background, alongside the names of the data sources the conversation already works with (`subjects`). Returns
  a future of `{:args :result}`, or nil when `tools` has no search tool."
  [tools prompt subjects]
  (when-let [tool-name (some #(when (contains? tools %) %) search-tool-names)]
    (let [search-fn (get-in tools [tool-name :fn])
          args      (search-args tool-name prompt subjects)]
      (future
        (timing/timed {:kind :prefetch-search :tool tool-name}
                      {:args args :result (search-fn args)})))))

(defn- candidate-uri [{:keys [id type]}]
  (when id
    (when-let [uri-type (llm-shape/search-result-uri-type type)]
      (if (field-bearing-uri-types uri-type)
        (llm-shape/metabase-uri uri-type id "fields")
        (llm-shape/metabase-uri uri-type id)))))

(defn- candidate-summary [result]
  (-> (select-keys result [:type :name :display_name :description :database_name :verified
                           :matched_text :usage_instructions])
      (assoc :collection (get-in result [:collection :name]))
      (update-vals #(if (keyword? %) (name %) %))))

(defn- candidate-question [i]
  (s1/noul (str "`candidates[" i "]` would be used in the query or content that answers `user_prompt`, which was "
                "searched for with `search_queries`.")
           {:true  (str "Its name, type, and description match what `user_prompt` asks about, or it holds the names, "
                        "labels, or categories `user_prompt` asks to see, group by, or filter on that another "
                        "candidate carries only as an id. Several candidates can qualify, such as copies of the same "
                        "table in different databases. Example: an orders table for \"show me orders over time\"; "
                        "both a race results table and a drivers table for \"which drivers won a race\"; both an "
                        "orders table and a products table for \"revenue by product category\"; or the dashboard "
                        "the user named.")
            :false "It is only loosely related, or about a different subject than `user_prompt`."}))

(defn- search-queries [{:keys [semantic_queries keyword_queries user_search_prompt]}]
  (vec (distinct (concat semantic_queries keyword_queries (some-> user_search_prompt vector)))))

(defn- likely-candidates
  "The `results` a System One model judges likely to be needed for `prompt`, most likely first, each with its
  read_resource URI under `::uri`."
  [prompt search-args results tracking-opts]
  (let [candidates (->> results
                        (keep #(when-let [uri (candidate-uri %)] (assoc % ::uri uri)))
                        (take max-candidates)
                        vec)]
    (when (seq candidates)
      (let [answers (:answers (s1/ask {:user_prompt    prompt
                                       :search_queries (search-queries search-args)
                                       :candidates     (mapv candidate-summary candidates)}
                                      (into {} (map-indexed (fn [i _] [(keyword (str "candidate-" i)) (candidate-question i)]))
                                            candidates)
                                      {:tracking-opts (assoc tracking-opts :tag "data-sources")}))]
        (->> candidates
             (map-indexed (fn [i c] [(get-in answers [(keyword (str "candidate-" i)) :noul] 0) c]))
             (filter #(>= (first %) threshold))
             (sort-by first >)
             (take max-described)
             (mapv second))))))

(defn- reference
  "How construct_notebook_query refers to `candidate`, spelled out so the agent copies it instead of assembling it:
  a table's portable FK names its schema, which can be null."
  [{:keys [type name database_name database_schema portable_entity_id]}]
  (let [type-name (some-> type clojure.core/name)]
    (cond
      (= "table" type-name) (str "- " name " (table): source-table " (json/encode [database_name database_schema name]))
      portable_entity_id    (str "- " name " (" type-name "): portable_entity_id " (json/encode portable_entity_id)))))

(defn- block
  "The `<relevant_data_sources>` context for `candidates`, read with `read-resource-fn` under `timing-kind`, or nil
  when there are none."
  [candidates read-resource-fn timing-kind header]
  (when (and read-resource-fn (seq candidates))
    (let [uris             (mapv ::uri candidates)
          references       (keep reference candidates)
          {:keys [output]} (timing/timed {:kind timing-kind} (read-resource-fn {:uris uris}))]
      (log/info "Described data sources" {:kind timing-kind :uris uris})
      (str "<relevant_data_sources>\n"
           header
           (when (seq references)
             (str "Exact references for construct_notebook_query; copy them as written:\n"
                  (str/join "\n" references)
                  "\n"))
           output
           "\n</relevant_data_sources>"))))

(def ^:private prefetched-header
  (str "Found by searching for the user's latest message before this turn, across every kind of data source "
       "(tables, models, metrics, and saved questions), together with the ones this conversation has already "
       "queried. They are already read with their fields: build from them directly, and search again only if they "
       "don't fit the request.\n"))

(def ^:private known-header
  (str "The data sources this conversation has already queried, read with their fields. Build from them directly, "
       "and search only if the request needs something they do not cover.\n"))

(defn needs-data-context?
  "Whether `routing` describes a turn that builds or changes a query, and so needs data sources in its context."
  [routing]
  (boolean (some query-intents (:intents routing))))

(defn known-data-source-candidates
  "The data sources `conversation-id` has already queried, most recently used first and shaped like search results so
  they can be described alongside prefetched ones. Nil when the turn does not build or change a query."
  [conversation-id routing]
  (when (and conversation-id (needs-data-context? routing))
    (mapv (fn [{:keys [id schema] :as table}]
            (assoc table
                   :type            "table"
                   :database_schema schema
                   ::uri            (llm-shape/metabase-uri "table" id "fields")))
          (take max-known-described (metabot.db/conversation-used-tables conversation-id)))))

(defn describe
  "The `<relevant_data_sources>` prompt context for the results of `search` (from [[start-search]]) likely needed to
  answer `prompt`, read with `read-resource-fn`, or nil when there are none.

  `known` (from [[known-data-source-candidates]]) are described alongside whatever the search turns up: a prefetched
  turn issues no search or read of its own, so nothing else carries the tables the conversation is already working
  with into the next turn. `tracking-opts` attribute the System One call in usage analytics, as for [[s1/ask]]."
  [search prompt read-resource-fn known tracking-opts]
  (with-span :info {:name :metabot.agent/prefetch-data-sources}
    (ait/eval-span "agent.prefetch-data-sources" {}
                   (try
                     (let [{:keys [args result]} @search
                           results    (get-in result [:structured-output :data])
                           candidates (when (and read-resource-fn (seq results))
                                        (likely-candidates prompt args results tracking-opts))
                           found-uris (into #{} (map ::uri) candidates)]
                       (block (concat candidates (remove (comp found-uris ::uri) known))
                              read-resource-fn :prefetch-read prefetched-header))
                     (catch Exception e
                       (log/warn e "Prefetching data sources failed; running the agent without them")
                       nil)))))

(defn describe-known
  "The `<relevant_data_sources>` prompt context for `known` (from [[known-data-source-candidates]]), read with
  `read-resource-fn`, or nil when there are none.

  A turn that needs no new data sources still needs these in context: prefetching means a turn can answer without
  issuing a search or read of its own, so nothing in the message history carries those tables' details forward."
  [known read-resource-fn]
  (with-span :info {:name :metabot.agent/known-data-sources}
    (try
      (block known read-resource-fn :known-read known-header)
      (catch Exception e
        (log/warn e "Carrying known data sources failed; running the agent without them")
        nil))))
