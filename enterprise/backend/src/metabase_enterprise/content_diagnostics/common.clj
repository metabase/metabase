(ns metabase-enterprise.content-diagnostics.common
  "Shared building blocks for the Content Diagnostics module: the entity-type ↔ model mapping every
  checker and the serve layer key off, plus the scan-time denormalization helper the checkers share.
  Requires nothing module-internal, so both `checkers/*` and `serve` can depend on it acyclically."
  (:require
   [clojure.set :as set]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def entity-type->model
  "Content Diagnostics entity-types → their Toucan models. Single source of truth: the API's display
  hydration and each checker's candidate→finding mapping both derive from this (inverse below).
  `:collection` is the one subject that is not *in* a collection but *is* one - it has no
  `collection_id`/`creator_id` columns, so every consumer that touches those columns special-cases it."
  {:card       :model/Card
   :collection :model/Collection
   :dashboard  :model/Dashboard
   :document   :model/Document
   :transform  :model/Transform})

(def model->entity-type
  "Inverse of [[entity-type->model]] - some candidate sources (e.g. `find-candidates`) return `:model`
  keywords like `:model/Card`."
  (set/map-invert entity-type->model))

(defn entity-collection-clauses
  "For each of `entity-types`, a clause keeping findings whose entity currently lives in a collection
  satisfying `coll-pred-fn` - a fn of the entity-type and the column holding the entity's collection id.
  Checked against the entity's own table, so it reflects where the entity is now. A `:collection` subject
  *is* the collection, so its predicate is keyed on its own `:id`. The entity-type is passed so a caller
  can vary the predicate per type - transforms outlive their folder's archiving, so their visibility
  differs. Callers combine the seq with `:or`/`:and`."
  [entity-types coll-pred-fn]
  (for [etype entity-types
        :let  [model (entity-type->model etype)]
        :when model]
    [:and
     [:= :entity_type (name etype)]
     [:in :entity_id ^:allow-subquery {:select [:id]
                                       :from   [(t2/table-name model)]
                                       :where  (coll-pred-fn etype (if (= etype :collection) :id :collection_id))}]]))

(def eligible-collection-where
  "The WHERE defining a collection *subject* - the finalized content-diagnostics eligibility set, stated
  directly (not via `mi/exclude-internal-content-hsql`) so the scope is visible here and stable against
  platform changes to \"internal content\". Content-diagnostics analyzes real user content only, so a
  collection tree that structurally cannot hold it is out. Included: the default (nil), transforms, and
  tenant namespaces, library-metrics trees, and tenant-specific root collections. Excluded: the snippet
  and analytics namespaces, the Trash, instance-analytics, library, and library-data types, archived
  collections, and sample content. Personal collections ARE included (the scan is permission-agnostic;
  serve-time filters handle exclusion). The single definition of what a collection subject is, so no two
  checkers can ever scan divergent collection sets."
  [:and
   [:= :archived false]
   [:= :is_sample false]
   ;; namespace denylist: drop snippets + analytics (the audit tree); keep default/transforms/tenant.
   ;; NULL-safe - the nil arm keeps default-namespace collections the NOT-IN would otherwise drop.
   [:or [:= :namespace nil]
    [:not-in :namespace [(name collection/snippets-ns) "analytics"]]]
   ;; type denylist: Trash lives in the default namespace, so only this arm drops it; instance-analytics is
   ;; already dropped by the analytics-namespace arm, listed here too to mirror the spec. The library root
   ;; holds nothing but the two sub-roots and library-data is a Tables-only tree; library-metrics stays in.
   [:or [:= :type nil]
    [:not-in :type [collection/trash-collection-type
                    collection/instance-analytics-collection-type
                    collection/library-collection-type
                    collection/library-data-collection-type]]]])

(defn eligible-container-clause
  "WHERE fragment keeping rows whose `collection-id-col` is an eligible *container*: the root (NULL) or a
  collection satisfying [[eligible-collection-where]]. Content inside an ineligible container (audit,
  sample) produces no item findings. Container-gating covers the kinds whose lifecycle follows their
  container's (card/dashboard/document - archiving a folder archives them); transforms run regardless of
  their folder's state, so transform findings are never container-gated."
  [collection-id-col]
  [:or
   [:= collection-id-col nil]
   [:in collection-id-col ^:allow-subquery {:select [:id]
                                            :from   [(t2/table-name :model/Collection)]
                                            :where  eligible-collection-where}]])

;;; ----------------------------- entity-type multimethod dispatch (shared) -----------------------------
;;; What the serve/scan multimethods dispatch on: a module-local `hierarchy` (keeping bare entity-type
;;; keywords out of the global one - the driver.impl pattern) and a per-type column registry, so the
;;; multimethods carry behavior, not column lists.

(def hierarchy
  "Dispatch hierarchy for the module's per-entity-type multimethods (module-local, mirroring
  `metabase.driver.impl/hierarchy`). card/dashboard/document derive `::collection-item` and share one method
  each (collection-gated read, no owner, column-resident display fields, archivable); transform and
  collection diverge and carry explicit methods (transform has an owner, a non-collection-based read gate,
  and no archived column; collection is not *in* a collection but *is* one). Add a type by deriving it
  here or giving it its own methods - an unregistered type throws at dispatch."
  (-> (make-hierarchy)
      (derive :card      ::collection-item)
      (derive :dashboard ::collection-item)
      (derive :document  ::collection-item)))

(def ^:private entity-spec
  "Per-entity-type column lists the serve/scan multimethods read, so column choices stay out of `defmethod`
  bodies. Per type: `:context` = extra display cols beyond `[:id :collection_id]`; `:peer` / `:candidate` =
  extra cols the duplicate-entity hydrate / duplicated checker select beyond `[:id :name]`. Only card carries
  the `:card_schema` its after-select hook requires; transform has only `:context` (its peer/candidate reads
  are explicit methods). `collection` is absent - it is not
  column-resident (its breadcrumb anchor is parsed from `location`), so it carries its own `entity-context`
  method rather than going through the shared column path; its peer/candidate reads are explicit methods too."
  ;; card :context has no :type - the finding's own card_type is served from the finding row;
  ;; :peer keeps :type (+ the :card_schema it forces) for live peer hydration.
  {:card      {:context   [:description :view_count]
               :peer      [:view_count :type :card_schema]
               :candidate [:card_schema]}
   :dashboard {:context   [:description :view_count]
               :peer      [:view_count]
               :candidate []}
   :document  {:context   [:view_count]
               :peer      [:view_count]
               :candidate []}
   :transform {:context   [:description :owner_user_id :owner_email]}})

(defn context-cols
  "Extra display cols `entity-context` selects for `entity-type` beyond `[:id :collection_id]` (see
  `entity-spec`)."
  [entity-type]
  (get-in entity-spec [entity-type :context]))

(defn peer-select-cols
  "Extra cols the duplicate-entity hydrate selects for `entity-type` beyond `[:id :name]` (see
  `entity-spec`)."
  [entity-type]
  (get-in entity-spec [entity-type :peer]))

(defn candidate-cols
  "Extra cols the duplicated checker selects for `entity-type` beyond `[:id :name]` (see `entity-spec`)."
  [entity-type]
  (get-in entity-spec [entity-type :candidate]))

(defn entity-root-namespace
  "The namespace of the root a root-resident subject sits under (`collection-namespace` applies only to
  collection subjects). Shared by the scan's root-label stamping and the serve layer's root breadcrumb
  so the stored sort label and the served breadcrumb agree."
  [entity-type collection-namespace]
  (case entity-type
    :collection collection-namespace
    :transform  collection/transforms-ns
    nil))

(defn remove-document-internal-card-findings
  "Drop findings whose subject is a card a document owns (`report_card.document_id` non-NULL): the copy an
  embed makes, a card authored inside the document, a card an exploration Summary materializes. The
  platform already keeps these out of collection items and out of card search; findings follow suit.

  Only the subject is dropped, never `details` - a document's `slow` finding names these same cards in
  `slow_entity_ids`, so a wider filter would empty every document roll-up.

  `duplicated` excludes them from its candidate rows too: peers come from that row set, so a copy dropped
  only here leaves the card it copies flagged against a peer no one can see."
  [findings]
  (let [card-ids       (into #{} (keep #(when (= (:entity-type %) :card) (:entity-id %))) findings)
        ;; projected to :id - a bare `:model/Card` select would fetch every column and run the card
        ;; after-select (schema upgrade, metric query descriptions) over rows we only want ids from
        document-owned (if (seq card-ids)
                         (t2/select-pks-set [:model/Card :id] {:where [:and
                                                                       [:in :id card-ids]
                                                                       [:not= :document_id nil]]})
                         #{})]
    (into [] (remove #(and (= (:entity-type %) :card) (contains? document-owned (:entity-id %)))) findings)))

(defn attach-entity-attrs
  "Stamp each finding with the denormalized display/sort/filter columns - `:entity-name`,
  `:entity-created-at`, `:entity-creator-id`, `:entity-creator-name`, `:entity-kind`,
  and (cards only) `:card-type` - batch-resolved from each entity's own model (F ≪ N: one query per
  entity-type over just the flagged ids, plus one `creator_id → common_name` lookup over the distinct
  creators). Values a checker has already set win (e.g. the stale checker's `:entity-name` from its own
  query), so this only fills what the checker left unset. Every covered model exposes `name`/`created_at`;
  `creator_id` is selected only where the model has it - collections have none (a personal collection's
  owner is NOT a creator proxy), so their creator columns stay NULL."
  [findings]
  (let [attrs-by-key     (into {}
                               (for [[entity-type findings-for-type] (group-by :entity-type findings)
                                     :let  [model (entity-type->model entity-type)]
                                     :when model
                                     :let  [cols      (cond-> [:id :name :created_at]
                                                        (not= entity-type :collection) (conj :creator_id)
                                                        ;; :type makes the select "plausible" to the Card
                                                        ;; after-select hook, which then requires :card_schema
                                                        (= entity-type :card)          (conj :type :card_schema))
                                            id->attrs (t2/select-pk->fn
                                                       #(select-keys % [:name :created_at :creator_id :type])
                                                       (into [model] cols)
                                                       :id [:in (into #{} (map :entity-id) findings-for-type)])]
                                     [id attrs] id->attrs]
                                 [[entity-type id] attrs]))
        creator-id->name (if-let [ids (not-empty (into #{} (keep :creator_id) (vals attrs-by-key)))]
                           (t2/select-pk->fn :common_name :model/User :id [:in ids])
                           {})]
    (mapv (fn [{:keys [entity-type entity-id] :as finding}]
            (let [{:keys [name created_at creator_id] card-type :type} (get attrs-by-key [entity-type entity-id])]
              (merge {:entity-name         name
                      :entity-created-at   created_at
                      :entity-creator-id   creator_id
                      :entity-creator-name (get creator-id->name creator_id)
                      ;; report_card.type at scan time (nil for non-cards) - what `entity-types` filters
                      ;; on when given a card sub-kind
                      :card-type           card-type
                      ;; flat kind: card sub-kind for cards (fallback :card if entity vanished),
                      ;; else entity-type - one column serves filter and sort
                      :entity-kind         (if (= entity-type :card) (or card-type :card) entity-type)}
                     finding)))
          findings)))
