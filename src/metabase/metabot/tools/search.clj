(ns metabase.metabot.tools.search
  "Search tool wrappers for Metabot v3."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.search-models :as metabot.search-models]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private metabot-search-models
  #{"table" "dataset" "card" "dashboard" "metric" "database" "transform"})

(defn- postprocess-search-result
  "Transform a single search result to match the appropriate entity-specific schema."
  [{:keys [verified moderated_status collection] :as result}]
  (let [model (:model result)
        verified? (or (boolean verified) (= moderated_status "verified"))
        collection-info (select-keys collection [:id :name :authority_level])
        common-fields {:id          (:id result)
                       :type        (metabot.search-models/search-model->entity-type model)
                       :name        (:name result)
                       :description (:description result)
                       :updated_at  (:updated_at result)
                       :created_at  (:created_at result)}]
    (case model
      "database"
      common-fields

      "table"
      (merge common-fields
             {:name            (:table_name result)
              :display_name    (:name result)
              :database_id     (:database_id result)
              :database_schema (:table_schema result)})

      "dashboard"
      (merge common-fields
             {:verified    verified?
              :collection  collection-info})

      "transform"
      (merge common-fields
             {:database_id (:database_id result)})

      ;; Questions, metrics, and datasets
      (merge common-fields
             {:database_id (:database_id result)
              :verified    verified?
              :collection  collection-info}))))

(defn- enrich-with-collection-descriptions
  "Fetch and merge collection descriptions for all search results that have collection IDs."
  [results]
  (let [coll-ids     (->> results (keep #(get-in % [:collection :id])) distinct)
        descriptions (when (seq coll-ids)
                       (t2/select-pk->fn :description :model/Collection :id [:in coll-ids]))]
    (cond->> results
      (seq descriptions) (mapv (fn [r]
                                 (let [cid (-> r :collection :id)]
                                   (update r :collection m/assoc-some :description (get descriptions cid))))))))

(defn- enrich-with-database-engines
  "Fetch and merge database engine + name info for search results that have database IDs.
  `:database_name` is the human-readable name the LLM needs as the first slot of every
  portable FK in `construct_notebook_query`; surfacing it on every table/model search
  result means the LLM doesn't need a separate `entity_details` round-trip just to learn
  the DB name."
  [results]
  (let [db-ids (->> results (keep :database_id) distinct)
        id->db (when (seq db-ids)
                 (t2/select-pk->fn (juxt :engine :name) :model/Database :id [:in db-ids]))]
    (cond->> results
      (seq id->db) (mapv (fn [r]
                           (let [[engine db-name] (get id->db (:database_id r))]
                             (-> r
                                 (m/assoc-some :database_engine engine)
                                 (m/assoc-some :database_name db-name))))))))

(defn- enrich-with-portable-entity-ids
  "Attach `:portable_entity_id` (the card's `entity_id` NanoID) to saved-question, model,
  and metric search results so the LLM can use it verbatim as `source-card:` (for
  questions/models) or inside a `[metric, {}, <entity_id>]` aggregation clause (for
  metrics) without a follow-up `entity_details` / `read_resource` round-trip."
  [results]
  (let [carded-types #{"question" "model" "metric"}
        card-ids (->> results
                      (filter #(carded-types (:type %)))
                      (keep :id)
                      distinct)
        id->eid  (when (seq card-ids)
                   (t2/select-pk->fn :entity_id :model/Card :id [:in card-ids]))]
    (cond->> results
      (seq id->eid) (mapv (fn [r]
                            (if-let [eid (and (carded-types (:type r))
                                              (get id->eid (:id r)))]
                              (assoc r :portable_entity_id eid)
                              r))))))

(defn- enrich-with-metric-base-tables
  "Attach base-table info (`:base_table_id`, `:base_table_name`, `:base_table_schema`,
  `:base_table_portable_fk`) to metric search results.

  A metric is a Card whose `:dataset_query` aggregates a specific table; the LLM needs that
  table's portable FK as the `source-table:` when it wants to use the metric. Without this
  enrichment the LLM sees the metric's `portable_entity_id` in search but has to either
  hallucinate the base table (observed failure mode: `[<db>, public, customers]`) or do an
  extra `entity_details` round-trip. We read the two columns directly from
  `report_card.table_id` + `metabase_table.{schema,name}` to keep the lookup O(1) extra
  query per search call, regardless of number of metrics in the result set.

  Requires `:database_name` to already be set on each metric result (done earlier by
  [[enrich-with-database-engines]]) so we can assemble the full portable FK
  `[database_name, schema, table]`."
  [results]
  (let [metric-ids (->> results (filter #(= "metric" (:type %))) (keep :id) distinct)
        card-id->table-id (when (seq metric-ids)
                            (t2/select-pk->fn :table_id :model/Card :id [:in metric-ids]))
        table-ids (->> card-id->table-id vals (remove nil?) distinct)
        table-id->info (when (seq table-ids)
                         (t2/select-pk->fn (juxt :schema :name) :model/Table :id [:in table-ids]))]
    (cond->> results
      (seq card-id->table-id)
      (mapv (fn [r]
              (if (= "metric" (:type r))
                (if-let [table-id (get card-id->table-id (:id r))]
                  (let [[schema table-name] (get table-id->info table-id)
                        db-name (:database_name r)]
                    (cond-> (assoc r :base_table_id table-id)
                      table-name (assoc :base_table_name table-name
                                        :base_table_schema schema)
                      (and db-name table-name)
                      (assoc :base_table_portable_fk [db-name schema table-name])))
                  r)
                r))))))

(defn- remove-unreadable-transforms
  "Remove transforms from search results that the user cannot read.
  This filters out transforms where the user doesn't have access to the source tables/database."
  [results]
  (let [transform-ids (->> results (filter #(= "transform" (:type %))) (map :id) set)
        readable-ids (when (seq transform-ids)
                       (->> (t2/select :model/Transform :id [:in transform-ids])
                            transforms/add-source-readable
                            (filter :source_readable)
                            (map :id)
                            set))]
    (cond->> results
      (seq transform-ids) (filterv (fn [result]
                                     (or (not= "transform" (:type result))
                                         (contains? readable-ids (:id result))))))))

(defn- search-result-id
  "Generate a unique identifier for a search result based on its id and model."
  [search-result]
  ((juxt :id :model) search-result))

(defn- reciprocal-rank-fusion
  "Combine multiple ranked search result lists using Reciprocal Rank Fusion (RRF).

  Takes a list of search result lists and combines them by:
  1. Calculating RRF scores for each item based on its rank in each list
  2. Summing scores for items that appear in multiple lists
  3. Returning items sorted by total RRF score (descending)

  The RRF score is calculated as: 1 / (k + r) where k defaults to 60 (typical RRF constant)"
  ([result-lists]
   (reciprocal-rank-fusion result-lists 60))
  ([result-lists k]
   ;; Remove empty result lists, as they're common, and can save a lot of work.
   (let [result-lists (keep seq result-lists)]
     (if (<= (count result-lists) 1)
       (first result-lists)
       (let [rrf-results (reduce
                          (fn [acc-map result-list]
                            (reduce-kv
                             (fn [acc rank search-result]
                               (let [id        (search-result-id search-result)
                                     rrf-score (/ 1.0 (+ k (inc rank)))]
                                 (if (contains? acc id)
                                   (update-in acc [id :rrf] + rrf-score)
                                   (assoc acc id {:search-result search-result
                                                  :rrf           rrf-score}))))
                             acc-map
                             (vec result-list)))
                          {}
                          result-lists)]
         (->> rrf-results
              vals
              (sort-by :rrf >)
              (map :search-result)))))))

(defn- join-results-by-rrf
  "Execute multiple search queries in parallel and combine results using Reciprocal Rank Fusion.
   Items appearing in multiple result lists are boosted in the final ranking.
   May return more results than requested limit."
  [search-fn search-engine all-queries]
  ;; Zero queries case is handled nicely by the >1 branch
  (if (= 1 (count all-queries))
    (search-fn (first all-queries) search-engine)
    ;; Create futures for parallel execution
    (let [futures      (mapv #(future (search-fn % search-engine)) all-queries)
          result-lists (mapv deref futures)]
      (reciprocal-rank-fusion result-lists))))

(defn search
  "Search for data sources (tables, models, cards, dashboards, metrics, transforms) in Metabase.
  Abstracted from the API endpoint logic."
  [{:keys [term-queries semantic-queries database-id created-at last-edited-at
           entity-types limit metabot-id profile-id search-native-query weights]}]
  (log/infof "[METABOT-SEARCH] Starting search with params: %s"
             {:term-queries        term-queries
              :semantic-queries    semantic-queries
              :database-id         database-id
              :created-at          created-at
              :last-edited-at      last-edited-at
              :entity-types        entity-types
              :limit               limit
              :metabot-id          metabot-id
              :profile-id          profile-id
              :search-native-query search-native-query
              :weights             weights})
  (let [search-models   (if (seq entity-types)
                          (set (distinct (keep metabot.search-models/entity-type->search-model entity-types)))
                          metabot-search-models)
        _               (log/infof "[METABOT-SEARCH] Converted entity-types %s to search-models %s" entity-types search-models)
        metabot         (t2/select-one :model/Metabot :entity_id (get-in metabot.config/metabot-config [metabot-id :entity-id] metabot-id))
        use-verified?   (if metabot-id
                          (:use_verified_content metabot)
                          false)
        embedded-metabot?  (= metabot-id metabot.config/embedded-metabot-id)
        collection-id   (when (or embedded-metabot? (= profile-id "nlq"))
                          (:collection_id metabot))
        limit           (or limit 50)
        search-fn       (fn [search-string search-engine]
                          (let [search-context (search/search-context
                                                (cond-> {:search-string                       search-string
                                                         :models                              search-models
                                                         :table-db-id                         database-id
                                                         :created-at                          created-at
                                                         :last-edited-at                      last-edited-at
                                                         :current-user-id                     api/*current-user-id*
                                                         :is-impersonated-user?               (perms/impersonated-user?)
                                                         :is-sandboxed-user?                  (perms/sandboxed-user?)
                                                         :is-superuser?                       api/*is-superuser?*
                                                         :current-user-perms                  @api/*current-user-permissions-set*
                                                         :filter-items-in-personal-collection "exclude-others"
                                                         :context                             :metabot
                                                         :archived                            false
                                                         :limit                               limit
                                                         :offset                              0}
                                                  ;; Don't include search-native-query key if nil so that we don't
                                                  ;; inadvertently filter out search models that don't support it
                                                  search-native-query
                                                  (assoc :search-native-query (boolean search-native-query))
                                                  use-verified?
                                                  (assoc :verified true)
                                                  weights
                                                  (assoc :weights weights)
                                                  search-engine
                                                  (assoc :search-engine (name search-engine))
                                                  collection-id
                                                  (assoc :collection collection-id)))
                                _              (log/infof "[METABOT-SEARCH] Search context models for query '%s': %s"
                                                          search-string (:models search-context))
                                search-results (search/search search-context)
                                data           (:data search-results)
                                result-models  (frequencies (map :model data))]
                            (log/infof "[METABOT-SEARCH] Query '%s' returned entity types: %s" search-string result-models)
                            data))
        search-fn*      (fn [search-engine queries]
                          (let [queries (search.engine/disjunction search-engine queries)]
                            (join-results-by-rrf search-fn search-engine queries)))
        ;; NOTE: if we add more semantic engines, e.g. 3rd party vector dbs, we'll need to make this more maintainable
        semantic?       #{:search.engine/semantic}
        semantic-engine (u/seek semantic? (search.engine/active-engines))
        fallback-engine (when semantic-engine
                          (u/seek (comp not semantic?) (search.engine/supported-engines)))
        fused-results   (if semantic-engine
                          ;; Perform semantic and non-semantic search respectively, then fuse results.
                          (reciprocal-rank-fusion
                           (map (fn [[engine queries]] (when (seq queries) (search-fn* engine queries)))
                                {semantic-engine semantic-queries
                                 fallback-engine term-queries}))
                          ;; Search for all the terms on equal footing, using the default engine.
                          (search-fn* nil (distinct (concat term-queries semantic-queries))))]
    (->> fused-results
         (take limit)
         (map postprocess-search-result)
         enrich-with-collection-descriptions
         enrich-with-database-engines
         enrich-with-portable-entity-ids
         enrich-with-metric-base-tables
         remove-unreadable-transforms)))

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
      (let [results (search (merge {:semantic-queries semantic_queries
                                    :term-queries    keyword_queries
                                    :entity-types    entity_types
                                    :metabot-id      shared/*metabot-id*
                                    :limit           10}
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
   [:semantic_queries {:optional true :feature :semantic-search} [:sequential :string]]
   [:keyword_queries {:optional true} [:sequential :string]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model" "metric" "dashboard" "question"]]]]])

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search}
  search-tool
  "Search for tables, models, metrics, dashboards, and saved questions."
  [args :- search-schema]
  (do-search "search" #{"table" "model" "metric" "dashboard" "question"} {} args))

(def ^:private sql-search-schema
  [:map {:closed true}
   [:semantic_queries {:optional true :feature :semantic-search} [:sequential :string]]
   [:keyword_queries {:optional true} [:sequential :string]]
   [:database_id :int]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model"]]]]])

(mu/defn ^{:tool-name "search"
           :prompt    "sql_search.md"
           :scope     scope/agent-search}
  sql-search-tool
  "Search for SQL-queryable data sources (tables and models) within a database."
  [{:keys [database_id] :as args} :- sql-search-schema]
  (do-search "SQL search" #{"table" "model"} {:database-id database_id} args))

(def ^:private nlq-search-schema
  [:map {:closed true}
   [:semantic_queries {:optional true :feature :semantic-search} [:sequential :string]]
   [:keyword_queries {:optional true} [:sequential :string]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "model" "metric" "table"]]]]])

(mu/defn ^{:tool-name "search"
           :prompt    "nlq_search.md"
           :scope     scope/agent-search}
  nlq-search-tool
  "Search for NLQ-queryable data sources (models, metrics, tables)."
  [args :- nlq-search-schema]
  (do-search "NLQ search" #{"model" "metric" "table"} {:profile-id "nlq"} args))

(def ^:private transform-search-schema
  [:map {:closed true}
   [:semantic_queries {:optional true :feature :semantic-search} [:sequential :string]]
   [:keyword_queries {:optional true} [:sequential :string]]
   [:search_native_query {:optional true} [:maybe :boolean]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model" "transform"]]]]])

(mu/defn ^{:tool-name "search"
           :prompt    "transform_search"
           :scope     scope/agent-search}
  transform-search-tool
  "Search for transforms, tables, and models."
  [{:keys [search_native_query] :as args} :- transform-search-schema]
  (do-search "transform search" #{"table" "model" "transform"}
             {:search-native-query search_native_query} args))
