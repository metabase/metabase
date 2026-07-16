(ns metabase.metabot.tools.resources
  "Tool for reading Metabase resources via URI patterns.

  Implements 'Context Engineering with Links' pattern where URIs serve as lightweight,
  token-efficient references to resources that can be fetched on-demand at the
  appropriate level of detail.

  URI dispatch uses [[metabase.util.match/match-one]] — every supported URI shape lives
  in the [[dispatch]] match table, and each fetch-* handler takes only the IDs/names it
  needs. Adding a new URI = adding one match clause + one focused fn.

  Supported URI patterns:

  Navigation (top-level lists, no id):
  - metabase://databases - list databases
  - metabase://collections - list root collections
  - metabase://collections?tree=true - flat list of all collections (hierarchy via :location)
  - metabase://user/recent-items - current user's recent items

  Pagination:
  List responses are capped at page-size items per page. When :truncated is true, use ?page=N to
  fetch subsequent pages, e.g. metabase://database/1/tables?page=2. The response includes
  :page (current, 1-indexed) and :pages (total).

  Database drill-down:
  - metabase://database/{id} - one database
  - metabase://database/{id}/tables - tables in the database
  - metabase://database/{id}/models - models targeting the database
  - metabase://database/{id}/schemas - schemas in the database
  - metabase://database/{id}/schemas/{schemaName}/tables - tables in a schema

  Collection drill-down:
  - metabase://collection/{id} - one collection
  - metabase://collection/{id}/items - direct children (subcollections + leaves)
  - metabase://collection/{id}/subcollections - just subcollections

  Entity drill-down:
  - metabase://table/{id} - basic table info
  - metabase://table/{id}/fields - table with fields
  - metabase://table/{id}/fields/{field_id} - specific field details
  - metabase://table/{id}/derived - cards/transforms derived from this table
  - metabase://model/{id} - basic model info
  - metabase://model/{id}/fields - model with fields
  - metabase://model/{id}/fields/{field_id} - specific field details
  - metabase://model/{id}/sources - tables/models this model is derived from
  - metabase://question/{id} - basic question info
  - metabase://question/{id}/fields - question with fields
  - metabase://question/{id}/fields/{field_id} - specific field details
  - metabase://question/{id}/sources - tables/models this question references
  - metabase://metric/{id} - basic metric info
  - metabase://metric/{id}/dimensions - metric with dimensions
  - metabase://metric/{id}/dimensions/{dimension_id} - specific dimension details
  - metabase://measure/{id} - measure detail (definition + parent table)
  - metabase://segment/{id} - segment detail (definition + parent table)
  - metabase://transform/{id} - transform details
  - metabase://transform/{id}/sources - tables/databases this transform reads from
  - metabase://transform/{id}/target - table this transform writes to
  - metabase://dashboard/{id} - dashboard details
  - metabase://dashboard/{id}/items - cards on the dashboard

  Conversation state (agent-memory charts/queries, e.g. pasted chart mentions):
  - metabase://chart/{chart_id} - chart type + query of a conversation chart
  - metabase://query/{query_id} - a query from this conversation's state"
  (:require
   [clojure.string :as str]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.api.common :as api]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.models.interface :as mi]
   [metabase.transforms.core :as transforms]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.match :as match]
   [metabase.warehouses.core :as warehouses]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private max-concurrent-uris
  "Maximum number of URIs that can be fetched in a single call."
  5)

(def ^:private page-size
  "Page size for list responses."
  25)

(defn- paginate-list
  "Return one page of items. `page-str` is a 1-indexed string (from a URI query param), defaults to 1.
   Page size is always `page-size`. Throws if `page-str` parses to a page number outside [1, pages]
   rather than silently clamping, so a caller (the agent) finds out it passed a bad value."
  [items page-str]
  (let [items (vec items)
        total (count items)
        pages (max 1 (int (Math/ceil (/ (double total) page-size))))
        page  (or (some-> page-str parse-long) 1)
        _     (when (or (< page 1) (> page pages))
                (throw (ex-info (str "Invalid page " page ". This list has " pages
                                     (if (= pages 1) " page." " pages."))
                                {:page page :pages pages})))
        start (* (dec page) page-size)]
    {:items (vec (take page-size (drop start items)))
     :total total
     :page  page
     :pages pages}))

(defn- list-result
  "Build a structured-output map for a list of items.
   `list-type` is a keyword like :databases, :collection-items, :recents, etc.
   `query-params` is the parsed URI query-param map; `:page` selects the page (1-indexed string)."
  ([list-type items] (list-result list-type items nil))
  ([list-type items query-params]
   (let [{:keys [items total page pages]} (paginate-list items (:page query-params))]
     {:structured-output
      {:result-type :metabot-list
       :list-type   list-type
       :items       items
       :total       total
       :page        page
       :pages       pages}})))

(defn- entity-result
  "Build a structured-output map for a single entity (databases, collections, etc.)."
  [item]
  {:structured-output (assoc item :result-type :metabot-entity)})

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
   - :segments     - vector of non-empty path segments (e.g. [\"database\" \"1\" \"tables\"])
   - :query-params - {keyword string} map (e.g. {:tree \"true\"}), or nil if no query string"
  [uri]
  (when-not (str/starts-with? uri "metabase://")
    (throw (ex-info (str "Invalid URI scheme. Expected 'metabase://' but got: " uri)
                    {:uri uri})))
  (let [stripped (subs uri 11)
        [path qs] (str/split stripped #"\?" 2)
        segments  (->> (str/split path #"/")
                       (remove str/blank?)
                       (mapv codec/url-decode))]
    (when (zero? (count segments))
      (throw (ex-info (str "Invalid URI: " uri " — empty path")
                      {:uri uri})))
    {:segments     segments
     :query-params (parse-query-string qs)}))

;; ----- Item presenters (list-row shapes) -----

(defn- present-database
  "Trim a database row to a token-frugal item map for list responses."
  [{:keys [id name engine description]}]
  {:type        "database"
   :id          id
   :name        name
   :engine      (some-> engine clojure.core/name)
   :description description
   :uri         (llm-shape/metabase-uri :database id)})

(defn- present-collection
  "Trim a collection row to an item map. `path-name` may be supplied if the caller pre-computed it."
  ([coll] (present-collection coll nil))
  ([{:keys [id name location authority_level description personal_owner_id]} path-name]
   {:type              "collection"
    :id                id
    :name              name
    :path              (or path-name name)
    :location          location
    :authority_level   authority_level
    :is_personal       (boolean personal_owner_id)
    :description       description
    :uri               (llm-shape/metabase-uri :collection id)}))

(defn- present-table
  [{:keys [id name display_name schema db_id description]}]
  {:type         "table"
   :id           id
   :name         name
   :display_name display_name
   :schema       schema
   :database_id  db_id
   :description  description
   :uri          (llm-shape/metabase-uri :table id)})

(defn- present-card
  "Cards (questions or models) — :type on a Card is :question / :model / :metric."
  [{:keys [id name type collection_id description database_id table_id]}]
  (let [model-type (case type
                     :model    "model"
                     :metric   "metric"
                     :question "question"
                     "question")]
    {:type          model-type
     :id            id
     :name          name
     :collection_id collection_id
     :database_id   database_id
     :table_id      table_id
     :description   description
     :uri           (llm-shape/metabase-uri (keyword model-type) id)}))

(defn- present-dashboard
  [{:keys [id name collection_id description]}]
  {:type          "dashboard"
   :id            id
   :name          name
   :collection_id collection_id
   :description   description
   :uri           (llm-shape/metabase-uri :dashboard id)})

(defn- present-transform
  [{:keys [id name description source_database_id]}]
  {:type        "transform"
   :id          id
   :name        name
   :database_id source_database_id
   :description description
   :uri         (llm-shape/metabase-uri :transform id)})

(defn- present-source-card
  "Resolve a source-card id to a typed item map (model / metric / question)."
  [source-card-id]
  (let [src-card (t2/select-one [:model/Card :id :type :card_schema] :id source-card-id)
        src-type (case (:type src-card)
                   :model  "model"
                   :metric "metric"
                   "question")]
    {:type src-type
     :id   source-card-id
     :uri  (llm-shape/metabase-uri (keyword src-type) source-card-id)}))

;; ----- Lineage helpers -----

(defn- card-sources-items
  "Build URI list for the entities a card references, FK-only (database_id, table_id, source_card_id)."
  [{:keys [database_id table_id source_card_id]}]
  (cond-> []
    database_id    (conj {:type "database"
                          :id   database_id
                          :uri  (llm-shape/metabase-uri :database database_id)})
    table_id       (conj {:type "table"
                          :id   table_id
                          :uri  (llm-shape/metabase-uri :table table_id)})
    source_card_id (conj (present-source-card source_card_id))))

(defn- transform-source-table-ids
  "FK-only source tables for a transform: walks (:source :source-tables) entries when present."
  [transform]
  (->> (get-in transform [:source :source-tables])
       (keep :table_id)))

;; ----- Fetch handlers (one per URI shape) -----

(defn- fetch-databases-list [query-params]
  (let [dbs (->> (t2/select [:model/Database :id :name :engine :description :is_audit]
                            :is_audit false
                            :router_database_id nil
                            {:order-by [[:%lower.name :asc]]})
                 (filter mi/can-read?)
                 (mapv present-database))]
    (list-result :databases dbs query-params)))

(defn- fetch-collections-list
  "metabase://collections (root only) and metabase://collections?tree=true (flat list of all)."
  [{:keys [tree] :as query-params}]
  (let [tree?    (= "true" tree)
        where    (cond-> [:and
                          [:= :archived false]
                          [:= :namespace nil]
                          ;; Exclude the system Trash collection from navigation listings.
                          [:or [:= :type nil] [:!= :type "trash"]]]
                   (not tree?) (conj [:= :location "/"]))
        colls    (->> (t2/select [:model/Collection :id :name :location :authority_level
                                  :description :personal_owner_id]
                                 {:where    where
                                  :order-by [[:location :asc] [:%lower.name :asc]]})
                      (filter mi/can-read?))
        ;; For tree mode, compute path names by chaining ancestor names.
        id->name (when tree? (into {} (map (juxt :id :name)) colls))
        ancestors (fn [{:keys [location]}]
                    (when (and location (not= "/" location))
                      (->> (str/split location #"/")
                           (remove str/blank?)
                           (keep parse-long))))
        path-of  (fn [coll]
                   (str/join "/" (concat (keep id->name (ancestors coll))
                                         [(:name coll)])))
        ;; Build items and, for tree mode, re-sort by computed path name.
        ;; The DB ORDER BY location ASC sorts path strings lexicographically — "/10/" sorts
        ;; before "/2/", interleaving children of high-ID parents incorrectly. Sorting by
        ;; the human-readable path ("Analytics/Reports") is stable and groups children
        ;; directly under their parents.
        items    (cond-> (mapv (fn [c] (present-collection c (when tree? (path-of c)))) colls)
                   tree? (->> (sort-by :path) vec))]
    (list-result (if tree? :collections-tree :collections-root) items query-params)))

(defn- fetch-user-recents []
  (let [recents (or (-> (activity-feed/get-recents api/*current-user-id* [:views])
                        :recents)
                    [])
        items   (mapv (fn [{:keys [id name model timestamp]}]
                        (let [type (case model
                                     "card"    "question"
                                     "dataset" "model"
                                     (or model "item"))]
                          {:type      type
                           :id        id
                           :name      name
                           :timestamp timestamp
                           :uri       (llm-shape/metabase-uri (keyword type) id)}))
                      recents)]
    (list-result :recent-items items)))

;; ----- Database drill-down -----

(defn- fetch-database [id-str]
  (let [db (warehouses/get-database (parse-long id-str))]
    (entity-result (present-database db))))

(defn- fetch-database-tables [id-str query-params]
  (let [db-id  (parse-long id-str)
        _      (warehouses/get-database db-id)
        tables (->> (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
                               :db_id  db-id
                               :active true
                               {:order-by [[:%lower.schema :asc] [:%lower.name :asc]]})
                    (filter mi/can-read?)
                    (mapv present-table))]
    (list-result :database-tables tables query-params)))

(defn- fetch-database-models [id-str query-params]
  (let [db-id  (parse-long id-str)
        _      (warehouses/get-database db-id)
        models (->> (t2/select [:model/Card :id :name :type :description :card_schema
                                :collection_id :database_id :table_id]
                               :type        :model
                               :database_id db-id
                               :archived    false
                               {:order-by [[:%lower.name :asc]]})
                    (filter mi/can-read?)
                    (mapv present-card))]
    (list-result :database-models models query-params)))

(defn- fetch-database-schemas [id-str query-params]
  (let [db-id   (parse-long id-str)
        _       (warehouses/get-database db-id)
        rows    (t2/query
                 {:select-distinct [:schema]
                  :from            [:metabase_table]
                  :where           [:and [:= :db_id db-id] [:= :active true]]
                  :order-by        [[:schema :asc]]})
        schemas (->> rows
                     (keep :schema)
                     (mapv (fn [s]
                             {:type        "schema"
                              :name        s
                              :database_id db-id
                              :uri         (llm-shape/metabase-uri :database db-id "schemas" s "tables")})))]
    (list-result :database-schemas schemas query-params)))

(defn- fetch-database-schema-tables [id-str schema-name query-params]
  (let [db-id  (parse-long id-str)
        _      (warehouses/get-database db-id)
        tables (->> (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
                               :db_id  db-id
                               :schema schema-name
                               :active true
                               {:order-by [[:%lower.name :asc]]})
                    (filter mi/can-read?)
                    (mapv present-table))]
    (list-result :database-schema-tables tables query-params)))

;; ----- Collection drill-down -----

(defn- fetch-collection [id-str]
  (let [coll (api/read-check :model/Collection (parse-long id-str))]
    (entity-result (present-collection coll))))

(defn- fetch-collection-items [id-str query-params]
  (let [coll-id        (parse-long id-str)
        coll           (api/read-check :model/Collection coll-id)
        cards          (->> (t2/select [:model/Card :id :name :type :description :card_schema
                                        :collection_id :database_id :table_id]
                                       {:where    [:and [:= :collection_id coll-id] [:= :archived false]]
                                        :order-by [[:%lower.name :asc]]})
                            (filter mi/can-read?))
        dashboards     (->> (t2/select [:model/Dashboard :id :name :description :collection_id]
                                       :collection_id coll-id
                                       :archived      false
                                       {:order-by [[:%lower.name :asc]]})
                            (filter mi/can-read?))
        subcollections (->> (t2/select [:model/Collection :id :name :location :authority_level
                                        :description :personal_owner_id]
                                       :location (str (:location coll) coll-id "/")
                                       :archived false
                                       {:order-by [[:%lower.name :asc]]})
                            (filter mi/can-read?))
        items          (concat (map present-collection subcollections)
                               (map present-card cards)
                               (map present-dashboard dashboards))]
    (list-result :collection-items items query-params)))

(defn- fetch-collection-subcollections [id-str query-params]
  (let [coll-id (parse-long id-str)
        coll    (api/read-check :model/Collection coll-id)
        subs    (->> (t2/select [:model/Collection :id :name :location :authority_level
                                 :description :personal_owner_id]
                                :location (str (:location coll) coll-id "/")
                                :archived false
                                {:order-by [[:%lower.name :asc]]})
                     (filter mi/can-read?)
                     (mapv present-collection))]
    (list-result :collection-subcollections subs query-params)))

;; ----- Table -----

(defn- check-resource-database
  "Require that a resource's backing database is addressable as a Metabot resource.
   Routed destination databases are routing internals here: users should navigate via
   the router database, not direct destination-backed resource URIs."
  [db-id]
  (when db-id
    (warehouses/get-database db-id)))

(defn- check-table-resource-database [table-id]
  (when-let [table (api/read-check :model/Table table-id)]
    (check-resource-database (:db_id table))))

(defn- check-card-resource-database [card-id]
  (when-let [card (api/read-check :model/Card card-id)]
    (check-resource-database (:database_id card))))

(defn- check-measure-or-segment-resource-database [model id]
  (when-let [table-id (t2/select-one-fn :table_id model :id id)]
    (check-table-resource-database table-id)))

(defn- table-details
  "Shared `entity-details/get-table-details` call for both /table/{id} and /table/{id}/fields.
   `entity-type` is :table, :model, or :question."
  [entity-type id with-fields?]
  (case entity-type
    :table (check-table-resource-database id)
    (:model :question) (check-card-resource-database id))
  (entity-details/get-table-details {:entity-type          entity-type
                                     :entity-id            id
                                     :with-fields?         with-fields?
                                     :with-field-values?   false
                                     :with-related-tables? (= entity-type :table)
                                     :with-measures?       true
                                     :with-segments?       true}))

(defn- fetch-table [id-str]
  (table-details :table (parse-long id-str) false))

(defn- fetch-table-fields [id-str]
  (table-details :table (parse-long id-str) true))

(defn- fetch-table-field [id-str field-id]
  (let [table-id (parse-long id-str)]
    (check-table-resource-database table-id)
    (field-stats/field-values {:entity-type "table"
                               :entity-id   table-id
                               :field-id    field-id
                               :limit       30})))

(defn- fetch-table-derived [id-str query-params]
  (let [table-id   (parse-long id-str)
        table      (api/read-check :model/Table table-id)
        db-id      (:db_id table)
        _          (check-resource-database db-id)
        cards      (->> (t2/select [:model/Card :id :name :type :description :card_schema
                                    :collection_id :database_id :table_id]
                                   :table_id table-id
                                   :archived false
                                   {:order-by [[:%lower.name :asc]]})
                        (filter mi/can-read?)
                        (mapv present-card))
        ;; SQL-narrow transforms by source_database_id (a transform can only reference
        ;; tables in its source DB). Pull `:source` in the same select to extract source
        ;; table ids in memory — no per-row re-fetch. Apply the can-read? check last,
        ;; on the already-narrowed candidate set.
        transforms (when db-id
                     (->> (t2/select [:model/Transform :id :name :description
                                      :source_database_id :source]
                                     :source_database_id db-id
                                     {:order-by [[:%lower.name :asc]]})
                          (filter (fn [t] (some #{table-id} (transform-source-table-ids t))))
                          (filter mi/can-read?)
                          (mapv present-transform)))]
    (list-result :table-derived (concat cards transforms) query-params)))

;; ----- Card (model / question) -----

(defn- fetch-card
  "type-str is \"model\" or \"question\"."
  [type-str id-str]
  (table-details (keyword type-str) (parse-long id-str) false))

(defn- fetch-card-fields [type-str id-str]
  (table-details (keyword type-str) (parse-long id-str) true))

(defn- fetch-card-field [type-str id-str field-id]
  (let [card-id (parse-long id-str)]
    (check-card-resource-database card-id)
    (field-stats/field-values {:entity-type type-str
                               :entity-id   card-id
                               :field-id    field-id
                               :limit       30})))

(defn- fetch-card-sources [id-str]
  (let [card (api/read-check :model/Card (parse-long id-str))]
    (check-resource-database (:database_id card))
    (list-result :card-sources (card-sources-items card))))

;; ----- Metric -----

(defn- fetch-metric [id-str]
  (let [metric-id (parse-long id-str)]
    (check-card-resource-database metric-id)
    (entity-details/get-metric-details {:metric-id                 metric-id
                                        :with-queryable-dimensions false
                                        :with-field-values         false})))

(defn- fetch-metric-dimensions [id-str]
  (let [metric-id (parse-long id-str)]
    (check-card-resource-database metric-id)
    (entity-details/get-metric-details {:metric-id                 metric-id
                                        :with-queryable-dimensions true
                                        :with-field-values         false})))

(defn- fetch-metric-dimension [id-str dim-id]
  (let [metric-id (parse-long id-str)]
    (check-card-resource-database metric-id)
    (field-stats/field-values {:entity-type "metric"
                               :entity-id   metric-id
                               :field-id    dim-id
                               :limit       30})))

;; ----- Measure / Segment -----

(defn- fetch-measure [id-str]
  (let [measure-id (parse-long id-str)]
    (check-measure-or-segment-resource-database :model/Measure measure-id)
    (entity-details/get-measure-details {:measure-id measure-id})))

(defn- fetch-segment [id-str]
  (let [segment-id (parse-long id-str)]
    (check-measure-or-segment-resource-database :model/Segment segment-id)
    (entity-details/get-segment-details {:segment-id segment-id})))

;; ----- Transform -----

(defn- fetch-transform [id-str]
  {:structured-output (-> (transforms/get-transform (parse-long id-str))
                          (assoc :result-type :entity :type :transform))})

(defn- fetch-transform-sources [id-str]
  (let [transform        (transforms/get-transform (parse-long id-str))
        source-table-ids (transform-source-table-ids transform)
        source-tables    (when (seq source-table-ids)
                           (->> (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
                                           :id [:in (set source-table-ids)])
                                (filter mi/can-read?)
                                (mapv present-table)))
        db-id            (:source_database_id transform)
        items            (cond-> []
                           db-id         (conj {:type "database"
                                                :id   db-id
                                                :uri  (llm-shape/metabase-uri :database db-id)})
                           source-tables (into source-tables))]
    (list-result :transform-sources items)))

(defn- fetch-transform-target [id-str]
  (let [transform    (transforms/get-transform (parse-long id-str))
        ;; The target table is hydrated by `transforms/get-transform` without a per-table
        ;; permission check (the read-check on the Transform itself only verifies *source*
        ;; tables are readable). Gate it here so users who can read the transform definition
        ;; but lack perms on the target database don't see the target's name/schema.
        target-table (when-let [tt (:table transform)]
                       (when (mi/can-read? tt) tt))
        db-id        (:target_db_id transform)
        items        (cond-> []
                       db-id        (conj {:type "database"
                                           :id   db-id
                                           :uri  (llm-shape/metabase-uri :database db-id)})
                       target-table (conj (present-table target-table)))]
    (list-result :transform-target items)))

;; ----- Dashboard -----

(defn- fetch-dashboard [id-str]
  (let [result (entity-details/get-dashboard-details {:dashboard-id (parse-long id-str)})]
    (if-let [dashboard (:structured-output result)]
      {:structured-output (assoc dashboard :result-type :entity)}
      {:status-code 404 :output (:output result)})))

(defn- present-non-question-dashcard
  "Dashcards not rendered as a saved question — virtual cards (headings, text, links, ...) and
   action buttons (which may reference a backing model via `card_id` but render as a button).
   They carry their `dashcard_id` — the handle `update_dashboard` remove/move/update_text
   mutations take. The card's text (or a link card's target) renders as the item body via
   `:description`."
  [{:keys [id action_id visualization_settings]}]
  (let [display (some-> (get-in visualization_settings [:virtual_card :display]) name)]
    ;; action_id wins over the virtual display: frontend-created action buttons carry BOTH an
    ;; action_id and a virtual_card with display "action", and should read as one type.
    {:type        (cond
                    action_id "action"
                    display   (str "virtual_" display)
                    :else     "virtual_dashcard")
     :dashcard_id id
     ;; action buttons carry their visible label here; nil for virtual cards
     :name        (:button.label visualization_settings)
     ;; external link URLs only: an entity link's stored :link :entity snapshot (name etc.) may
     ;; describe something this user can't read, so rendering it would bypass the read-check the
     ;; REST path applies via the :dashcard/linkcard-info hydration
     :description (or (:text visualization_settings)
                      (get-in visualization_settings [:link :url]))}))

(defn- fetch-dashboard-items
  "One item per dashcard in row/col (layout) order, each carrying the `dashcard_id` that
   `update_dashboard` remove/move/update_text mutations take. On a tabbed dashboard the items come
   grouped by tab (nil-tab dashcards belong to the first tab, where the frontend renders them),
   each carries its `tab_id`, and the response's `:tabs` lists every tab — empty ones included —
   in display order. Card-backed dashcards keep the card fields; virtual dashcards (headings,
   text, links, ...) render their text; action buttons keep a `uri` to their backing model when
   it's readable. Dashcards whose card is archived or unreadable are omitted."
  [id-str query-params]
  (let [dashboard-id (parse-long id-str)
        _            (api/read-check :model/Dashboard dashboard-id)
        tabs         (t2/select [:model/DashboardTab :id :name] :dashboard_id dashboard-id
                                {:order-by [[:position :asc] [:id :asc]]})
        dashcards    (t2/select [:model/DashboardCard :id :card_id :action_id :dashboard_tab_id
                                 :visualization_settings]
                                :dashboard_id dashboard-id
                                {:order-by [[:row :asc] [:col :asc]]})
        card-ids     (into #{} (keep :card_id) dashcards)
        readable     (when (seq card-ids)
                       (->> (t2/select [:model/Card :id :name :type :description :card_schema
                                        :collection_id :database_id :table_id]
                                       :id [:in card-ids]
                                       :archived false)
                            (filter mi/can-read?)
                            (into {} (map (juxt :id identity)))))
        ->item       (fn [{:keys [id card_id action_id] :as dashcard}]
                       ;; action_id wins over card_id: an action button may reference its backing
                       ;; model through card_id but renders as a button — with a uri to that model
                       ;; so it stays drillable.
                       (if (and card_id (not action_id))
                         (when-let [card (get readable card_id)]
                           (assoc (present-card card) :dashcard_id id))
                         (cond-> (present-non-question-dashcard dashcard)
                           (get readable card_id) (assoc :uri (:uri (present-card (get readable card_id)))))))
        items        (if (seq tabs)
                       ;; group by tab without emitting tab pseudo-items — those would inflate the
                       ;; paginated total; the tab list rides on the response as `:tabs` instead.
                       ;; `sort-by` is stable, so the SQL row/col ordering survives within each
                       ;; tab; a nil tab id means the frontend renders the card on the first tab.
                       (let [tab-pos (into {} (map-indexed (fn [i {:keys [id]}] [id i])) tabs)
                             eff-tab #(or (:dashboard_tab_id %) (:id (first tabs)))]
                         (into []
                               (keep (fn [dashcard]
                                       (some-> (->item dashcard) (assoc :tab_id (eff-tab dashcard)))))
                               (sort-by (comp tab-pos eff-tab) dashcards)))
                       (into [] (keep ->item) dashcards))]
    (cond-> (list-result :dashboard-items items query-params)
      (seq tabs) (update :structured-output assoc :tabs (mapv #(select-keys % [:id :name]) tabs)))))

(defn- fetch-conversation-query
  "Present a query stored in this conversation's agent state (created by tools or pasted
  as a chart mention). Read-checks the query's database before exporting it with resolved
  table/field names."
  [query-id]
  (if-let [query (get (shared/current-queries-state) query-id)]
    (do
      (when-let [database-id (and (map? query) (:database query))]
        (api/read-check :model/Database database-id))
      (entity-result
       {:type        "conversation-query"
        :id          query-id
        :description (llm-shape/export-query-for-llm query)}))
    {:status-code 404
     :output (str "No chart or query with id '" query-id "' exists in this conversation. "
                  "It may belong to another conversation; ask the user to paste or recreate it here.")}))

(defn- fetch-conversation-chart
  "Present a chart stored in this conversation's agent state (created by chart tools or
  pasted as a mention). Falls back to the queries state when the id is actually a query id."
  [chart-id]
  (if-let [chart (get (shared/current-charts-state) chart-id)]
    (let [query (or (first (:queries chart))
                    (get (shared/current-queries-state) (:query_id chart)))]
      (when-let [database-id (and (map? query) (:database query))]
        (api/read-check :model/Database database-id))
      (entity-result
       {:type        "conversation-chart"
        :id          chart-id
        :description (str "Chart type: "
                          (or (some-> (get-in chart [:visualization_settings :chart_type]) name)
                              "table")
                          "\nQuery:\n"
                          (llm-shape/export-query-for-llm query))}))
    (fetch-conversation-query chart-id)))

;; ----- Dispatch -----

(def ^:private numeric-id-uri-types
  "URI entity-type segments whose next segment must be a numeric id (see `dispatch`)."
  #{"database" "collection" "table" "model" "question" "metric"
    "measure" "segment" "transform" "dashboard"})

(defn- check-numeric-id-segment!
  "Entity URIs take numeric ids only. The common miss is the LLM pasting a 21-char entity id
   where the numeric id belongs; without this check that fails downstream as a bare 404 the
   LLM misreads as a permissions problem. Throw a directive error instead so it
   self-corrects in one step."
  [uri [type-seg id-seg]]
  (when (and (numeric-id-uri-types type-seg)
             (some? id-seg)
             (nil? (parse-long id-seg)))
    (throw (ex-info
            (str "Invalid id `" id-seg "` in URI. read_resource URIs use the numeric entity "
                 "id — copy the `uri` attribute from a search result, or build the URI from "
                 "its numeric `id` attribute, e.g. metabase://" type-seg "/42.")
            {:agent-error? true
             :status-code  400
             :uri          uri
             :id-segment   id-seg}))))

(defn- dispatch
  "Route a parsed URI to the right fetch handler. The match-one table is the canonical
   list of supported URI shapes — adding a new URI = adding a clause here + a handler.

   Pattern ordering: more-specific patterns (no rest-binding) must come before less-specific
   ones (with rest-binding) so the exact-length match wins for the no-extra-segments case."
  [uri]
  (let [{:keys [segments query-params]} (parse-uri uri)]
    (check-numeric-id-segment! uri segments)
    (match/match-one segments
      ;; Navigation
      ["databases"]                                    (fetch-databases-list query-params)
      ["collections"]                                  (fetch-collections-list query-params)
      ["user" "recent-items"]                          (fetch-user-recents)

      ;; Database drill-down
      ["database" id]                                  (fetch-database id)
      ["database" id "tables"]                         (fetch-database-tables id query-params)
      ["database" id "models"]                         (fetch-database-models id query-params)
      ["database" id "schemas"]                        (fetch-database-schemas id query-params)
      ["database" id "schemas" schema "tables"]        (fetch-database-schema-tables id schema query-params)

      ;; Collection drill-down
      ["collection" id]                                (fetch-collection id)
      ["collection" id "items"]                        (fetch-collection-items id query-params)
      ["collection" id "subcollections"]               (fetch-collection-subcollections id query-params)

      ;; Table
      ["table" id]                                     (fetch-table id)
      ["table" id "fields"]                            (fetch-table-fields id)
      ["table" id "fields" & rst]                      (fetch-table-field id (str/join "/" rst))
      ["table" id "derived"]                           (fetch-table-derived id query-params)

      ;; Card (model / question — share handlers, dispatch on the type segment)
      [(t :guard #{"model" "question"}) id]            (fetch-card t id)
      [(t :guard #{"model" "question"}) id "fields"]   (fetch-card-fields t id)
      [(t :guard #{"model" "question"}) id "fields" & rst] (fetch-card-field t id (str/join "/" rst))
      [(t :guard #{"model" "question"}) id "sources"]  (fetch-card-sources id)

      ;; Metric
      ["metric" id]                                    (fetch-metric id)
      ["metric" id "dimensions"]                       (fetch-metric-dimensions id)
      ["metric" id "dimensions" & rst]                 (fetch-metric-dimension id (str/join "/" rst))

      ;; Measure / Segment
      ["measure" id]                                   (fetch-measure id)
      ["segment" id]                                   (fetch-segment id)

      ;; Transform
      ["transform" id]                                 (fetch-transform id)
      ["transform" id "sources"]                       (fetch-transform-sources id)
      ["transform" id "target"]                        (fetch-transform-target id)

      ;; Dashboard
      ["dashboard" id]                                 (fetch-dashboard id)
      ["dashboard" id "items"]                         (fetch-dashboard-items id query-params)

      ;; Conversation state
      ["chart" id]                                     (fetch-conversation-chart id)
      ["query" id]                                     (fetch-conversation-query id)

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
   Dispatches to the right llm-shape formatter based on :result-type.
   Returns the :output string directly for error results (404s etc.)."
  [content]
  (if-let [structured (:structured-output content)]
    (case (:result-type structured)
      ;; NOTE: keep in sync with agent/tools/metadata.clj/format-field-metadata-output
      :field-metadata (format-with-instructions
                       (llm-shape/field-metadata->xml structured)
                       instructions/field-metadata-instructions)
      :entity         (llm-shape/entity->xml structured)
      :metabot-list   (llm-shape/metabot-list->xml structured)
      :metabot-entity (llm-shape/metabot-entity->xml structured)
      ;; fallback — should not happen, but better than EDN
      (llm-shape/entity->xml structured))
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
  the instance and drill into specific entities. URIs returned by `search` can be fed directly
  back here. Only numeric IDs accepted, never alphanumeric entity-id's.

  Up to 5 URIs may be requested in one call. List responses are capped at 25 items per page.
  When :truncated is true, append ?page=N to fetch the next page (e.g. metabase://database/1/tables?page=2).
  The response includes :page (current, 1-indexed) and :pages (total page count).

  NAVIGATION (top-level lists):
  - metabase://databases - all databases
  - metabase://collections - root collections
  - metabase://collections?tree=true - flat list of all collections (use :location for hierarchy)
  - metabase://user/recent-items - your recently-viewed items

  DATABASE DRILL-DOWN:
  - metabase://database/{id}
  - metabase://database/{id}/tables
  - metabase://database/{id}/models
  - metabase://database/{id}/schemas
  - metabase://database/{id}/schemas/{schemaName}/tables

  COLLECTION DRILL-DOWN:
  - metabase://collection/{id}
  - metabase://collection/{id}/items - subcollections + leaves
  - metabase://collection/{id}/subcollections

  ENTITY DRILL-DOWN:
  - metabase://table/{id}[/fields[/{field_id}]] [/derived]
  - metabase://model/{id}[/fields[/{field_id}]] [/sources]
  - metabase://question/{id}[/fields[/{field_id}]] [/sources]
  - metabase://metric/{id}[/dimensions[/{dim_id}]]
  - metabase://measure/{id}
  - metabase://segment/{id}
  - metabase://transform/{id}[/sources|/target]
  - metabase://dashboard/{id}[/items]

  CONVERSATION STATE (charts and queries generated in or pasted into this conversation,
  e.g. referenced in a user message as [name](metabase://chart/{id})):
  - metabase://chart/{chart_id} - the chart's type and its query
  - metabase://query/{query_id} - the query definition"
  [{:keys [uris]} :- [:map {:closed true}
                      [:uris [:sequential [:string {:description "Metabase resource URIs to fetch"}]]]]]
  (try
    (read-resource {:uris uris})
    (catch Exception e
      (log/error e "Error in read_resource tool")
      {:output (str "Failed to read resources: " (or (ex-message e) "Unknown error"))})))
