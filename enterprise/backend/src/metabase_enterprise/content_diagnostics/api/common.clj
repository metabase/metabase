(ns metabase-enterprise.content-diagnostics.api.common
  "Shared read-path helpers the thin `api` endpoints compose: the read-time WHERE fragments
  (validity, per-caller collection visibility, personal-collection exclusion, name search), the batched
  display hydration, and the schema/sort fragments every per-finding-type endpoint composes.

  All per-caller concerns resolve **live at read time** against each finding's *current* collection (never
  the scan-time `scope_collection_id`). Display attrs (name/created_at/creator) are denormalized at scan
  time; description, the collection breadcrumb, the transform owner, and slow roll-up culprits hydrate live."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase.collections.models.collection :as collection]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def covered-entity-types
  "Entity types the stale/slow finding types can emit - deliberately a hardcoded set, NOT derived from
  `common/entity-type->model` (which also covers `:collection`, an imbalanced-only subject). Shared by
  the stale/slow endpoints' `entity-types` param; endpoints spanning other subjects pin their own enum."
  #{:card :dashboard :document :transform})

(defn valid-clause
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

(defn entity-collection-clauses
  "Per entity-type, a clause keeping findings whose entity's current collection satisfies the predicate
  built by `coll-pred-fn` - a fn of the column holding the entity's collection id. Resolved live against
  the entity's own table (`common/entity-type->model`); entity-types with no model contribute nothing.
  For every containable type that column is `:collection_id`; a `:collection` subject *is* the collection,
  so its predicate is keyed on its own `:id`. Callers combine the seq with `:or`/`:and`."
  [coll-pred-fn]
  (for [[etype model] common/entity-type->model]
    [:and
     [:= :entity_type (name etype)]
     [:in :entity_id {:select [:id]
                      :from   [(t2/table-name model)]
                      :where  (coll-pred-fn (if (= etype :collection) :id :collection_id))}]]))

(defn visible-findings-clause
  "Keep only findings whose entity is in a collection the current user can read (a collection subject must
  itself be readable) - always applied. Fail-closed: an entity-type with no collection model is dropped."
  []
  (into [:or] (entity-collection-clauses collection/visible-collection-filter-clause)))

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

(defn name-search-clause
  "Case-insensitive substring match on the denormalized `entity_name`. Nil for a blank/absent query.
  `%`/`_` are not escaped - they act as LIKE wildcards, matching the app's fuzzy name search."
  [query]
  (when-let [q (some-> query str/trim not-empty u/lower-case-en)]
    [:like [:lower :entity_name] (str "%" q "%")]))

(defn excluded-personal-collection-ids
  "The live personal-collection id set (roots + descendants) to exclude for this request - nil when
  `include-personal-collections`, or when none exist. Endpoints resolve this once and thread it to both
  `findings-where` and `hydrate-findings`, so the set is queried at most once per request."
  [include-personal-collections]
  (when-not include-personal-collections
    (not-empty (personal-collection-ids))))

(defn exclude-personal-collections-clause
  "WHERE fragment dropping findings whose entity currently lives in one of `excluded-personal-ids`
  (see `excluded-personal-collection-ids`) - or, for a collection subject, *is* one (the set already
  includes descendants). Root and regular-collection entities are kept. Nil when there is nothing to
  exclude."
  [excluded-personal-ids]
  (when excluded-personal-ids
    (into [:and]
          (map (fn [clause] [:not clause]))
          (entity-collection-clauses (fn [coll-col] [:in coll-col excluded-personal-ids])))))

(defn findings-where
  "Base WHERE for one finding-type's list: the valid + caller-visible base narrowed by the filters every
  endpoint shares - personal-collection exclusion (when `:excluded-personal-collection-ids` is provided;
  see `excluded-personal-collection-ids`), `entity-types`, and `query` name search - plus any
  finding-type-specific `extra-filters`. Each filter is precomputed so a nil (no-op) is skipped, not
  conjoined as a null AND-term."
  [finding-type {:keys [excluded-personal-collection-ids entity-types query]} & extra-filters]
  (let [personal-filter    (exclude-personal-collections-clause excluded-personal-collection-ids)
        entity-type-filter (when-let [types (not-empty (u/one-or-many entity-types))]
                             [:in :entity_type (mapv name types)])
        name-search-filter (name-search-clause query)]
    (into (cond-> [:and (valid-clause finding-type) (visible-findings-clause)]
            personal-filter    (conj personal-filter)
            entity-type-filter (conj entity-type-filter)
            name-search-filter (conj name-search-filter))
          (filter some?)
          extra-filters)))

;;; ----------------------------------- display hydration (shared layer) --------------------------------
;;; name/created_at/creator are denormalized (frozen at scan time); description, the collection
;;; breadcrumb, the transform owner, and slow roll-up culprits are live-hydrated, batched per entity-type.

(defn- collection-context
  "The `entity-context` arm for `:collection` subjects, which have no `collection_id`/`creator_id`
  columns: `collection_id` (the breadcrumb anchor) is the **parent** parsed from `location` - consistent
  \"where it lives\" semantics; the subject itself is already the finding's identity - and `owner` is the
  owning user when the collection is personal (api-design: collection carries `owner` only when personal,
  `creator` always null). Nil at root / for regular collections respectively."
  [ids]
  (let [rows   (t2/select [:model/Collection :id :description :location :personal_owner_id]
                          :id [:in (set ids)])
        owners (when-let [owner-ids (not-empty (into #{} (keep :personal_owner_id) rows))]
                 (t2/select-pk->fn identity [:model/User :id :common_name :email] :id [:in owner-ids]))]
    (m/index-by :id
                (for [{:keys [location personal_owner_id] :as row} rows]
                  (assoc row
                         :collection_id (collection/location-path->parent-id location)
                         ;; same {:id :common_name :email} shape the transform :owner hydrate returns,
                         ;; so normalized-owner serves both
                         :owner (get owners personal_owner_id))))))

(defn- entity-context
  "For one entity-type's id set → `{entity-id → row}`. Live-hydrates only the non-denormalized display
  fields: `description`, `collection_id`, `view_count` (card/dashboard/document), and the owner
  (transform + personal collection). `document` has no description; `collection` derives its breadcrumb
  anchor from `location` and carries no view_count (see [[collection-context]])."
  [entity-type ids]
  (when-let [model (common/entity-type->model entity-type)]
    (if (= entity-type :collection)
      (collection-context ids)
      (let [cols (cond-> [:id :collection_id]
                   (not= entity-type :document)  (conj :description)
                   ;; card/dashboard/document have a native view_count column; transform has none.
                   (not= entity-type :transform) (conj :view_count)
                   (= entity-type :transform)    (conj :owner_user_id :owner_email))
            rows (cond-> (t2/select (into [model] cols) :id [:in (set ids)])
                   ;; reuse the transform model's batched :owner hydrate (user row, or {:email …} external)
                   (= entity-type :transform) (t2/hydrate :owner))]
        (m/index-by :id rows)))))

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

(defn- hydrate-slow-entities
  "Card-id set → `{card-id → {:id :name :entity_type :card :card_type <kw> :view_count <int>}}`. The
  read-time hydration of a `slow` roll-up's stored culprit ids (`slow_entity_ids`) into objects.
  `card_type` is the `report_card.type` enum (question/model/metric) that drives the FE per-member
  link/icon; `view_count` is the card's live usage counter. Batched.

  Culprit cards can live outside their container's collection, so the per-caller read-time filters are
  re-applied here: caller visibility (the same gate as `visible-findings-clause`) always, and the
  personal-collection exclusion when `excluded-personal-ids` is provided. A filtered-out culprit drops
  out of `slow_entities` exactly like a deleted one."
  [card-ids excluded-personal-ids]
  (when (seq card-ids)
    ;; `:card_schema` is required on any Card select - its after-select schema-upgrade hook reads it.
    (t2/select-pk->fn (fn [c] {:id (:id c) :name (:name c) :entity_type :card :card_type (:type c)
                               :view_count (:view_count c)})
                      [:model/Card :id :name :type :view_count :card_schema]
                      {:where [:and
                               [:in :id (set card-ids)]
                               (collection/visible-collection-filter-clause :collection_id)
                               ;; root-collection culprits (nil collection_id) must survive the NOT-IN.
                               (when excluded-personal-ids
                                 [:or
                                  [:= :collection_id nil]
                                  [:not [:in :collection_id excluded-personal-ids]]])]})))

(defn- normalized-owner
  "Normalized `owner` from the transform `:owner` hydrate or a personal collection's owning user:
  `{id,name,email,type:user}` or, for an external email-only transform owner, `{email,type:external}`.
  Nil for entity types with no owner (card/dashboard/document, non-personal collections)."
  [{:keys [owner]}]
  (when owner
    (let [{:keys [id common_name email]} owner]
      (if id
        {:id id :name common_name :email email :type :user}
        {:email email :type :external}))))

(defn hydrate-findings
  "Project stored findings into the response shape: flat identity + denormalized display fields, plus a
  nested `details` = stored verdict + {collection, description, owner, creator, view_count?}. `view_count`
  is the entity's live usage counter, present only for types that have the column (all but transform).
  Batched, page-size-independent.

  Options let each endpoint add its per-finding-type extras without changing the shared base:
  `:top-level-cols` - extra native finding columns hoisted to the top level (e.g. `:last_active_at` for
  stale, `:duration_ms` for slow); `:hydrate-culprits?` - replace `details.slow_entity_ids` with hydrated
  `details.slow_entities` objects (slow roll-ups); `:excluded-personal-collection-ids` - the request's
  resolved exclusion set (see `excluded-personal-collection-ids`), threaded to the culprit hydration so
  its personal-collection exclusion matches the findings filter without re-querying."
  [findings & [{:keys [top-level-cols hydrate-culprits? excluded-personal-collection-ids]
                :or   {top-level-cols []}}]]
  (let [ctx-by-type (into {} (for [[etype rows] (group-by :entity_type findings)]
                               [etype (entity-context etype (map :entity_id rows))]))
        coll-ids    (into #{} (keep (fn [{:keys [entity_type entity_id]}]
                                      (get-in ctx-by-type [entity_type entity_id :collection_id])))
                          findings)
        breadcrumbs (collection-breadcrumbs coll-ids)
        culprits    (when hydrate-culprits?
                      (hydrate-slow-entities (into #{} (mapcat (comp :slow_entity_ids :details)) findings)
                                             excluded-personal-collection-ids))]
    (mapv (fn [{:keys [id finding_type entity_type entity_id detected_at entity_created_at
                       entity_name entity_creator_id entity_creator_name details] :as row}]
            (let [entity  (get-in ctx-by-type [entity_type entity_id])
                  base    (merge details
                                 {:collection  (get breadcrumbs (:collection_id entity))
                                  :description (:description entity)
                                  ;; only transforms + personal collections have an owner; null for the rest.
                                  :owner       (normalized-owner entity)
                                  ;; creator denormalized (id + common_name) - no live :creator hydrate.
                                  :creator     (when entity_creator_id
                                                 {:id entity_creator_id :name entity_creator_name :type :user})}
                                 (when-some [view-count (:view_count entity)]
                                   {:view_count view-count}))
                  details* (if (and hydrate-culprits? (contains? details :slow_entity_ids))
                             (-> base
                                 (dissoc :slow_entity_ids)
                                 (assoc :slow_entities (into [] (keep culprits) (:slow_entity_ids details))))
                             base)]
              (merge {:id                  id
                      :finding_type        finding_type
                      :entity_type         entity_type
                      :entity_id           entity_id
                      :detected_at         detected_at
                      :entity_display_name entity_name
                      :created_at          entity_created_at
                      :details             details*}
                     (select-keys row top-level-cols))))
          findings)))

(defn last-scan-at
  "`detected_at` of the most recent finding overall (≈ the latest scan's time), or nil if none."
  []
  (t2/select-one-fn :detected_at :model/ContentDiagnosticsFinding {:order-by [[:detected_at :desc]]}))

;;; ---------------------------------------------- sort config -----------------------------------------

(def sort-directions
  "Valid sort directions for the finding lists."
  #{:asc :desc})

(def base-sort-column->field
  "Sortable params common to every finding list → their native `content_diagnostics_finding` column.
  Entity attributes are denormalized at scan time, so sorting is a plain `ORDER BY` with no join. Each
  endpoint `assoc`s its per-finding-type magnitude column (stale `:last-active-at`, slow `:duration-ms`)."
  {:detected-at :detected_at
   :entity-type :entity_type
   :name        :entity_name
   :created-at  :entity_created_at
   :created-by  :entity_creator_name})
