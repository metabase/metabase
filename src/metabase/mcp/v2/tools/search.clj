(ns metabase.mcp.v2.tools.search
  "The v2 MCP `search` tool: one entry point for discovery, backed by the v1 metabot search
   pipeline (each query runs separately, results merged by rank). Three explicit modes —
   ranked queries, filters-only listing, and recents — plus a server-side snippet union
   (snippets aren't in the search index). Every unsupported parameter combination is a
   teaching error; the engine's silent narrowing is never relied on."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.api.common :as api]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.metabot.tools.search :as metabot.search]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Type tables ---------------------------------------------------

(def ^:private all-types
  ["question" "model" "metric" "measure" "segment" "dashboard" "document" "collection"
   "table" "database" "snippet" "transform" "action"])

(def ^:private created-by-types
  "Types whose search model indexes a creator (`in_place/filter.clj`'s created-by methods);
   `created_by` with any other type is a teaching error rather than the engine's silent narrowing."
  #{"question" "model" "metric" "dashboard" "document" "measure" "action"})

(def ^:private collectionless-types
  "Types the collection filter can never serve — they don't live in collections."
  #{"measure" "segment" "database"})

(def ^:private type->rv-model
  "v2 type → the recent-views model keyword; the domain of this map is exactly the set of
   types recents tracks."
  {"question"   :card
   "model"      :dataset
   "metric"     :metric
   "dashboard"  :dashboard
   "table"      :table
   "collection" :collection
   "document"   :document})

(def ^:private rv-model->type
  (into {} (map (fn [[t rvm]] [rvm t])) type->rv-model))

;;; ------------------------------------------------ Projections ---------------------------------------------------

(def ^:private concise-row-keys
  [:type :id :name :collection_path :description])

(projections/register-projection!
 :search-result
 {:concise  (fn [row]
              (into {} (remove (comp nil? val)) (select-keys row concise-row-keys)))
  :detailed identity
  :sample   {:id                     1
             :type                   "question"
             :name                   "x"
             :description            "x"
             :created_at             "x"
             :updated_at             "x"
             :collection             {:id 1 :name "x" :authority_level "official" :description "x"}
             :collection_path        "x"
             :location               "x"
             :database_id            1
             :database_engine        "x"
             :database_name          "x"
             :database_schema        "x"
             :display_name           "x"
             :verified               true
             :official               true
             :curated                true
             :data_authority         "x"
             :data_layer             "x"
             :model_id               1
             :table_id               1
             :table_name             "x"
             :table_schema           "x"
             :portable_entity_id     "x"
             :base_table_id          1
             :base_table_name        "x"
             :base_table_schema      "x"
             :base_table_portable_fk ["x"]}})

;;; --------------------------------------------- Collection paths -------------------------------------------------

(defn- location->ids
  [location]
  (when location
    (mapv parse-long (re-seq #"\d+" location))))

(defn- readable-id->name
  "Map of collection id -> name for the given ids, omitting collections the current user cannot
   read. `:namespace` and `:type` are selected because [[mi/can-read?]] consults them."
  [ids]
  (when (seq ids)
    (into {}
          (comp (filter mi/can-read?)
                (map (juxt :id :name)))
          (t2/select [:model/Collection :id :name :namespace :type] :id [:in ids]))))

(defn- add-collection-paths
  "Attach `:collection_path` — ancestor collection names joined with `/`, ending in the
   containing collection's own name — to every row that has a `:collection`. Collection rows
   use their own `:location` (path of their ancestors). Two batched lookups total; rows with
   no collection context (root items, snippets, tables, databases) get no path.

   Ancestors the current user cannot read are omitted from the path, matching the breadcrumb
   semantics of [[metabase.collections.models.collection/effective-ancestors]]: for A > B > C
   where B is unreadable, the path reads \"A/C\"."
  [rows]
  (let [parent-ids     (into #{} (keep #(get-in % [:collection :id])) rows)
        parents        (when (seq parent-ids)
                         (t2/select-fn->fn :id (juxt :name :location)
                                           [:model/Collection :id :name :location]
                                           :id [:in parent-ids]))
        ancestor-ids   (into #{}
                             (comp (mapcat location->ids)
                                   (remove parent-ids))
                             (concat (map second (vals parents))
                                     (keep :location rows)))
        id->name       (merge (readable-id->name ancestor-ids)
                              (update-vals parents first))
        location-path  (fn [location]
                         (when-let [segments (seq (keep id->name (location->ids location)))]
                           (str/join "/" segments)))]
    (mapv (fn [row]
            (let [parent-id     (get-in row [:collection :id])
                  [pname ploc]  (get parents parent-id)
                  path          (cond
                                  pname           (str/join "/" (concat (keep id->name (location->ids ploc))
                                                                        [pname]))
                                  (:location row) (location-path (:location row)))]
              (m/assoc-some row :collection_path path)))
          rows)))

;;; ------------------------------------------------ Validation ----------------------------------------------------

(defn- validate-modes!
  [{:keys [recent] :as args} queries? filters?]
  (when (and (true? recent) queries?)
    (common/throw-teaching-error
     (str "recent: true returns your recently viewed items and cannot be combined with "
          "term_queries or semantic_queries — drop the queries or drop recent.")))
  (when-not (or queries? filters? (true? recent))
    (common/throw-teaching-error
     (str "Nothing to search for — pass queries (term_queries and/or semantic_queries), "
          "filters (type, collection_id, created_by, archived) for a listing, "
          "or recent: true for your recently viewed items.")))
  args)

(defn- validate-filters!
  [{:keys [type created_by archived] :as args}]
  (let [types (set type)]
    (when (and (contains? types "snippet") (next types))
      (common/throw-teaching-error
       (format (str "type: [\"snippet\"] cannot be combined with other types — snippets aren't in the "
                    "search index and are paged separately. List them in their own call, and search %s in another.")
               (str/join ", " (sort (disj types "snippet"))))))
    (when created_by
      (when-let [bad (seq (sort (remove created-by-types types)))]
        (common/throw-teaching-error
         (format "created_by only applies to types that index a creator: %s. Remove %s from type or drop created_by."
                 (str/join ", " (sort created-by-types))
                 (str/join ", " bad)))))
    (when (contains? args :collection_id)
      (when-let [bad (seq (sort (filter collectionless-types types)))]
        (common/throw-teaching-error
         (format "collection_id cannot filter %s — these types don't live in collections. Remove them from type or drop collection_id."
                 (str/join ", " bad))))
      (when (contains? types "snippet")
        (common/throw-teaching-error
         "collection_id cannot filter snippets — list them with type: [\"snippet\"] and no collection_id."))
      (when (and (contains? types "table")
                 (not (premium-features/has-feature? :library)))
        (common/throw-teaching-error
         "Filtering tables by collection_id requires the Library feature, which this instance doesn't have — remove table from type or drop collection_id.")))
    (when (true? (:recent args))
      (when-let [bad (seq (sort (remove (set (keys type->rv-model)) types)))]
        (common/throw-teaching-error
         (format "Recents only track %s — remove %s from type or drop recent: true."
                 (str/join ", " (sort (keys type->rv-model)))
                 (str/join ", " bad))))
      (when (or created_by (contains? args :collection_id) (true? archived))
        (common/throw-teaching-error
         "recent: true supports only the type filter — drop collection_id, created_by, and archived.")))
    args))

(defn- check-snippet-scope!
  [token-scopes types]
  (when (and (contains? (set types) "snippet")
             (not (mcp.scope/matches? token-scopes metabot.scope/agent-snippets-read)))
    (common/throw-teaching-error
     (str "type: [\"snippet\"] requires the " metabot.scope/agent-snippets-read
          " scope, which this token does not have.")
     {:status-code 403})))

(defn- resolve-collection-filter
  "Resolve the `collection_id` argument to a numeric collection id behind the collection's
   read check, or nil when it names the root (no scoping). The search context takes numeric
   ids only, so entity_ids are translated here."
  [collection-id]
  (when-not (contains? #{nil "root"} collection-id)
    (:id (common/resolve-and-read :model/Collection collection-id
                                  (fn [id]
                                    (when-let [collection (t2/select-one :model/Collection :id id)]
                                      (when (mi/can-read? collection)
                                        collection)))))))

;;; ------------------------------------------------ Recents mode --------------------------------------------------

(defn- recent-item->row
  [fmt {:keys [model parent_collection] :as item}]
  (case fmt
    :concise  (-> {:type (rv-model->type model)
                   :id   (:id item)
                   :name (:name item)}
                  (m/assoc-some :collection_path (:name parent_collection)
                                :description     (:description item)))
    :detailed (assoc item :type (rv-model->type model))))

(defn- recents-page
  [{:keys [type]} fmt limit offset]
  (let [models            (when (seq type)
                            (into [] (distinct) (map type->rv-model type)))
        {:keys [recents]} (activity-feed/get-recents api/*current-user-id*
                                                     [:views :selections]
                                                     (cond-> {} models (assoc :models models)))
        page              (into [] (comp (drop offset) (take limit)) recents)]
    {:rows  (mapv #(recent-item->row fmt %) page)
     :total (count recents)}))

;;; ---------------------------------------------- Snippet union ---------------------------------------------------

(defn- snippet-rows
  "Snippet rows for the server-side union: all (non-)archived snippets the caller can read —
   filtered per row through `mi/can-read?`, so EE snippet-folder permissions and the
   sandboxed-user exclusion apply — optionally narrowed to names containing any query as a
   case-insensitive substring."
  [queries archived]
  (let [readable (filter mi/can-read?
                         (t2/select :model/NativeQuerySnippet
                                    :archived (boolean archived)
                                    {:order-by [[:%lower.name :asc]]}))
        matches  (if (seq queries)
                   (let [needles (mapv u/lower-case-en queries)]
                     (filter (fn [{:keys [name]}]
                               (let [haystack (u/lower-case-en name)]
                                 (some #(str/includes? haystack %) needles)))
                             readable))
                   readable)]
    (mapv (fn [{:keys [id name description]}]
            (cond-> {:type "snippet" :id id :name name}
              description (assoc :description description)))
          matches)))

;;; ------------------------------------------------ Search mode ---------------------------------------------------

(defn- engine-results
  "Run the shared metabot search pipeline and return `{:rows [...] :total <int-or-nil>}`.
   Rows are the postprocessed+enriched results with `:collection_path` attached; `total` is
   the engine's match count when exactly one search ran (single query or filters-only
   listing) and nil for rank-fused multi-query results."
  [{:keys [term_queries semantic_queries created_by archived]} entity-types collection-id limit offset]
  (let [results (metabot.search/search
                 (cond-> {:term-queries     (vec term_queries)
                          :semantic-queries (vec semantic_queries)
                          :entity-types     (vec entity-types)
                          :archived         (true? archived)
                          :limit            limit
                          :offset           offset
                          :filters-only?    (and (empty? term_queries) (empty? semantic_queries))}
                   created_by    (assoc :created-by #{api/*current-user-id*})
                   collection-id (assoc :collection-id collection-id)))]
    {:rows  (add-collection-paths (vec results))
     :total (:total (meta results))}))

;;; -------------------------------------------------- The tool ----------------------------------------------------

(def ^:private type-desc
  (str "Restrict results to these entity types. \"snippet\" is served by a separate listing "
       "(snippets aren't in the search index), requires the " metabot.scope/agent-snippets-read
       " scope, and must be requested on its own — combining it with other types is an error. "
       "Omit to search every type this tool supports except snippets."))

(def ^:private search-args-schema
  [:map {:closed true}
   [:term_queries {:optional true}
    [:maybe [:sequential [:string {:min 1 :description "A keyword query matched against names and descriptions via full-text search. Each query runs separately; results are merged by rank."}]]]]
   [:semantic_queries {:optional true}
    [:maybe [:sequential [:string {:min 1 :description "A natural-language query matched by semantic similarity when a semantic engine is active (keyword-ranked otherwise). Each query runs separately; results are merged by rank."}]]]]
   [:recent {:optional true}
    [:maybe [:boolean {:description "true returns your recently viewed items instead of searching. Combines with type (only question, model, metric, dashboard, document, collection, table are tracked) but not with queries or other filters."}]]]
   [:type {:optional true}
    [:maybe [:sequential (into [:enum {:description type-desc}] all-types)]]]
   [:collection_id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric collection id."}]
             [:string {:description "A 21-character entity_id, or \"root\" for no scoping."}]]]]
   [:created_by {:optional true}
    [:maybe [:enum {:description "\"me\" restricts results to items you created. Only question, model, metric, dashboard, document, measure, and action index a creator."} "me"]]]
   [:archived {:optional true}
    [:maybe [:boolean {:description "true searches the trash instead of active content."}]]]
   [:limit {:optional true}
    [:maybe [:int {:min 1 :max 50 :description "Maximum results to return (default 20, max 50)."}]]]
   [:offset {:optional true}
    [:maybe [:int {:min 0 :description "Number of results to skip, for paging (default 0)."}]]]
   [:response_format {:optional true}
    [:maybe [:enum {:description "concise (default) returns {type, id, name, collection_path, description} rows; detailed returns the full search-result rows."} "concise" "detailed"]]]
   [:fields {:optional true}
    [:maybe [:sequential [:string {:min 1 :description "Dot-paths picked from the detailed row shape, item-relative (e.g. \"collection.name\"). Mutually exclusive with response_format."}]]]]])

(defn- project-rows
  [args rows]
  (if-let [fields (:fields args)]
    (common/select-fields :search-result
                          (mapv #(projections/project :search-result :detailed %) rows)
                          fields
                          {:response-format (:response_format args)})
    (let [fmt (common/response-format args)]
      (mapv #(projections/project :search-result fmt %) rows))))

(registry/deftool search-tool
  "Find content across the Metabase instance. Three modes: (1) ranked search — term_queries (keywords) and/or semantic_queries (natural language), optionally narrowed by filters; (2) filters-only listing — any of type, collection_id (scopes to the collection subtree), created_by: \"me\", archived: true with no queries, e.g. all dashboards you created; (3) recent: true — your recently viewed items. type: [\"snippet\"] lists SQL snippets you can read and must be requested on its own, not alongside other types; queries narrow snippets by name substring. Transforms are searchable by admins only — other users list them with browse_collection(namespace: \"transforms\"). Returns {data, returned, total?}; total is omitted when multi-query rank fusion makes it unknowable."
  {:name         "search"
   :scope        metabot.scope/agent-search
   :extra-scopes #{metabot.scope/agent-snippets-read}
   :annotations  {:readOnlyHint true :idempotentHint true}
   :args         search-args-schema}
  [{:keys [term_queries semantic_queries recent type collection_id archived] :as args}
   {:keys [token-scopes]}]
  (let [queries?  (boolean (or (seq term_queries) (seq semantic_queries)))
        filters?  (boolean (or (seq type)
                               (contains? args :collection_id)
                               (:created_by args)
                               (true? archived)))
        limit     (or (:limit args) 20)
        offset    (or (:offset args) 0)]
    (validate-modes! args queries? filters?)
    (validate-filters! args)
    (check-snippet-scope! token-scopes type)
    (if (true? recent)
      (let [fmt (if (:fields args)
                  (common/throw-teaching-error
                   "`fields` is not supported with recent: true — use response_format instead.")
                  (common/response-format args))
            {:keys [rows total]} (recents-page args fmt limit offset)]
        (common/list-content rows total {:param :type :offset offset :limit limit}))
      ;; `validate-filters!` has already rejected snippet alongside any other type, so these
      ;; two listings are mutually exclusive and each pages on its own terms.
      (let [types              (into [] (distinct) type)
            {:keys [rows total]}
            (if (contains? (set types) "snippet")
              (let [snippets (snippet-rows (concat term_queries semantic_queries) archived)]
                {:rows  (into [] (comp (drop offset) (take limit)) snippets)
                 :total (count snippets)})
              (let [engine-types  (into [] (remove #{"snippet"}) (if (seq types) types all-types))
                    collection-id (when (contains? args :collection_id)
                                    (resolve-collection-filter collection_id))
                    engine        (engine-results args engine-types collection-id limit offset)]
                {:rows (vec (:rows engine)) :total (:total engine)}))]
        (common/list-content (project-rows args rows) total
                             {:param :type :offset offset :limit limit})))))
