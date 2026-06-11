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
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.models.interface :as mi]
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
  (sorted-set "card" "dashboard" "database" "dataset" "metric" "table" "transform"))

(defn- postprocess-search-result
  "Transform a single search result to match the appropriate entity-specific schema."
  [{:keys [verified moderated_status collection data_authority curated data_layer] :as result}]
  (let [model (:model result)
        verified? (or (boolean verified) (= moderated_status "verified"))
        collection-info (select-keys collection [:id :name :authority_level])
        ;; Curation signals beyond verified, so the LLM can see *why* content is curated. `:curated` is
        ;; the precomputed rollup (present on the appdb/semantic engines); `:data_layer` is table-only.
        ;; assoc-some keeps them off results that don't carry them (e.g. the in-place fallback).
        official? (= "official" (:authority_level collection-info))
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
      (-> common-fields
          (merge {:name            (:table_name result)
                  :display_name    (:name result)
                  :database_id     (:database_id result)
                  :database_schema (:table_schema result)
                  :official        official?
                  :data_authority  data_authority})
          (m/assoc-some :curated curated :data_layer data_layer))

      "dashboard"
      (-> common-fields
          (merge {:verified   verified?
                  :official   official?
                  :collection collection-info})
          (m/assoc-some :curated curated))

      "transform"
      (merge common-fields
             {:database_id (:database_id result)})

      ;; Questions, metrics, and datasets
      (-> common-fields
          (merge {:database_id (:database_id result)
                  :verified    verified?
                  :official    official?
                  :collection  collection-info})
          (m/assoc-some :curated curated)))))

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
                                                  (assoc :curated true)
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

(defn- table-refs->results
  [ids]
  (when (seq ids)
    ;; only surface tables the current user can read — a curated entry may point at one they can't access
    (for [t (filter mi/can-read?
                    (t2/select [:model/Table :id :name :display_name :db_id :schema :description] :id [:in ids]))]
      {:id              (:id t)
       :type            "table"
       :name            (:name t)
       :display_name    (:display_name t)
       :database_id     (:db_id t)
       :database_schema (:schema t)
       :description     (:description t)})))

(defn- card-refs->results
  "Build post-processed search-result records for card-backed refs (`{:id .. :type \"model\"|\"metric\"|\"question\"}`).
  Emits one record per ref, so the same card registered under two type strings yields a record for each
  (rather than collapsing to one and silently dropping the other)."
  [refs]
  (let [ids       (distinct (map :id refs))
        ;; only surface cards the current user can read (collection perms) — see table-refs->results
        id->card  (when (seq ids)
                    (into {} (map (juxt :id identity))
                          (filter mi/can-read?
                                  (t2/select [:model/Card :id :name :description :database_id :collection_id :card_schema]
                                             :id [:in ids]))))
        coll-ids  (->> (vals id->card) (keep :collection_id) distinct)
        id->coll  (when (seq coll-ids)
                    (into {} (map (juxt :id identity))
                          (t2/select [:model/Collection :id :name :authority_level] :id [:in coll-ids])))
        ;; verified is already a set (t2/select-fn-set), possibly nil when there were no ids
        verified  (when (seq ids)
                    (t2/select-fn-set :moderated_item_id :model/ModerationReview
                                      :moderated_item_id [:in ids] :moderated_item_type "card"
                                      :most_recent true :status "verified"))]
    (for [{:keys [id type]} refs
          :let [c (id->card id)]
          :when c]
      (let [coll (get id->coll (:collection_id c))]
        {:id          id
         :type        type
         :name        (:name c)
         :description (:description c)
         :database_id (:database_id c)
         :verified    (contains? verified id)
         :collection  (when coll (select-keys coll [:id :name :authority_level]))}))))

(defn ref-model->entity-type
  "Normalize an entity ref's `:model` string to the agent-facing entity type: plain cards are
  `\"question\"` everywhere the agent sees them (`read_resource` URIs, search results)."
  [model]
  (if (= model "card") "question" model))

(defn entity-refs->search-results
  "Hydrate semantic-layer entity refs into the enriched search-result shape that
  [[metabase.metabot.tools.shared.llm-shape/search-results->xml]] and the `search` tool consume.

  `refs` is a seq of `{:model <entity-type> :id <id>}` where `<entity-type>` is `\"table\"`, `\"model\"`,
  `\"metric\"`, or `\"question\"` (the names the agent uses with `read_resource`); `\"card\"` is accepted
  and normalized to `\"question\"`.
  Returns records carrying `:portable_entity_id`, `:database_name`, fully-qualified names, metric base
  tables, etc. — everything the LLM needs to build a query without an extra round-trip.
  Refs whose entity no longer exists are dropped."
  [refs]
  (let [by-model  (group-by (comp ref-model->entity-type :model) refs)
        table-ids (distinct (map :id (get by-model "table")))
        card-refs (for [m ["model" "metric" "question"], r (get by-model m)] {:id (:id r) :type m})]
    (->> (concat (table-refs->results table-ids)
                 (card-refs->results (distinct card-refs)))
         enrich-with-collection-descriptions
         enrich-with-database-engines
         enrich-with-portable-entity-ids
         enrich-with-metric-base-tables
         remove-unreadable-transforms)))

(defn- format-search-output
  "Format search results as an LLM-ready string."
  [results]
  (let [results-xml (llm-shape/search-results->xml results)]
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

(def ^:private default-search-limit 10)
(def ^:private max-search-limit 50)

;; Field-level descriptions surface to the model as JSON-Schema `description`s on the
;; tool's input parameters (via `malli.json-schema` in `metabase.metabot.self.claude`).
;; This is where per-parameter guidance lives; cross-tool search *strategy* (navigate
;; first, drill instead of re-searching, one search per concept) lives in the system
;; prompt's discovery section, not here.
(def ^:private semantic-query-desc
  (str "A natural-language description of what you're looking for, matched by vector similarity. "
       "Prefer one focused query that captures the user's intent; add another only to cover a "
       "genuinely different facet of the request, not a reworded synonym."))

(def ^:private keyword-query-desc
  (str "A distinctive keyword matched against names and descriptions via full-text search. "
       "Provide a few of the most salient terms from the request; entities matching more of them rank higher."))

(def ^:private entity-types-desc
  "Restrict results to these entity types. Omit to search across all types this tool supports.")

(def ^:private limit-desc
  (str "Maximum number of results (default " default-search-limit ", max " max-search-limit "). "
       "Use a larger value (20–50) for broad or generic queries; keep the default for narrow, specific ones."))

(defn- do-search
  [label allowed-types search-opts {:keys [semantic_queries keyword_queries entity_types limit] :as _args}]
  (if-let [invalid (invalid-entity-types entity_types allowed-types)]
    {:output (str "Invalid entity_types for " label ": " (pr-str (vec invalid))
                  ". Allowed types: " (str/join ", " allowed-types) ".")}
    (try
      (let [results (search (merge {:semantic-queries semantic_queries
                                    :term-queries    keyword_queries
                                    :entity-types    (or (seq entity_types) (vec allowed-types))
                                    :metabot-id      shared/*metabot-id*
                                    :limit           (min max-search-limit
                                                          (or limit default-search-limit))}
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
   [:semantic_queries {:optional true :feature :semantic-search} [:sequential [:string {:description semantic-query-desc}]]]
   [:keyword_queries {:optional true} [:sequential [:string {:description keyword-query-desc}]]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum {:description entity-types-desc} "table" "model" "metric" "dashboard" "question"]]]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-search-limit :description limit-desc}]]]])

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search}
  search-tool
  "Find tables, models, metrics, dashboards, and saved questions by topic across the instance. Use it when you don't know where something lives; once you have a hit, drill into it with read_resource rather than searching the same concept again."
  [args :- search-schema]
  (do-search "search" (sorted-set "dashboard" "metric" "model" "question" "table") {} args))

(def ^:private sql-search-schema
  [:map {:closed true}
   [:semantic_queries {:optional true :feature :semantic-search} [:sequential [:string {:description semantic-query-desc}]]]
   [:keyword_queries {:optional true} [:sequential [:string {:description keyword-query-desc}]]]
   [:database_id [:int {:description "ID of the database to search — use the database currently selected in the SQL editor."}]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum {:description entity-types-desc} "table" "model"]]]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-search-limit :description limit-desc}]]]])

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search}
  sql-search-tool
  "Find SQL-queryable data sources (tables and models) within a specific database by topic."
  [{:keys [database_id] :as args} :- sql-search-schema]
  (do-search "SQL search" (sorted-set "model" "table") {:database-id database_id} args))

(def ^:private nlq-search-schema
  [:map {:closed true}
   [:semantic_queries {:optional true :feature :semantic-search} [:sequential [:string {:description semantic-query-desc}]]]
   [:keyword_queries {:optional true} [:sequential [:string {:description keyword-query-desc}]]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum {:description entity-types-desc} "table" "model" "metric" "question"]]]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-search-limit :description limit-desc}]]]])

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search}
  nlq-search-tool
  "Find NLQ-queryable data sources (tables, models, metrics, saved questions) by topic, to build a visualization from."
  [args :- nlq-search-schema]
  (do-search "NLQ search" (sorted-set "metric" "model" "question" "table") {:profile-id "nlq"} args))

(def ^:private transform-search-schema
  [:map {:closed true}
   [:semantic_queries {:optional true :feature :semantic-search} [:sequential [:string {:description semantic-query-desc}]]]
   [:keyword_queries {:optional true} [:sequential [:string {:description keyword-query-desc}]]]
   [:search_native_query {:optional true} [:maybe [:boolean {:description "Also match against the native SQL text of transforms, not just names and descriptions."}]]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum {:description entity-types-desc} "table" "model" "transform"]]]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-search-limit :description limit-desc}]]]])

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search}
  transform-search-tool
  "Find transforms, plus the tables and models around them, by topic."
  [{:keys [search_native_query] :as args} :- transform-search-schema]
  (do-search "transform search" (sorted-set "model" "table" "transform")
             {:search-native-query search_native_query} args))
