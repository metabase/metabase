(ns metabase-enterprise.content-diagnostics.api
  "Content Diagnostics API - a paginated, batch-hydrated latest-per-entity finding list, mounted
  behind `premium-handler … :content-diagnostics` (`+auth` + feature gate). The scan runs on a Quartz job.

  Response shape: a flat identity (`id, finding_type, entity_type, entity_id, detected_at,
  entity_display_name`) plus a nested typed `details` merging the stored verdict with live-hydrated
  `collection`, `description`, `owner`, and `creator`."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- valid-clause
  "Result set for one `finding-type`: its latest finding per entity, excluding entities whose latest row
  is invalidated (an older valid row does not resurface)."
  [finding-type]
  [:and
   [:= :invalidated_at nil]
   [:= :finding_type finding-type]
   ;; latest finding per entity = MAX(id) per (entity_type, entity_id, finding_type). id is the recency
   ;; key (monotonic; scan_id is a random UUID). Latest-per-entity, not newest-scan-only, so an entity a
   ;; partial scan hasn't re-written yet still shows its last finding.
   [:in :id {:select   [[[:max :id] :id]]
             :from     [(t2/table-name :model/ContentDiagnosticsFinding)]
             :group-by [:entity_type :entity_id :finding_type]}]])

;;; ------------------------------ per-caller read-time filters (shared) --------------------------------
;;; Resolved live at read time against each entity's *current* collection (not scan-time
;;; `scope_collection_id`): visibility (always) + personal-collection exclusion (param-gated).

(defn- entity-collection-clauses
  "Per entity-type, a clause keeping findings whose entity's current `collection_id` satisfies `coll-pred`.
  Resolved live against the entity's own table (`scan/entity-type->model`); entity-types with no model
  contribute nothing. Callers combine the seq with `:or`/`:and`."
  [coll-pred]
  (for [[etype model] scan/entity-type->model]
    [:and
     [:= :entity_type (name etype)]
     [:in :entity_id {:select [:id]
                      :from   [(t2/table-name model)]
                      :where  coll-pred}]]))

(defn- visible-findings-clause
  "Keep only findings whose entity is in a collection the current user can read - always applied.
  Fail-closed: an entity-type with no collection model is dropped."
  []
  (into [:or] (entity-collection-clauses (collection/visible-collection-filter-clause :collection_id))))

(defn- personal-collection-ids
  "Live set of collection ids that are, or are nested under, a personal collection - a `personal_owner_id`
  root plus any `location` descendant. Empty when there are none."
  []
  (if-let [roots (not-empty (t2/select-pks-vec :model/Collection :personal_owner_id [:not= nil]))]
    (t2/select-pks-set :model/Collection
                       {:where (into [:or [:in :id roots]]
                                     (map (fn [pid] [:like :location (str "/" pid "/%")]))
                                     roots)})
    #{}))

(defn- name-search-clause
  "Case-insensitive substring match on the denormalized `entity_name`. Nil for a blank/absent query.
  `%`/`_` are not escaped - they act as LIKE wildcards, matching the app's fuzzy name search."
  [query]
  (when-let [q (some-> query str/trim not-empty u/lower-case-en)]
    [:like [:lower :entity_name] (str "%" q "%")]))

(defn- exclude-personal-collections-clause
  "WHERE fragment dropping findings whose entity currently lives in a personal collection (root and
  regular-collection entities are kept). Nil when there is nothing to exclude."
  []
  (when-let [pids (seq (personal-collection-ids))]
    (into [:and]
          (map (fn [clause] [:not clause]))
          (entity-collection-clauses [:in :collection_id pids]))))

;;; ----------------------------------- display hydration (shared layer) --------------------------------
;;; name/created_at/last_active_at/creator are denormalized (frozen at scan time); description + the
;;; collection breadcrumb are live-hydrated, batched per entity-type.

(defn- entity-context
  "For one entity-type's id set → `{entity-id → row}`. Live-hydrates only the non-denormalized display
  fields: `description`, `collection_id`, and (transform only) the owner. `document` has no description."
  [entity-type ids]
  (when-let [model (scan/entity-type->model entity-type)]
    (let [cols (cond-> [:id :collection_id]
                 (not= entity-type :document) (conj :description)
                 (= entity-type :transform)   (conj :owner_user_id :owner_email))
          rows (cond-> (t2/select (into [model] cols) :id [:in (set ids)])
                 ;; reuse the transform model's batched :owner hydrate (user row, or {:email …} external)
                 (= entity-type :transform) (t2/hydrate :owner))]
      (m/index-by :id rows))))

(defn- collection-breadcrumbs
  "For a set of collection ids → `{collection-id → {:id :name :effective_ancestors [{:id :name} …]}}`.
  Hydrates the permission-filtered `:effective_ancestors` breadcrumb. Selects the full row (the hydrate
  needs `:location`). No entry for root/nil collections."
  [coll-ids]
  (when (seq coll-ids)
    (let [colls (t2/hydrate (t2/select :model/Collection :id [:in (set coll-ids)])
                            :effective_ancestors)]
      (into {}
            (map (fn [c]
                   [(:id c)
                    {:id                  (:id c)
                     :name                (:name c)
                     :effective_ancestors (mapv #(select-keys % [:id :name]) (:effective_ancestors c))}]))
            colls))))

(defn- normalized-owner
  "Normalized `owner` from the transform `:owner` hydrate: `{id,name,email,type:user}` or, for an external
  email-only owner, `{email,type:external}`. Nil for entity types with no owner (card/dashboard/document)."
  [{:keys [owner]}]
  (when owner
    (let [{:keys [id common_name email]} owner]
      (if id
        {:id id :name common_name :email email :type :user}
        {:email email :type :external}))))

(defn- hydrate-findings
  "Project stored findings into the response shape: flat identity + denormalized display fields, plus a
  nested `details` = stored verdict + {collection, description, owner, creator}. Batched, page-size-independent."
  [findings]
  (let [ctx-by-type (into {} (for [[etype rows] (group-by :entity_type findings)]
                               [etype (entity-context etype (map :entity_id rows))]))
        coll-ids    (into #{} (keep (fn [{:keys [entity_type entity_id]}]
                                      (get-in ctx-by-type [entity_type entity_id :collection_id])))
                          findings)
        breadcrumbs (collection-breadcrumbs coll-ids)]
    (mapv (fn [{:keys [id finding_type entity_type entity_id detected_at last_active_at entity_created_at
                       entity_name entity_creator_id entity_creator_name details]}]
            (let [entity (get-in ctx-by-type [entity_type entity_id])]
              {:id                  id
               :finding_type        finding_type
               :entity_type         entity_type
               :entity_id           entity_id
               :detected_at         detected_at
               :entity_display_name entity_name
               :last_active_at      last_active_at
               :created_at          entity_created_at
               :details             (merge details
                                           {:collection  (get breadcrumbs (:collection_id entity))
                                            :description (:description entity)
                                            ;; only transforms have owner columns; null for the rest.
                                            :owner       (normalized-owner entity)
                                            ;; creator denormalized (id + common_name) - no live :creator hydrate.
                                            :creator     (when entity_creator_id
                                                           {:id entity_creator_id :name entity_creator_name :type :user})})}))
          findings)))

(defn- last-scan-at
  "`detected_at` of the most recent finding overall (≈ the latest scan's time), or nil if none."
  []
  (t2/select-one-fn :detected_at :model/ContentDiagnosticsFinding {:order-by [[:detected_at :desc]]}))

;;; -------------------------------------------- response schema ----------------------------------------

(def ^:private NormalizedUser
  "A finding's `owner`: a Metabase user `{id,name,email,type:user}`, or - for an external transform owner -
  `{email,type:external}`, or nil. Keys optional to admit both variants."
  [:maybe [:map
           [:id    {:optional true} [:maybe :int]]
           [:name  {:optional true} [:maybe :string]]
           [:email {:optional true} [:maybe :string]]
           [:type  :keyword]]])

(def ^:private Creator
  "A finding's `creator`: a Metabase user `{id,name,type:user}` (denormalized from
  `entity_creator_id`/`entity_creator_name`), or nil. No `email` (not denormalized); `type` is always `:user`."
  [:maybe [:map {:closed true}
           [:id   :int]
           [:name [:maybe :string]]
           [:type [:= :user]]]])

(def ^:private StaleFinding
  "Response item for a `stale` finding: flat identity + nested typed `details`."
  [:map
   [:id                  :int]
   [:finding_type        :keyword]
   [:entity_type         :keyword]
   [:entity_id           :int]
   [:detected_at         some?]
   [:entity_display_name [:maybe :string]]
   ;; frozen scan-time activity anchor; nil ⇒ never used/ran (top-level, SQL-filterable by threshold-days)
   [:last_active_at      [:maybe some?]]
   ;; entity's created_at, denormalized at scan time (immutable ⇒ equals live)
   [:created_at          [:maybe some?]]
   [:details
    [:map
     [:collection     [:maybe :map]]
     [:description    [:maybe :string]]
     [:owner          NormalizedUser]
     [:creator        Creator]
     [:threshold_days {:optional true} :int]]]])

(def ^:private sort-directions
  "Valid sort directions for the stale list."
  #{:asc :desc})

(def ^:private sort-column->field
  "Sortable stale-list params → their native `content_diagnostics_finding` column. Entity attributes are
  denormalized at scan time (see `scan/stale-checker`), so sorting is a plain `ORDER BY` with no join."
  {:detected-at  :detected_at
   :entity-type  :entity_type
   :name         :entity_name
   :created-at   :entity_created_at
   :created-by   :entity_creator_name
   :last-active-at :last_active_at})

(def ^:private stale-entity-types
  "Entity types the `stale` finding type covers - every covered type emits today (see
  `scan/entity-type->model`)."
  #{:card :dashboard :document :transform})

(defn- stale-where-clause
  "WHERE for the stale list: the valid + permission-visible base, narrowed by the optional per-request
  filters. Each optional filter is precomputed so a nil (no-op) filter is skipped, not conjoined as a
  null AND-term."
  [{:keys [include-personal-collections entity-types threshold-days query]}]
  (let [personal-filter    (when-not include-personal-collections (exclude-personal-collections-clause))
        entity-type-filter (when-let [types (not-empty (u/one-or-many entity-types))]
                             [:in :entity_type (mapv name types)])
        ;; "less stale than threshold-days" = active more recently than the cutoff → excluded. Never-used
        ;; (`last_active_at` nil) is maximally stale, so it always passes. Mirrors the scan-time cutoff.
        threshold-filter   (when threshold-days
                             (let [cutoff (t/minus (t/local-date) (t/days threshold-days))]
                               [:or [:= :last_active_at nil] [:<= :last_active_at cutoff]]))
        name-search-filter (name-search-clause query)]
    (cond-> [:and (valid-clause "stale") (visible-findings-clause)]
      personal-filter    (conj personal-filter)
      entity-type-filter (conj entity-type-filter)
      threshold-filter   (conj threshold-filter)
      name-search-filter (conj name-search-filter))))

;;; ------------------------------------------------ endpoints ------------------------------------------

(api.macros/defendpoint :get "/stale"
  :- [:map
      [:data         [:sequential StaleFinding]]
      [:total        :int]
      [:limit        [:maybe :int]]
      [:offset       [:maybe :int]]
      [:last_scan_at [:maybe some?]]]
  "List **stale** findings - the latest valid `stale` finding per entity, permission-filtered
  for the current user. Each item is a flat identity + a nested `details` (collection, `description`, `owner`,
  `creator`, `threshold_days`). Paginated via `limit`/`offset`; `total` is the full valid count.

  Params: `include-personal-collections` (default false) - when false, entities currently in a personal
  collection are excluded. `entity-types` (repeatable; `card`|`dashboard`|`document`|`transform`, omitted =
  all). `threshold-days` (positive int) keeps findings with `last_active_at` on or before `today -
  threshold-days` (never-used always pass). `query` case-insensitively substring-matches the entity name.
  `sort-column` (`detected-at`|`entity-type`|`name`|`created-at`|`created-by`|`last-active-at`, default
  `detected-at`) + `sort-direction` (`asc`|`desc`, default `asc`); `id` is the stable tiebreak."
  [_route-params
   {:keys [include-personal-collections sort-column sort-direction entity-types threshold-days query]
    :or   {include-personal-collections false
           sort-column                   :detected-at
           sort-direction                :asc}}
   :- [:map
       [:include-personal-collections {:optional true} :boolean]
       [:sort-column    {:optional true} (ms/enum-decode-keyword (keys sort-column->field))]
       [:sort-direction {:optional true} (ms/enum-decode-keyword sort-directions)]
       [:entity-types   {:optional true} [:or
                                          (ms/enum-decode-keyword stale-entity-types)
                                          [:sequential (ms/enum-decode-keyword stale-entity-types)]]]
       [:threshold-days {:optional true} ms/PositiveInt]
       [:query          {:optional true} :string]]]
  (let [where (stale-where-clause {:include-personal-collections include-personal-collections
                                   :entity-types                 entity-types
                                   :threshold-days               threshold-days
                                   :query                        query})
        page  (t2/select :model/ContentDiagnosticsFinding
                         (cond-> {:where    where
                                  :order-by [[(sort-column->field sort-column) sort-direction]
                                             [:id sort-direction]]}
                           (request/limit)  (assoc :limit (request/limit))
                           (request/offset) (assoc :offset (request/offset))))]
    {:data         (hydrate-findings page)
     :total        (t2/count :model/ContentDiagnosticsFinding {:where where})
     :limit        (request/limit)
     :offset       (request/offset)
     :last_scan_at (last-scan-at)}))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Content Diagnostics API."
  (api.macros/ns-handler *ns* +auth))
