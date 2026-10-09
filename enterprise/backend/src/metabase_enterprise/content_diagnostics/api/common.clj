(ns metabase-enterprise.content-diagnostics.api.common
  "Shared read-path helpers the thin `api` endpoints compose: the read-time WHERE fragments
  (validity, per-caller collection visibility, personal-collection exclusion, name search), the batched
  display hydration, and the schema/sort fragments every per-finding-type endpoint composes.

  All per-caller concerns resolve **live at read time** against each finding's *current* collection (never
  the scan-time `scope_collection_id`). Display attrs (name/created_at/creator/card_type/entity_kind/
  collection_name) are denormalized at scan time; description, the collection breadcrumb, the transform
  owner, and slow roll-up culprits hydrate live."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.db :as cd.db]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn filter-types
  "The `entity-types` filter vocabulary for an endpoint whose findings span `entity-types`: one flat enum
  of the entity types plus the card sub-kinds. `card` stays valid and means any card type."
  [entity-types]
  (into entity-types queries.schema/card-types))

(defn latest-findings-clause
  "Keep only the latest finding per entity and finding type, invalidated or not. A scan inserts before it
  supersedes, so an older row can stay active behind a newer one."
  []
  ;; latest finding per entity = MAX(id) per (entity_type, entity_id, finding_type). id is the recency
  ;; key (monotonic; scan_id is a random UUID). Latest-per-entity, not newest-scan-only, so an entity a
  ;; partial scan hasn't re-written yet still shows its last finding.
  [:in :id ^:allow-subquery {:select   [[[:max :id] :id]]
                             :from     [(t2/table-name :model/ContentDiagnosticsFinding)]
                             :group-by [:entity_type :entity_id :finding_type]}])

(defn valid-clause
  "Result set for one **or many** `finding-types` (an umbrella endpoint spans several): the latest
  finding per entity, excluding entities whose latest row is invalidated (an older valid row does not
  resurface)."
  [finding-types]
  [:and
   [:= :invalidated_at nil]
   [:in :finding_type (u/one-or-many finding-types)]
   (latest-findings-clause)])

;;; ------------------------------ per-caller read-time filters (shared) --------------------------------
;;; Resolved live at read time against each entity's *current* collection (not scan-time
;;; `scope_collection_id`): visibility (always) + personal-collection exclusion (param-gated).

(def ^:private archived-inclusive-visibility
  "Visibility config that includes archived collections; permission filtering is unchanged. Used by the
  transform-serving clauses - see [[visible-findings-clause]] for why."
  {:include-archived-items :all})

(defn- and-not-archived-clause
  "Narrow a collection-visibility `clause` to non-archived rows. Only for the `::common/collection-item`
  types (card/dashboard/document): a collection subject's own archived state is already handled by the
  visibility config, and a transform has no `archived` column at all."
  [clause]
  [:and clause [:= :archived false]])

(defn visible-findings-clause
  "Keep only findings whose entity is in a collection the current user can read (a collection subject must
  itself be readable). Fail-closed: an entity-type with no collection model is dropped.

  Transform findings need more, because transform readability is not collection-based: they reach only an
  entitled data analyst, and only while the transforms feature is enabled. The rest of `mi/can-read?` -
  whether the caller may read the transform's source tables - is checked when hydrating a peer or culprit
  ([[read-entity-rows]] `:transform`) but not here, so a finding can name a transform whose sources the
  caller cannot read. Transforms also survive an archived folder, since archiving a folder neither archives
  nor stops them.

  Archived cards, dashboards and documents are excluded here rather than left to the archive events: some
  archive paths publish no per-entity event - archiving a dashboard archives its dashboard questions in one
  bulk update - so their findings would otherwise linger until the next scan."
  []
  (into [:or]
        (common/entity-collection-clauses
         (cond->> (keys common/entity-type->model)
           (not (and (api/entitled-data-analyst?) (premium-features/any-transforms-enabled?)))
           (remove #{:transform}))
         (fn [etype coll-col]
           (cond-> (collection/visible-collection-filter-clause
                    coll-col
                    (if (= etype :transform) archived-inclusive-visibility {}))
             (isa? common/hierarchy etype ::common/collection-item)
             (and-not-archived-clause))))))

(def ^:private personal-root-prefixes
  "Subquery: the `location` prefix each personal-collection root imposes on its descendants - `/<id>/`.
  Personal collections only ever live at the root, so a collection is nested under one exactly when the
  first segment of its `location` names a personal root."
  ^:allow-subquery {:select [[[:concat "/" :id "/"] :prefix]]
                    :from   [(t2/table-name :model/Collection)]
                    :where  [:not= :personal_owner_id nil]})

(def ^:private first-location-segment
  "`/<first segment>/` of a collection's `location`: `/3/` for `/3/14/`, and `/` for a root-level collection,
  which no personal prefix can match (a personal root is caught by its own `personal_owner_id` instead).

  Standard SQL, because H2, Postgres and MySQL agree on `SUBSTRING`, `POSITION` and `CONCAT` but not on
  `SPLIT_PART`, `LOCATE`, `STRPOS` or `CAST(… AS INTEGER)`. `POSITION` needs `:raw` since Honey SQL emits the
  comma form, which Postgres rejects; only that constant is spliced and Honey SQL still quotes the column.
  Comparing strings rather than ints avoids a dialect-specific cast."
  [:substring :location [:inline 1]
   [:+ ^:allow-raw-sql [:raw ["POSITION('/' IN " [:substring :location [:inline 2]] ")"]]
    [:inline 1]]])

(defn- personal-collection-clause
  "WHERE fragment: the collection `coll-col` points at is, or is nested under, a personal collection.

  A non-correlated subquery, so its only bind parameters are the two `/` literals in
  [[personal-root-prefixes]] however many personal collections exist, and the planner evaluates it once.
  Matching the first `location` segment by equality keeps it a hash semi-join; a correlated
  `location LIKE '/' || pc.id || '/%'` could not use an index, because a pattern that is not constant at
  plan time yields no range bounds."
  [coll-col]
  [:in coll-col ^:allow-subquery
   {:select [:id]
    :from   [(t2/table-name :model/Collection)]
    :where  [:or
             [:not= :personal_owner_id nil]
             [:in first-location-segment personal-root-prefixes]]}])

(defn name-search-clause
  "Case-insensitive substring match on the denormalized `entity_name`. Nil for a blank/absent query.
  `%`/`_` are not escaped - they act as LIKE wildcards, matching the app's fuzzy name search."
  [query]
  (when-let [q (some-> query str/trim not-empty u/lower-case-en)]
    [:like [:lower :entity_name] (str "%" q "%")]))

(defn entity-types-clause
  "WHERE fragment for the flat `entity-types` vocabulary (see [[filter-types]]); nil when nothing was
  requested. `card` means any card type, so it expands to itself (the deleted-entity fallback) plus
  the card sub-kinds. Kept a positive IN so `idx_cd_finding_ftype_entity_kind` can serve it."
  [entity-types]
  (when-let [types (not-empty (set (u/one-or-many entity-types)))]
    (let [kinds (into #{}
                      (mapcat #(if (= % :card) (cons :card queries.schema/card-types) [%]))
                      types)]
      [:in :entity_kind (mapv name kinds)])))

(defn exclude-personal-collections-clause
  "WHERE fragment dropping findings whose entity currently lives in a personal collection - or, for a
  collection subject, *is* one (see [[personal-collection-clause]], which covers descendants). Root and
  regular-collection entities are kept. Nil when `exclude-personal?` is false."
  [exclude-personal?]
  (when exclude-personal?
    (into [:and]
          (map (fn [clause] [:not clause]))
          (common/entity-collection-clauses
           (keys common/entity-type->model)
           (fn [_etype coll-col] (personal-collection-clause coll-col))))))

(defn findings-where
  "Base WHERE for one endpoint's finding list (one finding-type, or an umbrella's several): the valid +
  caller-visible base narrowed by the filters every endpoint shares - personal-collection exclusion
  (when `:exclude-personal?`; see [[exclude-personal-collections-clause]]),
  `entity-types` (see [[entity-types-clause]]), and `query` name search - plus any finding-type-specific
  `extra-filters`. Each filter is precomputed so a nil (no-op) is skipped, not conjoined as a null
  AND-term."
  [finding-types {:keys [exclude-personal? entity-types query]} & extra-filters]
  (let [personal-filter    (exclude-personal-collections-clause exclude-personal?)
        entity-type-filter (entity-types-clause entity-types)
        name-search-filter (name-search-clause query)]
    (into (cond-> [:and (valid-clause finding-types) (visible-findings-clause)]
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
  external stand-in). Collection sets its owner in [[collection-context]], not here."
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
    (->> (cd.db/entity-context-rows (common/entity-type->model entity-type)
                                    (common/context-cols entity-type)
                                    (set ids))
         (hydrate-owner entity-type)
         (m/index-by :id))))

(defmulti ^:private entity-context
  "For one entity-type's id set → `{entity-id → row}` of the live display fields (description, collection_id,
  view_count, transform owner). card/dashboard/document (`::collection-item`) and transform share the
  column-based [[context-rows]]; collection is not column-resident, so it derives its breadcrumb anchor from
  `location` via [[collection-context]]. An unregistered type throws - fail-closed, no `:default`."
  {:arglists '([entity-type ids])}
  (fn [entity-type _ids] entity-type)
  :hierarchy #'common/hierarchy)

(defmethod entity-context ::common/collection-item [entity-type ids] (context-rows entity-type ids))
(defmethod entity-context :transform [entity-type ids] (context-rows entity-type ids))

(defn- collection-context
  "The `entity-context` arm for `:collection` subjects, which have no `collection_id`/`creator_id`
  columns: `collection_id` (the breadcrumb anchor) is the **parent** parsed from `location` - consistent
  \"where it lives\" semantics; the subject itself is already the finding's identity - and `owner` is the
  owning user when the collection is personal (api-design: collection carries `owner` only when personal,
  `creator` always null). Nil at root / for regular collections respectively. `namespace` rides along so
  a root-resident subject's breadcrumb can name its own tree's root. Empty `ids` → nil (skips a
  degenerate `IN ()`; callers use `get-in`, so nil is fine)."
  [ids]
  (when (seq ids)
    (let [rows   (cd.db/collection-context-rows (set ids))
          owners (when-let [owner-ids (not-empty (into #{} (keep :personal_owner_id) rows))]
                   (cd.db/user-contacts-by-id owner-ids))]
      (m/index-by :id
                  (for [{:keys [location personal_owner_id] :as row} rows]
                    (assoc row
                           :collection_id (collection/location-path->parent-id location)
                           ;; same {:id :common_name :email} shape the transform :owner hydrate returns,
                           ;; so normalized-owner serves both
                           :owner (get owners personal_owner_id)))))))

(defmethod entity-context :collection [_ ids] (collection-context ids))

(defn- collection-breadcrumbs
  "For a set of collection ids → `{collection-id → {:id :name :namespace :effective_ancestors [{:id :name} …]}}`.
  Hydrates the permission-filtered `:effective_ancestors` breadcrumb. Selects the full row (the hydrate
  needs `:location`). No entry for root/nil collections. `:namespace` (the tree's namespace: nil for the
  default tree, `transforms` / `shared-tenant-collection` for the namespaced trees findings can live in)
  rides once at the top level - a subtree is namespace-uniform, so it covers the ancestors too - letting
  the FE build the namespace-specific collection URL.

  A breadcrumb can be a collection the primary gate never checked (a `:collection` subject's breadcrumb
  is its **parent**), so caller visibility is re-applied here - an unreadable breadcrumb collection gets
  no entry and the finding's `collection` degrades to null, same as root. Archived collections get an
  entry, so a transform finding can name the archived folder it lives in. Other types' findings are
  dropped by the primary gate while their folder is archived, and any archived parent that still shows
  up here names a folder the caller may read."
  [coll-ids]
  (when (seq coll-ids)
    (let [colls (t2/hydrate (cd.db/collections [:and
                                                [:in :id (set coll-ids)]
                                                (collection/visible-collection-filter-clause
                                                 :id archived-inclusive-visibility)])
                            :effective_ancestors)]
      (into {}
            (map (fn [c]
                   [(:id c)
                    {:id                  (:id c)
                     :name                (:name c)
                     :namespace           (:namespace c)
                     :effective_ancestors (mapv #(select-keys % [:id :name]) (:effective_ancestors c))}]))
            colls))))

(defn- root-breadcrumb
  "The root-collection sentinel used as a root-resident entity's `collection` breadcrumb, normalized to the
  `{:id :name :namespace :effective_ancestors}` shape the nested-collection breadcrumbs use. `:id` is the
  literal \"root\" (the app-wide root id - the FE detects root by id, never by the localized name); `:name`
  is `collection-namespace`'s root label (e.g. \"Transforms\" for the transforms namespace); `:namespace`
  echoes `collection-namespace`, disambiguating which tree's root this is (nil for the default tree - the
  sentinel shares `:id` \"root\" across namespaces). Root has no ancestors. Mirrors how the rest of the app
  links root as a breadcrumb (`collection/hydrate-root-collection` / the root head of
  `:effective_ancestors`)."
  [collection-namespace]
  (let [root (collection/root-collection-with-ui-details collection-namespace)]
    {:id (:id root) :name (:name root) :namespace (:namespace root) :effective_ancestors []}))

(defn- entity-breadcrumb
  "One finding's `collection` breadcrumb from its hydrated `entity` context row: the parent-collection
  object when the entity lives in a readable collection; the namespaced root sentinel when it is
  root-resident (nil parent - every covered subject is placeable, so a nil parent means \"at the root of its
  tree\", never \"no collection concept\"); nil when the parent is unreadable (degrades leak-safe, visually
  like root) or the entity was deleted post-scan (absent from `entity`)."
  [entity-type entity breadcrumbs]
  (when entity
    (if-let [parent-id (:collection_id entity)]
      (get breadcrumbs parent-id)
      (root-breadcrumb (common/entity-root-namespace entity-type (:namespace entity))))))

(defn- readable-entities-where
  "HoneySQL WHERE keeping only the rows in `ids` the caller may read at hydration time: caller visibility
  (the same gate as `visible-findings-clause`) always, the archived exclusion for the types that have the
  column, plus the personal-collection exclusion when `exclude-personal?`. Shared by the culprit/peer
  hydrators so the read-time gate lives in one place - a perms change lands once, not per hydrator.

  `opts` carries the two type-dependent parts: `:visibility-config` for the collection clause and
  `:exclude-archived?` for the archived filter. Only the transform hydrator turns them off - a transform
  outlives its folder's archiving and has no `archived` column - so for everything else a trashed peer or
  culprit drops out of `duplicate_entities`/`slow_entities` at once instead of waiting for the next scan."
  ([ids exclude-personal?]
   (readable-entities-where ids exclude-personal? nil))
  ([ids exclude-personal? {:keys [visibility-config exclude-archived?]
                           :or   {visibility-config {} exclude-archived? true}}]
   [:and
    [:in :id ids]
    (collection/visible-collection-filter-clause :collection_id visibility-config)
    (when exclude-archived? [:= :archived false])
    ;; root-collection entities (nil collection_id) must survive the personal-collection exclusion.
    (when exclude-personal?
      [:or
       [:= :collection_id nil]
       [:not (personal-collection-clause :collection_id)]])]))

(defn- hydrate-slow-entities
  "Card-id set → `{card-id → {:id :name :entity_type :card :card_type <kw> :view_count <int>}}`. The
  read-time hydration of a `slow` roll-up's stored culprit ids (`slow_entity_ids`) into objects.
  `card_type` is the `report_card.type` enum (question/model/metric) that drives the FE per-member
  link; `view_count` is the card's live usage counter. Batched.

  Culprit cards can live outside their container's collection, so the per-caller read-time filters are
  re-applied here via [[readable-entities-where]]: caller visibility always, and the personal-collection
  exclusion when `exclude-personal?`. A filtered-out culprit drops out of `slow_entities`
  exactly like a deleted one."
  [card-ids exclude-personal?]
  (when (seq card-ids)
    (cd.db/card-summaries-by-id (readable-entities-where (set card-ids) exclude-personal?))))

(defmulti ^:private read-entity-rows
  "Permission-filtered rows for hydrating a type's duplicate ids, read-gated by [[readable-entities-where]].
  For card/dashboard/document (`::collection-item`) that collection clause IS the read permission (they derive
  `:perms/use-parent-collection-perms`), with projection cols from `common/peer-select-cols`; transform
  readability isn't collection-based, so it selects full rows and additionally filters by `mi/can-read?`."
  {:arglists '([entity-type ids exclude-personal?])}
  (fn [entity-type _ids _excluded] entity-type)
  :hierarchy #'common/hierarchy)

(defmethod read-entity-rows ::common/collection-item
  [entity-type ids exclude-personal?]
  (cd.db/name-rows (common/entity-type->model entity-type)
                   (common/peer-select-cols entity-type)
                   (readable-entities-where ids exclude-personal?)))

(defmethod read-entity-rows :collection
  [_ ids exclude-personal?]
  ;; a `:collection` subject *is* the read-permission unit, so it gates on its own `:id` rather than a
  ;; parent `:collection_id`, and has no root row to preserve. The visibility clause already drops
  ;; archived collections, so no separate archived filter here.
  (cd.db/name-rows :model/Collection [:namespace]
                   [:and
                    [:in :id ids]
                    (collection/visible-collection-filter-clause :id)
                    (when exclude-personal? [:not (personal-collection-clause :id)])]))

(defmethod read-entity-rows :transform
  [_ ids exclude-personal?]
  ;; mi/can-read? on a transform = source-type feature gate + (superuser, or data-analyst with readable
  ;; source tables) - the collection clause alone would leak transform names to collection-granted
  ;; non-analysts. It reads :source, so select full rows; peer sets are page-bounded, so the per-row check
  ;; is cheap.
  (filter mi/can-read? (cd.db/transforms
                        (readable-entities-where ids exclude-personal?
                                                 {:visibility-config archived-inclusive-visibility
                                                  :exclude-archived? false}))))

(defn- hydrate-duplicate-entities
  "The findings' stored `duplicate_entity_ids` → `{[entity-type id] → {:id :name :entity_type <etype>
  :card_type <kw> :display <kw> :view_count <int> :namespace <kw>}}`. `card_type` and `display` are present
  only on card peers; `view_count` is present on card/dashboard/document peers; `namespace` is present
  only on collection peers. `display` is the card's live visualization type (e.g. table/bar/line), used
  to choose the question icon in the duplicates sidebar. Peers share the finding's own entity type,
  so each type's ids resolve from that type's own model via [[read-entity-rows]]
  (which applies the per-type read gate); a filtered-out peer drops out of `duplicate_entities` like a
  deleted one."
  [findings exclude-personal?]
  (into {}
        (for [[etype rows] (group-by :entity_type findings)
              :let  [model (common/entity-type->model etype)
                     ids   (into #{} (mapcat (comp :duplicate_entity_ids :details)) rows)]
              :when (and model (seq ids))
              row   (read-entity-rows etype ids exclude-personal?)]
          [[etype (:id row)]
           (cond-> {:id (:id row) :name (:name row) :entity_type etype}
             ;; served only where the peer select fetched it (transform + collection have none)
             (some #{:view_count} (common/peer-select-cols etype)) (assoc :view_count (:view_count row))
             (= etype :card)                                    (assoc :card_type (:type row)
                                                                       :display (:display row))
             (= etype :collection)                              (assoc :namespace (:namespace row)))])))

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
  Dispatches per row on `finding_type`, so a page may mix finding types (an umbrella endpoint; the imbalanced
  umbrella spans three); an unregistered type throws - fail-closed, no `:default`."
  {:arglists '([finding-type base row ctx])}
  (fn [finding-type _base _row _ctx] finding-type))

(defmethod finalize-finding :stale [_ base row _ctx]
  (merge base (select-keys row [:last_active_at])))

(defmethod finalize-finding :slow [_ base row {:keys [culprits]}]
  (-> (merge base (select-keys row [:duration_ms]))
      (update :details with-slow-culprits culprits)))

(defmethod finalize-finding :duplicate_name [_ base row {:keys [entities]}]
  (-> (merge base (select-keys row [:duplicate_count]))
      (update :details with-duplicate-peers (:entity_type row) entities)))

;; the imbalanced umbrella - all three types hoist the same measured magnitude, no details rewrite
(defmethod finalize-finding :empty   [_ base row _ctx] (merge base (select-keys row [:content_count])))
(defmethod finalize-finding :sparse  [_ base row _ctx] (merge base (select-keys row [:content_count])))
(defmethod finalize-finding :crowded [_ base row _ctx] (merge base (select-keys row [:content_count])))

(defn- can-write-by-entity
  "`{[entity-type entity-id] → can_write bool}` for the page's findings, each entity hydrated with its own
  model's `:can_write` - collection curate for card/dashboard/document/collection, DB-transforms permission
  for transform. Collection items select only `collection_id`; collection and transform read many columns,
  so they stay whole-row."
  [findings]
  (into {}
        (for [[etype rows] (group-by :entity_type findings)
              :let  [model      (common/entity-type->model etype)
                     ids        (into #{} (map :entity_id) rows)
                     selectable (cond
                                  ;; Include document_id so Card's write-permission check does not fetch the full
                                  ;; Card (and parse unrelated legacy result_metadata) to resolve its parent Document.
                                  (= etype :card)
                                  [model :id :collection_id :document_id :card_schema]

                                  (isa? common/hierarchy etype ::common/collection-item)
                                  [model :id :collection_id]

                                  :else
                                  model)]
              :when (and model (seq ids))
              row   (t2/hydrate (cd.db/entity-rows selectable ids) :can_write)]
          [[etype (:id row)] (boolean (:can_write row))])))

(defn hydrate-findings
  "Project stored findings into the response shape: flat identity + denormalized display fields, plus a
  nested `details` = stored verdict + {collection, description, owner, creator, view_count?}. `view_count`
  is the entity's live usage counter, present only for types that have the column (all but transform).
  A card finding also carries a top-level `card_type` (question/model/metric) - served from the stored
  column, not hydrated live. Its `display` is the live visualization type (e.g. table/bar/line), used to
  choose the question icon in the table and sidebar header without waiting for a new scan.
  Batched, page-size-independent.

  The finding-type-specific tail - the hoisted native column(s) and any `details` rewrite (slow culprits /
  duplicated peers) - is dispatched per row on each finding's `finding_type` via [[finalize-finding]], so a
  page may mix finding types (an umbrella endpoint; the imbalanced umbrella spans three).
  `exclude-personal?` (the request's `include-personal-collections` param, negated) gates the culprit/peer
  hydration so it matches the findings filter."
  [findings exclude-personal?]
  (let [ctx-by-type (into {} (for [[etype rows] (group-by :entity_type findings)]
                               [etype (entity-context etype (map :entity_id rows))]))
        coll-ids    (into #{} (keep (fn [{:keys [entity_type entity_id]}]
                                      (get-in ctx-by-type [entity_type entity_id :collection_id])))
                          findings)
        ;; scan-time parents ride along so the collection_name gate below can check their readability -
        ;; an entity may have moved since the scan, so they can differ from the live coll-ids
        breadcrumbs (collection-breadcrumbs (into coll-ids (keep :scope_collection_id) findings))
        can-write   (can-write-by-entity findings)
        ;; Batch-prep runs over whatever the page carries - an absent finding type contributes no ids, so
        ;; its hydrator issues no query.
        culprits    (hydrate-slow-entities (into #{} (mapcat (comp :slow_entity_ids :details)) findings)
                                           exclude-personal?)
        entities    (hydrate-duplicate-entities findings exclude-personal?)
        ctx         {:culprits culprits :entities entities}]
    (mapv (fn [{:keys [id finding_type entity_type entity_id detected_at entity_created_at
                       entity_name entity_creator_id entity_creator_name card_type entity_kind
                       entity_collection_name scope_collection_id details] :as row}]
            (let [entity     (get-in ctx-by-type [entity_type entity_id])
                  breadcrumb (entity-breadcrumb entity_type entity breadcrumbs)
                  details*   (merge details
                                    {:collection  breadcrumb
                                     :description (:description entity)
                                     ;; only transforms have owner columns; null for the rest.
                                     :owner       (normalized-owner entity)
                                     ;; creator denormalized (id + common_name) - no live :creator hydrate.
                                     :creator     (when entity_creator_id
                                                    {:id entity_creator_id :name entity_creator_name :type :user})}
                                    (when-some [view-count (:view_count entity)]
                                      {:view_count view-count}))
                  base       (cond-> {:id                  id
                                      :finding_type        finding_type
                                      :entity_type         entity_type
                                      :entity_id           entity_id
                                      :detected_at         detected_at
                                      :entity_display_name entity_name
                                      :created_at          entity_created_at
                                      :details             details*
                                      :can_write           (get can-write [entity_type entity_id] false)
                                      ;; additive flat kind; coalesce pre-migration rows
                                      :entity_kind         (or entity_kind card_type entity_type)
                                      ;; scan-time display name for the collection sort column (root rows
                                      ;; carry the stored root label), gated on the scan-time parent's
                                      ;; readability - the live gates only cover the entity's current
                                      ;; parent. Rows with no scan-time parent fall back to the breadcrumb.
                                      :collection_name     (when (if scope_collection_id
                                                                   (get breadcrumbs scope_collection_id)
                                                                   breadcrumb)
                                                             entity_collection_name)}
                               ;; keyed on entity type so a card row with NULL card_type still serves
                               ;; the key, as null
                               (= entity_type :card) (assoc :card_type card_type :display (:display entity)))]
              (finalize-finding finding_type base row ctx)))
          findings)))

(defn last-scan-at
  "`detected_at` of the most recent finding overall (≈ the latest scan's time), or nil if none."
  []
  (cd.db/last-detected-at))

;;; ---------------------------------------------- sort config -----------------------------------------

(def sort-directions
  "Valid sort directions for the finding lists."
  #{:asc :desc})

(def base-sort-column->field
  "Sortable params common to every finding list → their native `content_diagnostics_finding` column.
  Entity attributes are denormalized at scan time, so sorting is a plain `ORDER BY` with no join. Each
  endpoint `assoc`s its per-finding-type magnitude column (stale `:last-active-at`, slow `:duration-ms`).
  `entity-type` sorts by the flat `entity_kind` (card sub-kinds order as peers, not clustered under
  `card`); every name-ish sort is case-insensitive (and collation-stable) via lower() - `created-by`
  included, now that `entity_creator_name` carries no index for a raw sort to have used.
  collection-name orders by the scan-time stored parent name even when the caller cannot read it - the
  name itself is gated at serve time, and the ordering position is the accepted, marginal exposure."
  {:detected-at      :detected_at
   :entity-type      :entity_kind
   :name             [:lower :entity_name]
   :created-at       :entity_created_at
   :created-by       [:lower :entity_creator_name]
   :collection-name  [:lower :entity_collection_name]})
