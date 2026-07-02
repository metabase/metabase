(ns metabase.metabot.tools.resources
  "Tool for reading Metabase resources via URI patterns.

  Implements 'Context Engineering with Links' pattern where URIs serve as lightweight,
  token-efficient references to resources that can be fetched on-demand at the
  appropriate level of detail.

  Output bodies are JSON in the Metabase Representation (MBR) format per core-spec v1
  (https://github.com/metabase/representations/blob/main/core-spec/v1/spec.md). Each
  entity carries `serdes/meta` (an identity path) and is built by reusing the same
  `serdes/extract-all` pipeline used for portable serialization — so MBR-shape FK refs,
  `dataset_query` portability, nested entities, etc. come for free.

  URI dispatch uses [[metabase.util.match/match-one]]. Two identifier tiers:

  - User content: `metabase://{type}/{entity_id}`. Numeric ids accepted for backcompat
    via [[metabase.metabot.tools.shared.mbr/resolve-user-entity]].
  - Sync metadata: `metabase://database/{db_name}[/schema/{schema}/table/{table_name}[/field/{field_name}]]`,
    via [[metabase.metabot.tools.shared.mbr/resolve-database]] and
    [[metabase.metabot.tools.shared.mbr/resolve-table]]. The legacy
    `metabase://table/{id}` form still routes through
    [[metabase.metabot.tools.shared.mbr/resolve-table-legacy]].

  Supported URI patterns are exhaustively listed in [[read-resource-tool]]'s docstring."
  (:require
   [clojure.string :as str]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.api.common :as api]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.shared.mbr :as mbr]
   [metabase.models.interface :as mi]
   [metabase.transforms.core :as transforms]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.match :as match]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private max-concurrent-uris
  "Maximum number of URIs that can be fetched in a single call."
  5)

(defn- parse-query-string
  "Parse a URI query string like \"tree=true&foo=bar\" into a keyword-keyed map.
   Returns nil for empty or nil input."
  [qs]
  (when (and qs (not (str/blank? qs)))
    (->> (str/split qs #"&")
         (keep (fn [pair]
                 (when-not (str/blank? pair)
                   (let [[k v] (str/split pair #"=" 2)]
                     (when k [(keyword k) (or v "")])))))
         (into {}))))

(defn- parse-uri
  "Parse a metabase:// URI into a vector of path segments and a query-params map.

   Each segment is URL-decoded after splitting on `/`, so encoded values like
   `weird%2Fname` (a database schema with a literal `/`) round-trip correctly
   from `metabase-uri` back into the matched pattern.

   Returns:
   - :segments     - vector of path segments (e.g. [\"database\" \"1\" \"tables\"])
   - :query-params - {keyword string} map (e.g. {:tree \"true\"}), or nil if no query string

   INTERIOR empty segments are preserved: a schemaless database yields the path-form
   `database/{db}/schema//table/{t}`, whose empty `schema` slot must survive so the table
   dispatch clause (6 segments) still matches. Only leading/trailing empties (from a stray
   `/`) are trimmed."
  [uri]
  (when-not (str/starts-with? uri "metabase://")
    (throw (ex-info (str "Invalid URI scheme. Expected 'metabase://' but got: " uri)
                    {:uri uri})))
  (let [stripped  (subs uri 11)
        [path qs] (str/split stripped #"\?" 2)
        ;; Trim leading/trailing '/' so those don't produce empty edge segments, then split
        ;; WITHOUT removing blanks so an interior empty (e.g. the schema slot of a schemaless
        ;; table) is kept. `split … -1` retains trailing empties from the pre-trim path.
        segments  (->> (str/replace path #"^/+|/+$" "")
                       (#(str/split % #"/" -1))
                       (mapv codec/url-decode))]
    (when (or (zero? (count segments))
              (= segments [""]))
      (throw (ex-info (str "Invalid URI: " uri " — empty path")
                      {:uri uri})))
    {:segments     segments
     :query-params (parse-query-string qs)}))

;; ----- Pagination helper -----

(defn- paginate-items
  "Paginate an already-built/hydrated item vector the same way
   [[metabase.metabot.tools.shared.mbr/extract-readable]] paginates instances.

   Used by the concat sites (which mix models and so can't page through a single
   `extract-readable` call) and by the hand-built schema list. `page-str` is the
   raw `:page` query-param (string or nil); page size is
   [[metabase.metabot.tools.shared.mbr/max-list-items]]. Returns
   `{:items <≤page-size> :total <full count> :page n :pages <total pages>}` and
   throws on a page outside [1, pages] — matching extract-readable's contract and
   error message so the agent gets a consistent signal."
  [items page-str]
  (let [items (vec items)
        total (count items)
        pages (max 1 (long (Math/ceil (/ (double total) mbr/max-list-items))))
        page  (or (some-> page-str parse-long) 1)]
    (when (or (< page 1) (> page pages))
      (throw (ex-info (str "Invalid page " page ". This list has " pages
                           (if (= pages 1) " page." " pages."))
                      {:page page :pages pages})))
    {:items (->> items (drop (* (dec page) mbr/max-list-items)) (take mbr/max-list-items) vec)
     :total total
     :page  page
     :pages pages}))

;; ----- Lineage helpers -----

(defn- transform-source-table-ids
  "FK-only source tables for a transform: walks (:source :source-tables) entries when present."
  [transform]
  (->> (get-in transform [:source :source-tables])
       (keep :table_id)))

;; ----- Fetch handlers (one per URI shape) -----

(defn- fetch-databases-list [query-params]
  (let [dbs (t2/select :model/Database
                       :is_audit false
                       {:order-by [[:%lower.name :asc]]})]
    (mbr/list-result :databases (mbr/extract-readable "Database" dbs {:page (:page query-params)}))))

(defn- fetch-collections-list
  "metabase://collections (root only) and metabase://collections?tree=true (flat list of all).

   In MBR, hierarchy is encoded by each Collection's `parent_id` (entity_id of
   parent). For tree mode we return the flat list across the namespace; the
   caller assembles the tree by chaining `parent_id`."
  [{:keys [tree page] :as _query-params}]
  (let [tree?  (= "true" tree)
        where  (cond-> [:and
                        [:= :archived false]
                        [:= :namespace nil]
                        ;; Exclude the system Trash collection from navigation listings.
                        [:or [:= :type nil] [:!= :type "trash"]]]
                 (not tree?) (conj [:= :location "/"]))
        colls  (t2/select :model/Collection
                          {:where    where
                           :order-by [[:location :asc] [:%lower.name :asc]]})]
    (mbr/list-result (if tree? :collections-tree :collections-root)
                     (mbr/extract-readable "Collection" colls {:page page}))))

;; `activity-feed/get-recents` sets each item's `:model` to a KEYWORD (see the
;; `fill-recent-view-info` methods, which emit `:model :card` / `:collection` /
;; …), so these maps key on keywords. Keying on strings (as an earlier version
;; did) matched nothing and dropped *every* recent.
(defn- recent-model->mbr-model
  "Activity-feed recent `:model` keyword -> MBR model name."
  [model]
  (case model
    (:card :dataset :metric :model) "Card"
    :dashboard                      "Dashboard"
    :table                          "Table"
    :collection                     "Collection"
    :document                       "Document"
    nil))

(defn- recent-model->toucan
  "Activity-feed recent `:model` keyword -> Toucan model."
  [model]
  (case model
    (:card :dataset :metric :model) :model/Card
    :dashboard                      :model/Dashboard
    :table                          :model/Table
    :collection                     :model/Collection
    :document                       :model/Document
    nil))

(defn- fetch-user-recents []
  (let [recents (or (-> (activity-feed/get-recents api/*current-user-id* [:views])
                        :recents)
                    [])
        ;; Extract each recent as MBR. An entry whose `:model` we can't map
        ;; (e.g. a snippet) is dropped by `keep` — the mapped set is exhaustive
        ;; for the MBR entity types, so only genuinely-unsupported models vanish.
        items   (->> recents
                     (keep (fn [{:keys [id model timestamp]}]
                             (when-let [tm (recent-model->toucan model)]
                               (when-let [inst (t2/select-one tm id)]
                                 (when (mi/can-read? inst)
                                   (-> (mbr/->mbr (recent-model->mbr-model model) inst)
                                       (assoc :_recently_viewed_at timestamp)))))))
                     vec)]
    (mbr/list-result :recent-items (paginate-items items nil))))

;; ----- Database drill-down -----

(defn- fetch-database [id-str]
  (if-let [db (mbr/resolve-database id-str)]
    (mbr/entity-result (mbr/extract-as-user "Database" db))
    {:status-code 404 :output (str "Database " id-str " not found")}))

(defn- fetch-database-tables [id-str query-params]
  (let [db     (mbr/resolve-database id-str)
        _      (api/read-check db)
        tables (t2/select :model/Table
                          :db_id  (:id db)
                          :active true
                          {:order-by [[:%lower.schema :asc] [:%lower.name :asc]]})]
    (mbr/list-result :database-tables (mbr/extract-readable "Table" tables {:page (:page query-params)}))))

(defn- fetch-database-models [id-str query-params]
  (let [db     (mbr/resolve-database id-str)
        _      (api/read-check db)
        models (t2/select :model/Card
                          :type        :model
                          :database_id (:id db)
                          :archived    false
                          {:order-by [[:%lower.name :asc]]})]
    (mbr/list-result :database-models (mbr/extract-readable "Card" models {:page (:page query-params)}))))

(defn- fetch-database-schemas [id-str query-params]
  (let [db      (mbr/resolve-database id-str)
        _       (api/read-check db)
        rows    (t2/query
                 {:select-distinct [:schema]
                  :from            [:metabase_table]
                  :where           [:and [:= :db_id (:id db)] [:= :active true]]
                  :order-by        [[:schema :asc]]})
        schemas (->> rows
                     (keep :schema)
                     (mapv (fn [s]
                             ;; Schema is not a Toucan-modeled entity — return a
                             ;; minimal MBR-flavored shape that matches the FK
                             ;; tuple form so the agent can drill in.
                             {:type        "schema"
                              :name        s
                              :database    (:name db)})))]
    (mbr/list-result :database-schemas (paginate-items schemas (:page query-params)))))

(defn- fetch-database-schema-tables [id-str schema-name query-params]
  (let [db     (mbr/resolve-database id-str)
        _      (api/read-check db)
        tables (t2/select :model/Table
                          :db_id  (:id db)
                          :schema schema-name
                          :active true
                          {:order-by [[:%lower.name :asc]]})]
    (mbr/list-result :database-schema-tables (mbr/extract-readable "Table" tables {:page (:page query-params)}))))

;; ----- Collection drill-down -----

(defn- fetch-collection [id-str]
  (if-let [coll (mbr/resolve-user-entity :model/Collection id-str)]
    (mbr/entity-result (mbr/extract-as-user "Collection" coll))
    {:status-code 404 :output (str "Collection " id-str " not found")}))

(defn- fetch-collection-items [id-str query-params]
  (let [coll           (mbr/resolve-user-entity :model/Collection id-str)
        _              (api/read-check coll)
        coll-id        (:id coll)
        cards          (t2/select :model/Card
                                  {:where    [:and [:= :collection_id coll-id] [:= :archived false]]
                                   :order-by [[:%lower.name :asc]]})
        dashboards     (t2/select :model/Dashboard
                                  :collection_id coll-id
                                  :archived      false
                                  {:order-by [[:%lower.name :asc]]})
        subcollections (t2/select :model/Collection
                                  :location (str (:location coll) coll-id "/")
                                  :archived false
                                  {:order-by [[:%lower.name :asc]]})
        ;; This list mixes three models, so it can't page through one
        ;; extract-readable call. Hydrate each sub-list fully (bare 2-arity, no
        ;; paging), concat, then paginate the combined item vector — keeping
        ;; `:total` honest across all three.
        items          (concat (mbr/extract-readable "Collection" subcollections)
                               (mbr/extract-readable "Card" cards)
                               (mbr/extract-readable "Dashboard" dashboards))]
    (mbr/list-result :collection-items (paginate-items items (:page query-params)))))

(defn- fetch-collection-subcollections [id-str query-params]
  (let [coll    (mbr/resolve-user-entity :model/Collection id-str)
        _       (api/read-check coll)
        coll-id (:id coll)
        subs    (t2/select :model/Collection
                           :location (str (:location coll) coll-id "/")
                           :archived false
                           {:order-by [[:%lower.name :asc]]})]
    (mbr/list-result :collection-subcollections (mbr/extract-readable "Collection" subs {:page (:page query-params)}))))

;; ----- Table -----

(defn- table-details
  "Shared `entity-details/get-table-details` call for both /table/{id} and /table/{id}/fields.
   `entity-type` is :table, :model, or :question."
  [entity-type id with-fields?]
  (entity-details/get-table-details {:entity-type          entity-type
                                     :entity-id            id
                                     :with-fields?         with-fields?
                                     :with-field-values?   false
                                     :with-related-tables? (= entity-type :table)
                                     :with-measures?       true
                                     :with-segments?       true}))

(defn- fetch-table*
  "Shared body for the legacy `metabase://table/{id}` and the MBR-style
   `metabase://database/{db}/schema/{s}/table/{t}` routes — both resolve to a
   Toucan instance and hand off to MBR extract."
  [table]
  (if table
    (mbr/entity-result (mbr/extract-as-user "Table" table))
    {:status-code 404 :output "Table not found"}))

(defn- fetch-table [id-str]
  (fetch-table* (mbr/resolve-table-legacy id-str)))

(defn- fetch-table-by-path [db-name schema table-name]
  (fetch-table* (mbr/resolve-table db-name schema table-name)))

(defn- fetch-table-fields [id-str]
  (table-details :table (parse-long id-str) true))

(defn- fetch-table-field [id-str field-id]
  (field-stats/field-values {:entity-type "table"
                             :entity-id   (parse-long id-str)
                             :field-id    field-id
                             :limit       30}))

(defn- fetch-table-derived* [table query-params]
  (let [table-id   (:id table)
        _          (api/read-check table)
        db-id      (:db_id table)
        cards      (t2/select :model/Card
                              :table_id table-id
                              :archived false
                              {:order-by [[:%lower.name :asc]]})
        ;; SQL-narrow transforms by source_database_id (a transform can only reference
        ;; tables in its source DB). Pull `:source` in the same select to extract source
        ;; table ids in memory — no per-row re-fetch. Apply the can-read? check last,
        ;; on the already-narrowed candidate set.
        transforms (when db-id
                     (->> (t2/select :model/Transform
                                     :source_database_id db-id
                                     {:order-by [[:%lower.name :asc]]})
                          (filter (fn [t] (some #{table-id} (transform-source-table-ids t))))))
        ;; Mixes Card + Transform, so hydrate each fully (no paging), concat, then
        ;; paginate the combined vector.
        items      (concat (mbr/extract-readable "Card" cards)
                           (mbr/extract-readable "Transform" (or transforms [])))]
    (mbr/list-result :table-derived (paginate-items items (:page query-params)))))

(defn- fetch-table-derived [id-str query-params]
  (fetch-table-derived* (mbr/resolve-table-legacy id-str) query-params))

(defn- fetch-table-derived-by-path [db-name schema table-name query-params]
  (fetch-table-derived* (mbr/resolve-table db-name schema table-name) query-params))

(defn- fetch-table-fields-by-path [db-name schema table-name]
  (if-let [t (mbr/resolve-table db-name schema table-name)]
    (table-details :table (:id t) true)
    {:status-code 404 :output "Table not found"}))

(defn- fetch-field-by-path [db-name schema table-name field-name]
  (if-let [f (mbr/resolve-field db-name schema table-name field-name)]
    (mbr/entity-result (mbr/extract-as-user "Field" f))
    {:status-code 404 :output "Field not found"}))

;; ----- Card (model / question) -----

;; Forward decl: a `:metric` card routed to `/card/{id}/fields` funnels through
;; the same metric-details path as `/metric/{id}/dimensions` (defined below).
(declare metric-dimensions)

(defn- fetch-card
  "type-str is \"model\" / \"question\" / \"card\". The MBR Card includes
   :dataset_query in portable form, so query shape, joins, expressions, and
   result_metadata are already part of the entity — no separate /fields call
   is required to see what columns the card produces. The /fields and
   /field/{id} endpoints stay on the field-stats path because they layer
   field-values on top of the schema."
  [_type-str id-str]
  (if-let [card (mbr/resolve-user-entity :model/Card id-str)]
    (mbr/entity-result (mbr/extract-as-user "Card" card))
    {:status-code 404 :output (str "Card " id-str " not found")}))

(defn- resolve-card-or-404
  "Resolve a Card by URI segment (entity_id NanoID *or* legacy numeric id) via
   [[mbr/resolve-user-entity]]. The `card`/`model`/`question` URI types all land
   here; the downstream entity-type is taken from the card's real `:type`, not
   the URI segment — so the canonical `card` type works and a mislabeled
   `model/{id}` of a question still resolves. Returns the Toucan instance or a
   404 map (caller threads it with `if-let`-style handling)."
  [id-str]
  (or (mbr/resolve-user-entity :model/Card id-str)
      {:status-code 404 :output (str "Card " id-str " not found")}))

(defn- fetch-card-fields [_type-str id-str]
  (let [card (resolve-card-or-404 id-str)]
    (if (:status-code card)
      card
      ;; A metric card's "fields" are its queryable dimensions, a different column
      ;; set than table fields — get-table-details only handles :question/:model
      ;; (a :metric hits :else -> 400). Route metrics through the same
      ;; metric-details path as /metric/{id}/dimensions so `card` stays canonical.
      (if (= :metric (:type card))
        (metric-dimensions (:id card))
        ;; entity-type from the resolved card's :type (:question/:model), not the
        ;; URI segment — get-table-details only knows :question/:model, so passing
        ;; the canonical "card" segment through verbatim would throw.
        ;;
        ;; NOTE (pre-existing, separate from this PR): unlike the card *body* (whose
        ;; :dataset_query/:result_metadata go through redact-sandboxed), the /fields
        ;; path emits column names via get-table-details' user-aware metadata
        ;; provider. Whether that provider sandbox-filters the field list for a
        ;; column-sandboxed user is unverified here; if it doesn't, /fields could
        ;; enumerate hidden column names. Tracked as a follow-up — not changed in
        ;; this PR to keep the diff scoped to the MBR migration.
        (table-details (:type card) (:id card) true)))))

(defn- fetch-card-field [_type-str id-str field-id]
  (let [card (resolve-card-or-404 id-str)]
    (if (:status-code card)
      card
      (field-stats/field-values {:entity-type (name (:type card))
                                 :entity-id   (:id card)
                                 :field-id    field-id
                                 :limit       30}))))

(defn- fetch-card-sources [id-str]
  (let [card    (mbr/resolve-user-entity :model/Card id-str)
        _       (api/read-check card)
        {:keys [database_id table_id source_card_id]} card
        db      (when database_id    (t2/select-one :model/Database database_id))
        table   (when table_id       (t2/select-one :model/Table table_id))
        src     (when source_card_id (t2/select-one :model/Card source_card_id))
        ;; Gate each source on read perms before extracting — the read-check
        ;; above only covers the *parent* card. Without this, a source Card the
        ;; user can't read, or Table metadata they're sandboxed out of, would be
        ;; fully serialized into the response. `extract-readable` filters by
        ;; `mi/can-read?` then runs ->mbr, matching fetch-transform-sources.
        items   (vec (concat (when db    (mbr/extract-readable "Database" [db]))
                             (when table (mbr/extract-readable "Table" [table]))
                             (when src   (mbr/extract-readable "Card" [src]))))]
    (mbr/list-result :card-sources (paginate-items items nil))))

;; ----- Metric -----

(defn- fetch-metric [id-str]
  (let [card (mbr/resolve-user-entity :model/Card id-str)]
    (if (and card (= :metric (:type card)))
      (mbr/entity-result (mbr/extract-as-user "Card" card))
      {:status-code 404 :output (str "Metric " id-str " not found")})))

(defn- resolve-metric-or-404
  "Resolve a metric Card by URI segment (entity_id NanoID *or* legacy numeric id)
   via [[mbr/resolve-user-entity]], then verify it is actually a `:metric` card.
   Mirrors [[resolve-card-or-404]]. Returns the Toucan instance or a 404 map."
  [id-str]
  (let [card (mbr/resolve-user-entity :model/Card id-str)]
    (if (and card (= :metric (:type card)))
      card
      {:status-code 404 :output (str "Metric " id-str " not found")})))

(defn- metric-dimensions
  "Shared body for `/metric/{id}/dimensions` and the `:metric` branch of
   `/card/{id}/fields`. `metric-id` is the numeric Card id. `get-metric-details`
   expects `?`-suffixed option keys; `:with-field-values? false` swaps the
   field-values fetch for `identity`, so it must be spelled exactly."
  [metric-id]
  (entity-details/get-metric-details {:metric-id                  metric-id
                                      :with-queryable-dimensions? true
                                      :with-field-values?         false}))

(defn- fetch-metric-dimensions [id-str]
  (let [card (resolve-metric-or-404 id-str)]
    (if (:status-code card)
      card
      (metric-dimensions (:id card)))))

(defn- fetch-metric-dimension [id-str dim-id]
  (let [card (resolve-metric-or-404 id-str)]
    (if (:status-code card)
      card
      (field-stats/field-values {:entity-type "metric"
                                 :entity-id   (:id card)
                                 :field-id    dim-id
                                 :limit       30}))))

;; ----- Measure / Segment -----

(defn- fetch-measure [id-str]
  (entity-details/get-measure-details {:measure-id (parse-long id-str)}))

(defn- fetch-segment [id-str]
  (entity-details/get-segment-details {:segment-id (parse-long id-str)}))

;; ----- Transform -----

(defn- resolve-transform-id-or-404
  "Resolve a Transform URI segment to the numeric id `transforms/get-transform`
   consumes. Transform is an entity_id-bearing model (`:hook/entity-id`), so MBR
   advertises `metabase://transform/{entity_id}`.

   A NanoID segment resolves via [[mbr/resolve-user-entity]] to its numeric id
   (404 if no such transform). A numeric segment is passed through verbatim — we
   leave the existence/perm decision to `transforms/get-transform` downstream
   (404 missing / 403 denied), matching the legacy `parse-long` behavior. No perm
   check here. Returns the numeric id or a 404 map."
  [id-str]
  (if (some-> id-str parse-long)
    (parse-long id-str)
    (if-let [instance (mbr/resolve-user-entity :model/Transform id-str)]
      (:id instance)
      {:status-code 404 :output (str "Transform " id-str " not found")})))

(defn- fetch-transform [id-str]
  ;; transforms/get-transform runs the read-check (404 if missing, 403 if denied)
  ;; and returns a Transform Toucan instance enriched with hydrated keys. ->mbr
  ;; re-selects by (:id instance) via serdes, so those extra keys are inert — no
  ;; need for a second t2/select-one. Use ->mbr (not extract-as-user) since the
  ;; read-check already happened inside get-transform.
  (let [id (resolve-transform-id-or-404 id-str)]
    (if (map? id)
      id
      (mbr/entity-result (mbr/->mbr "Transform" (transforms/get-transform id))))))

(defn- fetch-transform-sources [id-str query-params]
  (let [id (resolve-transform-id-or-404 id-str)]
    (if (map? id)
      id
      (let [transform        (transforms/get-transform id)
            source-table-ids (transform-source-table-ids transform)
            ;; Mixes the source Database with its source Tables, so build the full
            ;; combined item vector (tables hydrated fully, no paging) and paginate it.
            tables           (when (seq source-table-ids)
                               (mbr/extract-readable "Table"
                                                     (t2/select :model/Table
                                                                :id [:in (set source-table-ids)])))
            db-id            (:source_database_id transform)
            db               (when db-id (t2/select-one :model/Database db-id))
            items            (cond-> []
                               db     (conj (mbr/->mbr "Database" db))
                               tables (into tables))]
        (mbr/list-result :transform-sources (paginate-items items (:page query-params)))))))

(defn- fetch-transform-target [id-str]
  (let [id (resolve-transform-id-or-404 id-str)]
    (if (map? id)
      id
      (let [transform    (transforms/get-transform id)
            ;; The target table is hydrated by `transforms/get-transform` without a per-table
            ;; permission check (the read-check on the Transform itself only verifies *source*
            ;; tables are readable). Gate it here so users who can read the transform definition
            ;; but lack perms on the target database don't see the target's name/schema.
            target-table (when-let [tt (:table transform)]
                           (when (mi/can-read? tt)
                             (t2/select-one :model/Table (:id tt))))
            db-id        (:target_db_id transform)
            db           (when db-id (t2/select-one :model/Database db-id))
            items        (cond-> []
                           db           (conj (mbr/->mbr "Database" db))
                           target-table (conj (mbr/->mbr "Table" target-table)))]
        (mbr/list-result :transform-target (paginate-items items nil))))))

;; ----- Dashboard -----

(defn- fetch-dashboard [id-str]
  (if-let [dashboard (mbr/resolve-user-entity :model/Dashboard id-str)]
    (mbr/entity-result (mbr/extract-as-user "Dashboard" dashboard))
    {:status-code 404 :output (str "Dashboard " id-str " not found")}))

(defn- fetch-dashboard-items [id-str query-params]
  (let [dashboard    (mbr/resolve-user-entity :model/Dashboard id-str)
        _            (api/read-check dashboard)
        dashboard-id (:id dashboard)
        cards        (t2/select :model/Card
                                {:where    [:and
                                            [:= :archived false]
                                            [:exists {:select 1
                                                      :from   [[:report_dashboardcard :dc]]
                                                      :where  [:and
                                                               [:= :dc.card_id :report_card.id]
                                                               [:= :dc.dashboard_id dashboard-id]]}]]
                                 :order-by [[:%lower.name :asc]]})]
    (mbr/list-result :dashboard-items (mbr/extract-readable "Card" cards {:page (:page query-params)}))))

;; ----- Dispatch -----

(defn- dispatch
  "Route a parsed URI to the right fetch handler. The match-one table is the canonical
   list of supported URI shapes — adding a new URI = adding a clause here + a handler.

   Pattern ordering: more-specific patterns (no rest-binding) must come before less-specific
   ones (with rest-binding) so the exact-length match wins for the no-extra-segments case."
  [uri]
  (let [{:keys [segments query-params]} (parse-uri uri)]
    (match/match-one segments
      ;; Navigation
      ["databases"]                                    (fetch-databases-list query-params)
      ["collections"]                                  (fetch-collections-list query-params)
      ["user" "recent-items"]                          (fetch-user-recents)

      ;; Database drill-down. `:id` accepts either a numeric DB id (legacy) or a
      ;; database name (MBR-style). `resolve-database` discriminates.
      ["database" id]                                  (fetch-database id)
      ["database" id "tables"]                         (fetch-database-tables id query-params)
      ["database" id "models"]                         (fetch-database-models id query-params)
      ["database" id "schemas"]                        (fetch-database-schemas id query-params)
      ;; Legacy: schemas/{name}/tables. New form uses `schema/{name}/tables`
      ;; (singular `schema`) below to align with the MBR FK path-form.
      ["database" id "schemas" schema "tables"]        (fetch-database-schema-tables id schema query-params)
      ["database" id "schema" schema "tables"]         (fetch-database-schema-tables id schema query-params)

      ;; Sync metadata (Table / Field) — MBR path-form. `database` segment must
      ;; be a DB name (path-form is invalid with a numeric id; that maps to the
      ;; legacy `["table" id]` route below).
      ["database" db-name "schema" schema "table" t-name]                       (fetch-table-by-path db-name schema t-name)
      ["database" db-name "schema" schema "table" t-name "fields"]              (fetch-table-fields-by-path db-name schema t-name)
      ["database" db-name "schema" schema "table" t-name "derived"]             (fetch-table-derived-by-path db-name schema t-name query-params)
      ["database" db-name "schema" schema "table" t-name "field" field-name]    (fetch-field-by-path db-name schema t-name field-name)

      ;; Collection drill-down
      ["collection" id]                                (fetch-collection id)
      ["collection" id "items"]                        (fetch-collection-items id query-params)
      ["collection" id "subcollections"]               (fetch-collection-subcollections id query-params)

      ;; Table
      ["table" id]                                     (fetch-table id)
      ["table" id "fields"]                            (fetch-table-fields id)
      ["table" id "fields" & rst]                      (fetch-table-field id (str/join "/" rst))
      ["table" id "derived"]                           (fetch-table-derived id query-params)

      ;; Card (model / question / card — share handlers, dispatch on the type segment.
      ;; `card` is the canonical MBR type; `model` and `question` remain for backcompat
      ;; with prompts/transcripts that already use them.)
      [(t :guard #{"card" "model" "question"}) id]            (fetch-card t id)
      [(t :guard #{"card" "model" "question"}) id "fields"]   (fetch-card-fields t id)
      [(t :guard #{"card" "model" "question"}) id "fields" & rst] (fetch-card-field t id (str/join "/" rst))
      [(t :guard #{"card" "model" "question"}) id "sources"]  (fetch-card-sources id)

      ;; Metric
      ["metric" id]                                    (fetch-metric id)
      ["metric" id "dimensions"]                       (fetch-metric-dimensions id)
      ["metric" id "dimensions" & rst]                 (fetch-metric-dimension id (str/join "/" rst))

      ;; Measure / Segment
      ["measure" id]                                   (fetch-measure id)
      ["segment" id]                                   (fetch-segment id)

      ;; Transform
      ["transform" id]                                 (fetch-transform id)
      ["transform" id "sources"]                       (fetch-transform-sources id query-params)
      ["transform" id "target"]                        (fetch-transform-target id)

      ;; Dashboard
      ["dashboard" id]                                 (fetch-dashboard id)
      ["dashboard" id "items"]                         (fetch-dashboard-items id query-params)

      ;; Default — required to make match non-recursive
      _ (throw (ex-info (str "Unsupported URI: " uri)
                        {:uri uri :segments segments})))))

;; ----- Tool entry points -----

(defn- fetch-single-uri
  "Fetch a single URI and return formatted content.

  Returns a map with either:
  - {:uri uri :content result}
  - {:uri uri :error error-message}"
  [uri]
  (try
    (let [result (dispatch uri)]
      (if (:status-code result)
        {:uri uri :error (or (:output result) result)}
        {:uri uri :content result}))
    (catch Exception e
      (log/warn "Error fetching resource" {:uri uri :error (ex-message e)})
      {:uri uri :error (or (ex-message e) "Unknown error")})))

(defn- format-with-instructions
  "Wrap content in `<result>` / `<instructions>` tags."
  [content instruction-text]
  (str "<result>\n" content "\n</result>\n"
       "<instructions>\n" instruction-text "\n</instructions>"))

(defn- format-content
  "Format a tool result as an LLM-ready string.

   MBR-shaped results (`:mbr-entity`, `:mbr-list`) JSON-encode to a string.
   Two legacy XML branches remain pinned to field-stats drill-downs:
   `:field-metadata` (per-field values + instructions) and `:entity` (the
   table-details rollup used by `/fields` endpoints). Both layer non-MBR
   field-value samples on top of schema; migrating them to MBR is tracked
   separately."
  [content]
  (if-let [structured (:structured-output content)]
    (case (:result-type structured)
      ;; NOTE: keep in sync with agent/tools/metadata.clj/format-field-metadata-output
      :field-metadata (format-with-instructions
                       (llm-shape/field-metadata->xml structured)
                       instructions/field-metadata-instructions)
      :mbr-entity     (json/encode (:entity structured))
      :mbr-list       (json/encode (select-keys structured [:list-type :items :total :page :pages :truncated]))
      :entity         (llm-shape/entity->xml structured))
    ;; error case — :output is already a string
    (:formatted content)))

(defn- format-resources
  "Format resources for LLM output."
  [resources]
  (str "<resources>\n"
       (str/join "\n"
                 (for [{:keys [uri content error]} resources]
                   (str "<resource uri=\"" uri "\">"
                        (if content
                          (str "\n" (format-content content) "\n")
                          (str "\n**Error:** " error "\n"))
                        "</resource>")))
       "\n</resources>"))

(defn read-resource
  "Read one or more Metabase resources via URI patterns.

  Parameters:
  - uris: List of metabase:// URIs to fetch (max 5)

  Returns a map with formatted resources or error details."
  [{:keys [uris]}]
  (log/info "Reading resources" {:uri-count (count uris)})

  ;; Validate URI count
  (when (> (count uris) max-concurrent-uris)
    (throw (ex-info
            (str "Too many URIs provided (" (count uris) "). "
                 "Please limit to " max-concurrent-uris " URIs maximum. "
                 "Be more selective and focus on the most relevant items for the current task or fetch them in batches.")
            {:uri-count (count uris) :max max-concurrent-uris})))

  ;; Fetch all URIs (sequentially for now, could parallelize with pmap)
  (let [resources (mapv fetch-single-uri uris)
        formatted (format-resources resources)]
    (log/info "Fetched resources" {:total      (count resources)
                                   :successful (count (filter :content resources))
                                   :errors     (count (filter :error resources))})
    {:resources resources
     :output formatted}))

(mu/defn ^{:tool-name "read_resource"
           :scope     scope/agent-resource-read}
  read-resource-tool
  "Read detailed information about Metabase resources via URI patterns. Use this to navigate
  the instance and drill into specific entities. Output is JSON in the Metabase Representation
  (MBR) format — the same shape Metabase uses for portable serialization
  (https://github.com/metabase/representations/blob/main/core-spec/v1/spec.md). URIs returned
  by `search` and other read_resource calls can be fed directly back here.

  Up to 5 URIs may be requested in one call. List responses are capped at 25 items; if
  truncated, drill into individual items via their URIs or refine via `search`.

  URI vocabulary (two-tier identifier scheme):

  - User content (Card, Dashboard, Collection, Metric, Transform): identified by
    `entity_id` (NanoID), the same id that appears in each MBR's `serdes/meta`. Use
    `metabase://{type}/{entity_id}`. Numeric ids work too for backcompat but the canonical
    form is entity_id.
  - Sync metadata (Database, Table, Field): no entity_id — addressed by natural-key path,
    matching MBR FK tuples. `metabase://database/{db_name}`,
    `metabase://database/{db_name}/schema/{schema}/table/{table_name}`, and
    `.../field/{field_name}`. URL-encode each segment.

  NAVIGATION (top-level lists):
  - metabase://databases - all databases
  - metabase://collections - root collections
  - metabase://collections?tree=true - all collections (hierarchy via each collection's parent_id)
  - metabase://user/recent-items - your recently-viewed items

  DATABASE DRILL-DOWN:
  - metabase://database/{db_name}                                — single database
  - metabase://database/{db_name}/tables                         — all tables
  - metabase://database/{db_name}/models                         — models targeting this DB
  - metabase://database/{db_name}/schemas                        — list schemas
  - metabase://database/{db_name}/schema/{schema}/tables         — tables in one schema

  COLLECTION DRILL-DOWN (entity_id from serdes/meta):
  - metabase://collection/{entity_id}
  - metabase://collection/{entity_id}/items                      — subcollections + leaves
  - metabase://collection/{entity_id}/subcollections

  ENTITY DRILL-DOWN (entity_id from serdes/meta):
  - metabase://card/{entity_id}                                  — canonical for cards (model/question/metric)
  - metabase://model/{entity_id} | metabase://question/{entity_id}  — backcompat aliases for card
  - metabase://card/{entity_id}/fields[/{field_id}]              — schema + field samples
  - metabase://card/{entity_id}/sources                          — referenced database/table/source-card
  - metabase://metric/{entity_id}                                — single metric
  - metabase://metric/{entity_id}/dimensions[/{dim_id}]          — dimensions + samples
  - metabase://measure/{entity_id}                               — measure detail (definition + parent table)
  - metabase://segment/{entity_id}                              — segment detail (definition + parent table)
  - metabase://transform/{entity_id}                             — single transform
  - metabase://transform/{entity_id}/sources|/target             — input tables / output table
  - metabase://dashboard/{entity_id}                             — full MBR with tabs + dashcards
  - metabase://dashboard/{entity_id}/items                       — cards on the dashboard

  TABLE / FIELD (path-form):
  - metabase://database/{db_name}/schema/{schema}/table/{table_name}                — single table
  - metabase://database/{db_name}/schema/{schema}/table/{table_name}/fields         — schema + field samples
  - metabase://database/{db_name}/schema/{schema}/table/{table_name}/derived        — cards + transforms built on this table
  - metabase://database/{db_name}/schema/{schema}/table/{table_name}/field/{field_name} — single field"
  [{:keys [uris]} :- [:map {:closed true}
                      [:uris [:sequential [:string {:description "Metabase resource URIs to fetch"}]]]]]
  (try
    (read-resource {:uris uris})
    (catch Exception e
      (log/error e "Error in read_resource tool")
      {:output (str "Failed to read resources: " (or (ex-message e) "Unknown error"))})))
