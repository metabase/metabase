(ns metabase.agent-api.search
  "The v2 `search` tool: one entry point for discovery.

   Three modes, each named explicitly rather than inferred from which arguments happen to be present:
   ranked **queries** (keyword and natural-language, fused into one ranking), a filter-only **listing**
   (\"all my dashboards\"), and the caller's **recents**. A call that picks none of them gets a teaching
   error naming all three, because argument-presence dispatch would make a listing and a recents call
   look the same.

   The filters are the search engine's own — the tool plumbs them, it does not add capabilities. Two
   things sit on top of the engine, and only these two: snippets, which are `excluded-models` in the index
   and so come from their own table, and `collection_path`, which the engine has no reason to carry but an
   agent needs on every hit to say where something lives."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.tools.search :as metabot-search]
   [metabase.native-query-snippets.core :as snippets]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; The `type` vocabulary
;;; ──────────────────────────────────────────────────────────────────

(def ^:private indexed-types
  "The `type` values the search index carries, in the tool's vocabulary. `metabot.core/entity-type->search-model`
   maps them to the engine's `model` strings (`question` → `card`, `model` → `dataset`; the rest are
   already the same word)."
  ["collection" "dashboard" "database" "document" "measure" "metric" "model" "question" "segment"
   "table" "transform"])

(def ^:private snippet-type
  "Snippets are not in the search index, so `type: [\"snippet\"]` is served from the snippet table
   instead. They are never in the default type set — a search for \"revenue\" should not list snippets
   nobody asked for."
  "snippet")

(def types
  "Every `type` the tool accepts."
  (conj indexed-types snippet-type))

(def ^:private creator-types
  "The types whose index rows carry a creator, so `created_by` can filter them. A table, collection,
   segment, transform, or database has no creator in the index — combining one with `created_by` would
   match nothing, and the plain search API narrows to zero results without saying so."
  #{"question" "model" "metric" "dashboard" "measure" "document"})

(def ^:private type->recents-model
  "The types the recents log records, in its own fixed vocabulary
   ([[metabase.activity-feed.core/rv-models]]). It is narrower than the index's: you cannot view a
   segment or a database, so neither can be recent."
  {"question"   :card
   "model"      :dataset
   "metric"     :metric
   "dashboard"  :dashboard
   "table"      :table
   "collection" :collection
   "document"   :document})

(def ^:private recents-model->type
  (into {} (map (fn [[t m]] [m t])) type->recents-model))

(def default-limit
  "Hits per page when the caller names no `limit`."
  20)

(def max-limit
  "The most hits one call returns. A page beyond this is paging, not searching."
  50)

(def ^:private personal-collection-filter
  "Which personal collections a hit may come from. The agent acts as its user, and the app's own global
   search shows a user their own personal collection and nobody else's — an admin's read permission on
   every personal collection is not a licence for an agent to surface a colleague's drafts in answer to
   \"find me the revenue dashboard\". `collection_id` still reaches a personal collection named outright,
   which is how a caller reads their own."
  "exclude-others")

;;; ──────────────────────────────────────────────────────────────────
;;; Arguments
;;; ──────────────────────────────────────────────────────────────────

(def ^:private Params
  "The arguments [[search]] contracts on. `POST /v2/search` declares the wire schema, with the enums and
   the bounds a client is held to; this is the looser shape the domain function accepts from any caller."
  [:map
   [:term_queries     {:optional true} [:maybe [:or [:sequential :string] :string]]]
   [:semantic_queries {:optional true} [:maybe [:or [:sequential :string] :string]]]
   [:recent           {:optional true} [:maybe :boolean]]
   [:type             {:optional true} [:maybe [:sequential :string]]]
   [:collection_id    {:optional true} [:maybe [:or :int :string]]]
   [:created_by       {:optional true} [:maybe :string]]
   [:archived         {:optional true} [:maybe :boolean]]
   [:limit            {:optional true} [:maybe :int]]
   [:offset           {:optional true} [:maybe :int]]
   [:fields           {:optional true} [:maybe [:sequential :string]]]
   [:response_format  {:optional true} [:maybe :string]]])

(defn coerce-queries
  "The query arguments as a vector of strings. Some MCP clients (notably Codex) serialize array arguments
   through a string layer, so a caller that meant `[\"orders\"]` may actually send `\"[\\\"orders\\\"]\"`.
   An array passes through; a string that parses as a JSON array of non-blank strings is unwrapped; any
   other string is one query."
  [v]
  (cond
    (nil? v)        nil
    (sequential? v) v
    (string? v)     (or (try
                          (let [parsed (json/decode+kw v)]
                            (when (and (sequential? parsed)
                                       (every? #(and (string? %) (not (str/blank? %))) parsed))
                              parsed))
                          (catch Exception _ nil))
                        [v])
    :else           v))

;;; ──────────────────────────────────────────────────────────────────
;;; Validation — every refusal names the fix
;;; ──────────────────────────────────────────────────────────────────

(defn- check-mode!
  "One of the three modes has to be chosen. `recent` is a mode of its own, not \"a search with no
   query\" — that shape is the filter-only listing."
  [queries? filters? recent]
  (cond
    (and recent queries?)
    (tools/teaching-error!
     (str "`recent: true` returns your recently viewed items and cannot be ranked by a query. Drop "
          "`term_queries` and `semantic_queries`, or drop `recent`."))

    (not (or queries? filters? recent))
    (tools/teaching-error!
     (str "Give `search` something to do: `term_queries` and `semantic_queries` rank content by "
          "relevance, a filter (`type`, `collection_id`, `created_by`, `archived`) lists it, and "
          "`recent: true` returns your recently viewed items."))))

(defn- check-recents-filters!
  "Recents are a log of what the caller opened, not a query over the index — the filters that narrow a
   search have nothing to narrow here."
  [{:keys [collection_id created_by archived]}]
  (when (or collection_id created_by (some? archived))
    (tools/teaching-error!
     (str "`recent: true` takes only `type`, `limit`, and `offset`. Drop `collection_id`, `created_by`, "
          "and `archived`, or drop `recent`."))))

(defn- check-created-by!
  "`created_by` against a type the index gives no creator matches nothing. Say so, rather than returning
   the empty result the plain search API would."
  [created_by requested-types]
  (when created_by
    (when-let [creatorless (not-empty (remove creator-types requested-types))]
      (tools/teaching-error!
       (str "`created_by` only filters " (str/join ", " (sort creator-types)) ". Drop "
            (str/join ", " creatorless) " from `type`, or drop `created_by`.")))))

(defn- check-snippet-filters!
  "A snippet lives in the snippet namespace and is not indexed, so the index's filters do not reach it."
  [snippet? {:keys [collection_id created_by]}]
  (when (and snippet? (or collection_id created_by))
    (tools/teaching-error!
     (str "Snippets are not in the search index, so `collection_id` and `created_by` do not filter them. "
          "Drop the filter, or drop \"snippet\" from `type`."))))

(defn- recents-models
  "The recents-log models `requested-types` selects, or nil for \"every model recents records\"."
  [requested-types]
  (when (seq requested-types)
    (when-let [unrecordable (not-empty (remove type->recents-model requested-types))]
      (tools/teaching-error!
       (str "Recently viewed items only cover " (str/join ", " (sort (keys type->recents-model))) ". Drop "
            (str/join ", " unrecordable) " from `type`, or drop `recent`.")))
    (mapv type->recents-model requested-types)))

;;; ──────────────────────────────────────────────────────────────────
;;; Rows
;;; ──────────────────────────────────────────────────────────────────

(defn- index-row
  "One search-index hit, in the tool's shape: `type` in place of the engine's `model` (the same word an
   agent hands to `get_content`), and without the ranking internals — `scores` and the `context` match
   snippet are how the engine sorted, not what the caller asked for."
  [row]
  (-> row
      (assoc :type (metabot/search-model->entity-type (:model row)))
      (dissoc :model :scores :context)))

(defn- recent-row
  [item]
  (-> item
      (assoc :type (recents-model->type (:model item)))
      (dissoc :model)))

(defn- snippet-row
  [snippet]
  (-> snippet
      (select-keys [:id :name :description :collection_id :content :template_tags :creator_id
                    :entity_id :archived :created_at :updated_at])
      (assoc :type snippet-type)))

(def ^:private collection-typed?
  "The types that live in a collection. A hit of one of these always has a breadcrumb — \"Our analytics\"
   when it sits at the root. The rest (a table, a database, a segment) hang off a database or a table
   and have no collection, so they get no `collection_path` rather than a misleading root."
  #{"question" "model" "metric" "dashboard" "document" "collection"})

(defn- with-collection-paths
  "Attach `collection_path` — the breadcrumb of the collection a hit lives in — to every row that lives
   in one, resolving them all in one batch. A hit carries only its immediate collection, and an agent
   that has to walk the tree to learn where each one sits spends a call per hit.

   `collection-id-fn` reads a row's collection id, which is `nil` for content at the root — hence the
   [[collection-typed?]] test rather than a nil check: a table has no collection, and no path."
  [collection-id-fn rows]
  (if (empty? rows)
    []
    (let [paths (collections/collection-paths
                 (for [row rows :when (collection-typed? (:type row))]
                   (collection-id-fn row)))]
      (mapv (fn [row]
              (cond-> row
                (collection-typed? (:type row))
                (m/assoc-some :collection_path (get paths (collection-id-fn row)))))
            rows))))

(defn- first-line
  "The first line of a hit's description. A page of hits is a menu, and a paragraph per hit spends the
   response budget on prose the agent will not read before it picks one. `response_format: \"detailed\"`
   and a `fields` pick both return the description whole."
  [description]
  (some-> description not-empty str/split-lines first))

;;; ──────────────────────────────────────────────────────────────────
;;; The three modes
;;; ──────────────────────────────────────────────────────────────────

(defn- search-context
  "The engine's context for this call. Every key here is a filter the engine already has.

   Paging is deliberately *not* handed to the engine: the page is sliced from the assembled results,
   because a call that also asks for snippets has to page across both sources. The engine's `total`
   counts the whole ranked set either way, so asking for the `offset + limit` window costs nothing."
  [{:keys [collection_id created_by archived]} index-types window]
  (cond-> {:models                              (into #{} (map metabot/entity-type->search-model) index-types)
           :archived                            (boolean archived)
           :context                             :api
           :current-user-id                     api/*current-user-id*
           :is-superuser?                       api/*is-superuser?*
           :current-user-perms                  @api/*current-user-permissions-set*
           :is-impersonated-user?               (perms/impersonated-user?)
           :is-sandboxed-user?                  (perms/sandboxed-user?)
           :filter-items-in-personal-collection personal-collection-filter
           :limit                               window
           :offset                              0}
    collection_id (assoc :collection (tools/resolve-id :model/Collection collection_id))
    created_by    (assoc :created-by #{api/*current-user-id*})))

(defn- index-search
  "The index half of a call: `{:rows [...] :total n-or-nil}`.

   With queries, each one is searched separately and the rankings are fused — which is what makes the
   agreements between them rank highest, and also why there is no `total`: the fused set is the union
   of several ranked windows, not a count of anything. Without queries it is a plain filtered listing,
   and the engine's own total is exact."
  [{:keys [term_queries semantic_queries] :as params} index-types window]
  (let [context (search-context params index-types window)]
    (if (seq (concat term_queries semantic_queries))
      {:rows (metabot-search/fused-search context term_queries semantic_queries)}
      (let [{:keys [data total]} (search/search (search/search-context (assoc context :search-string nil)))]
        {:rows data :total total}))))

(defn- snippet-search
  "Snippets matching the call. They are `excluded-models` in the search index, so this is a flat listing
   of the snippet table with the query terms matched against name and description — no ranking, and
   `semantic_queries` do not apply, because there is nothing to embed against.

   `list-native-query-snippets` is the same function `GET /api/native-query-snippet` calls, and it
   filters by `can-read?`: a caller without native-query permission gets nothing back."
  [{:keys [term_queries archived]}]
  (let [terms (map u/lower-case-en term_queries)
        hit?  (fn [{:keys [name description]}]
                (or (empty? terms)
                    (let [haystack (u/lower-case-en (str name " " description))]
                      (boolean (some #(str/includes? haystack %) terms)))))]
    (into [] (comp (filter hit?) (map snippet-row))
          (snippets/list-native-query-snippets (boolean archived)))))

(defn- recents-search
  "The caller's recently viewed and selected items, the same list the app's recents surface shows."
  [{:keys [type] :as params}]
  (check-recents-filters! params)
  (let [models (recents-models type)
        items  (activity-feed/get-recents api/*current-user-id* [:views :selections]
                                          (cond-> {} models (assoc :models models)))]
    (->> (:recents items)
         (mapv recent-row)
         (with-collection-paths #(get-in % [:parent_collection :id])))))

(defn- content-search
  "The index and, when asked for, the snippet table. Snippets come after the ranked hits: they have no
   rank to interleave with."
  [{:keys [type created_by] :as params} window]
  (let [requested   (or (not-empty type)
                        ;; `created_by` with no `type` asks for the things the caller made, and only the
                        ;; types that carry a creator can answer that. Narrow to them here rather than
                        ;; leaning on the engine, which narrows the same way but says nothing about it.
                        (if created_by
                          (filterv creator-types indexed-types)
                          indexed-types))
        snippet?    (contains? (set requested) snippet-type)
        index-types (remove #{snippet-type} requested)]
    (check-created-by! created_by (remove #{snippet-type} type))
    (check-snippet-filters! snippet? params)
    (let [index        (when (seq index-types) (index-search params index-types window))
          index-rows   (with-collection-paths #(get-in % [:collection :id])
                         (mapv index-row (:rows index)))
          snippet-rows (when snippet? (snippet-search params))]
      {:rows  (into index-rows snippet-rows)
       :total (cond
                (empty? index-types) (count snippet-rows)
                (:total index)       (+ (:total index) (count snippet-rows))
                :else                nil)})))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(mu/defn search :- ::tools/list-response
  "Run the `search` tool. See the tool's description on `POST /v2/search` for the argument contract."
  [params :- Params]
  (let [{:keys [recent type collection_id created_by archived fields response_format] :as params}
        (-> params
            (m/update-existing :term_queries coerce-queries)
            (m/update-existing :semantic_queries coerce-queries))

        limit    (tools/clamp-limit (:limit params) default-limit max-limit)
        offset   (or (:offset params) 0)
        queries? (boolean (seq (concat (:term_queries params) (:semantic_queries params))))
        filters? (boolean (some some? [type collection_id created_by archived]))]
    (check-mode! queries? filters? recent)
    (let [{:keys [rows total]} (if recent
                                 {:rows (recents-search params) :total nil}
                                 (content-search params (+ offset limit)))
          ;; Recents and the snippet table are both bounded, small, and fully in hand — their count is
          ;; the total. The index's total is whatever the engine ranked.
          total                (if recent (count rows) total)
          page                 (cond->> (tools/page-of rows limit offset)
                                 (and (empty? fields) (not (tools/detailed? response_format)))
                                 (mapv #(m/update-existing % :description first-line)))]
      (tools/paged-envelope page
                            {:limit           limit
                             :offset          offset
                             :total           total
                             :response-format response_format
                             :fields          fields
                             :spec            (projections/spec :search-result)
                             :noun            "results"
                             :narrow-with     [:type :collection_id]}))))
