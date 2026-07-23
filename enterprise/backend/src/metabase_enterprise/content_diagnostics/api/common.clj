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
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def covered-entity-types
  "Entity types the Content Diagnostics finding types cover - every covered type can emit today (see
  `common/entity-type->model`). Shared by every per-finding-type endpoint's `entity-types` param."
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
  "Per entity-type, a clause keeping findings whose entity's current `collection_id` satisfies `coll-pred`.
  Resolved live against the entity's own table (`common/entity-type->model`); entity-types with no model
  contribute nothing. Callers combine the seq with `:or`/`:and`."
  [coll-pred]
  (for [[etype model] common/entity-type->model]
    [:and
     [:= :entity_type (name etype)]
     [:in :entity_id {:select [:id]
                      :from   [(t2/table-name model)]
                      :where  coll-pred}]]))

(defn visible-findings-clause
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
  (see `excluded-personal-collection-ids`; root and regular-collection entities are kept). Nil when
  there is nothing to exclude."
  [excluded-personal-ids]
  (when excluded-personal-ids
    (into [:and]
          (map (fn [clause] [:not clause]))
          (entity-collection-clauses [:in :collection_id excluded-personal-ids]))))

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

(defmulti ^:private hydrate-owner
  "Batch-hydrate the per-type `owner` onto already-selected rows. card/dashboard/document have no owner, so
  `::collection-item` returns rows unchanged; transform hydrates its `:owner` (a user row, or an `{:email …}`
  external stand-in)."
  {:arglists '([entity-type rows])}
  (fn [entity-type _rows] entity-type)
  :hierarchy #'common/hierarchy)

(defmethod hydrate-owner ::common/collection-item [_ rows] rows)
(defmethod hydrate-owner :transform [_ rows] (t2/hydrate rows :owner))

(defn- context-rows
  "Build `{entity-id → row}` for a column-resident type: select `common/context-cols` plus `id`/`collection_id`,
  hydrate the owner (`hydrate-owner`), index by id. Empty `ids` → nil (skips a degenerate `IN ()`; callers use
  `get-in`, so nil is fine)."
  [entity-type ids]
  (when (seq ids)
    (->> (t2/select (into [(common/entity-type->model entity-type) :id :collection_id]
                          (common/context-cols entity-type))
                    :id [:in (set ids)])
         (hydrate-owner entity-type)
         (m/index-by :id))))

(defmulti ^:private entity-context
  "For one entity-type's id set → `{entity-id → row}` of the live display fields (description, collection_id,
  view_count, transform owner). card/dashboard/document (`::collection-item`) and transform share the
  column-based [[context-rows]]; a non-column-resident type (e.g. collection) would get its own method."
  {:arglists '([entity-type ids])}
  (fn [entity-type _ids] entity-type)
  :hierarchy #'common/hierarchy)

(defmethod entity-context ::common/collection-item [entity-type ids] (context-rows entity-type ids))
(defmethod entity-context :transform [entity-type ids] (context-rows entity-type ids))

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

(defn- readable-entities-where
  "HoneySQL WHERE keeping only the rows in `ids` the caller may read at hydration time: caller visibility
  (the same gate as `visible-findings-clause`) always, plus the personal-collection exclusion when
  `excluded-personal-ids` is provided. Shared by the culprit/peer hydrators so the read-time gate lives in
  one place - a perms change lands once, not per hydrator."
  [ids excluded-personal-ids]
  [:and
   [:in :id ids]
   (collection/visible-collection-filter-clause :collection_id)
   ;; root-collection entities (nil collection_id) must survive the NOT-IN.
   (when excluded-personal-ids
     [:or
      [:= :collection_id nil]
      [:not [:in :collection_id excluded-personal-ids]]])])

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
                      {:where (readable-entities-where (set card-ids) excluded-personal-ids)})))

(defmulti ^:private read-entity-rows
  "Permission-filtered rows for hydrating a type's duplicate ids, read-gated by [[readable-entities-where]].
  For card/dashboard/document (`::collection-item`) that collection clause IS the read permission (they derive
  `:perms/use-parent-collection-perms`), with projection cols from `common/peer-select-cols`; transform
  readability isn't collection-based, so it selects full rows and additionally filters by `mi/can-read?`."
  {:arglists '([entity-type ids excluded-personal-ids])}
  (fn [entity-type _ids _excluded] entity-type)
  :hierarchy #'common/hierarchy)

(defmethod read-entity-rows ::common/collection-item
  [entity-type ids excluded-personal-ids]
  ;; :card_schema (a peer-select-col for cards) is required on any Card select - its after-select hook reads it.
  (t2/select (into [(common/entity-type->model entity-type) :id :name] (common/peer-select-cols entity-type))
             {:where (readable-entities-where ids excluded-personal-ids)}))

(defmethod read-entity-rows :transform
  [_ ids excluded-personal-ids]
  ;; mi/can-read? on a transform = source-type feature gate + (superuser, or data-analyst with readable
  ;; source tables) - the collection clause alone would leak transform names to collection-granted
  ;; non-analysts. It reads :source, so select full rows; peer sets are page-bounded, so the per-row check
  ;; is cheap.
  (filter mi/can-read? (t2/select :model/Transform {:where (readable-entities-where ids excluded-personal-ids)})))

(defn- hydrate-duplicate-entities
  "The findings' stored `duplicate_entity_ids` → `{[entity-type id] → {:id :name :entity_type <etype>
  :card_type <kw> :view_count <int>}}`. `card_type` and `view_count` are present only on card/dashboard/
  document peers (transforms have no view concept, so their peers carry no usage signal). Peers share the
  finding's own entity type, so each type's ids resolve from that type's own model via [[read-entity-rows]]
  (which applies the per-type read gate); a filtered-out peer drops out of `duplicate_entities` like a
  deleted one."
  [findings excluded-personal-ids]
  (into {}
        (for [[etype rows] (group-by :entity_type findings)
              :let  [model (common/entity-type->model etype)
                     ids   (into #{} (mapcat (comp :duplicate_entity_ids :details)) rows)]
              :when (and model (seq ids))
              row   (read-entity-rows etype ids excluded-personal-ids)]
          [[etype (:id row)]
           (cond-> {:id (:id row) :name (:name row) :entity_type etype}
             (not= etype :transform) (assoc :view_count (:view_count row))
             (= etype :card)         (assoc :card_type (:type row)))])))

(defn- normalized-owner
  "Normalized `owner` from the transform `:owner` hydrate: `{id,name,email,type:user}` or, for an external
  email-only owner, `{email,type:external}`. Nil for entity types with no owner (card/dashboard/document)."
  [{:keys [owner]}]
  (when owner
    (let [{:keys [id common_name email]} owner]
      (if id
        {:id id :name common_name :email email :type :user}
        {:email email :type :external}))))

(defn- rewrite-ids->entities
  "Replace `details.<ids-key>` with hydrated `details.<entities-key>`, each id looked up via `id->entity`
  (misses dropped). A no-op when `ids-key` is absent."
  [details ids-key entities-key id->entity]
  (if (contains? details ids-key)
    (-> details
        (dissoc ids-key)
        (assoc entities-key (into [] (keep id->entity) (ids-key details))))
    details))

(defn- with-slow-culprits
  "Replace `details.slow_entity_ids` with hydrated `details.slow_entities` from `culprits`. A no-op for a
  slow leaf (card/transform), which rolls up no culprits and so carries no `slow_entity_ids`."
  [details culprits]
  (rewrite-ids->entities details :slow_entity_ids :slow_entities culprits))

(defn- with-duplicate-peers
  "Replace `details.duplicate_entity_ids` with hydrated same-type `details.duplicate_entities` from
  `entities` (keyed `[entity-type id]`). The raw stored ids are not permission-filtered, so the hydrated
  list is the served form; a filtered-out peer drops out like a deleted one. A no-op when the finding
  carries no `duplicate_entity_ids`."
  [details entity-type entities]
  (rewrite-ids->entities details :duplicate_entity_ids :duplicate_entities #(get entities [entity-type %])))

(defmulti ^:private finalize-finding
  "Apply the finding-type-specific tail to one assembled finding `base`: hoist the type's native top-level
  column(s) from `row`, and rewrite `details` from the batch-hydrated `ctx` (`{:culprits _ :entities _}`).
  Dispatches per row on `finding_type`, so a page may mix finding types (an umbrella endpoint); an
  unregistered type throws - fail-closed, no `:default`."
  {:arglists '([finding-type base row ctx])}
  (fn [finding-type _base _row _ctx] finding-type))

(defmethod finalize-finding :stale [_ base row _ctx]
  (merge base (select-keys row [:last_active_at])))

(defmethod finalize-finding :slow [_ base row {:keys [culprits]}]
  (-> (merge base (select-keys row [:duration_ms]))
      (update :details with-slow-culprits culprits)))

(defmethod finalize-finding :duplicated [_ base row {:keys [entities]}]
  (-> (merge base (select-keys row [:duplicate_count]))
      (update :details with-duplicate-peers (:entity_type row) entities)))

(defn hydrate-findings
  "Project stored findings into the response shape: flat identity + denormalized display fields, plus a
  nested `details` = stored verdict + {collection, description, owner, creator, view_count?}. `view_count`
  is the entity's live usage counter, present only for types that have the column (all but transform).
  Batched, page-size-independent.

  The finding-type-specific tail - the hoisted native column(s) and any `details` rewrite (slow culprits /
  duplicated peers) - is dispatched per row on each finding's `finding_type` via [[finalize-finding]], so a
  page may mix finding types. `excluded-personal-ids` (the request's resolved exclusion set) gates the
  culprit/peer hydration so it matches the findings filter without re-querying."
  [findings excluded-personal-ids]
  (let [ctx-by-type (into {} (for [[etype rows] (group-by :entity_type findings)]
                               [etype (entity-context etype (map :entity_id rows))]))
        coll-ids    (into #{} (keep (fn [{:keys [entity_type entity_id]}]
                                      (get-in ctx-by-type [entity_type entity_id :collection_id])))
                          findings)
        breadcrumbs (collection-breadcrumbs coll-ids)
        ;; Batch-prep runs over whatever the page carries - an absent finding type contributes no ids, so
        ;; its hydrator issues no query.
        culprits    (hydrate-slow-entities (into #{} (mapcat (comp :slow_entity_ids :details)) findings)
                                           excluded-personal-ids)
        entities    (hydrate-duplicate-entities findings excluded-personal-ids)
        ctx         {:culprits culprits :entities entities}]
    (mapv (fn [{:keys [id finding_type entity_type entity_id detected_at entity_created_at
                       entity_name entity_creator_id entity_creator_name details] :as row}]
            (let [entity   (get-in ctx-by-type [entity_type entity_id])
                  details* (merge details
                                  {:collection  (get breadcrumbs (:collection_id entity))
                                   :description (:description entity)
                                   ;; only transforms have owner columns; null for the rest.
                                   :owner       (normalized-owner entity)
                                   ;; creator denormalized (id + common_name) - no live :creator hydrate.
                                   :creator     (when entity_creator_id
                                                  {:id entity_creator_id :name entity_creator_name :type :user})}
                                  (when-some [view-count (:view_count entity)]
                                    {:view_count view-count}))
                  base     {:id                  id
                            :finding_type        finding_type
                            :entity_type         entity_type
                            :entity_id           entity_id
                            :detected_at         detected_at
                            :entity_display_name entity_name
                            :created_at          entity_created_at
                            :details             details*}]
              (finalize-finding finding_type base row ctx)))
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
