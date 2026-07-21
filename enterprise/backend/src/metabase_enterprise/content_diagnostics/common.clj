(ns metabase-enterprise.content-diagnostics.common
  "Shared building blocks for the Content Diagnostics module: the entity-type ↔ model mapping every
  checker and the serve layer key off, plus the scan-time denormalization helper the checkers share.
  Requires nothing module-internal, so both `checkers/*` and `serve` can depend on it acyclically."
  (:require
   [clojure.set :as set]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def entity-type->model
  "Content Diagnostics entity-types → their Toucan models. Single source of truth: the API's display
  hydration and each checker's candidate→finding mapping both derive from this (inverse below)."
  {:card      :model/Card
   :dashboard :model/Dashboard
   :document  :model/Document
   :transform :model/Transform})

(def model->entity-type
  "Inverse of [[entity-type->model]] - some candidate sources (e.g. `find-candidates`) return `:model`
  keywords like `:model/Card`."
  (set/map-invert entity-type->model))

;;; ----------------------------- entity-type multimethod dispatch (shared) -----------------------------
;;; What the serve/scan multimethods dispatch on: a module-local `hierarchy` (keeping bare entity-type
;;; keywords out of the global one - the driver.impl pattern) and a per-type column registry, so the
;;; multimethods carry behavior, not column lists.

(def hierarchy
  "Dispatch hierarchy for the module's per-entity-type multimethods (module-local, mirroring
  `metabase.driver.impl/hierarchy`). card/dashboard/document derive `::collection-item` and share one method
  each (collection-gated read, no owner, archivable); transform diverges and carries explicit methods. Add a
  type by deriving it here or giving it its own methods - an unregistered type throws at dispatch."
  (-> (make-hierarchy)
      (derive :card      ::collection-item)
      (derive :dashboard ::collection-item)
      (derive :document  ::collection-item)))

(def ^:private entity-spec
  "Per-entity-type column lists the serve/scan multimethods read, so column choices stay out of `defmethod`
  bodies. Per type: `:context` = extra display cols beyond `[:id :collection_id]`; `:peer` / `:candidate` =
  extra cols the duplicate-entity hydrate / duplicated checker select beyond `[:id :name]`. Only card carries
  the `:card_schema` its after-select hook requires; transform has only `:context` (its peer/candidate reads
  are explicit methods)."
  {:card      {:context   [:description :view_count]
               :peer      [:view_count :type :card_schema]
               :candidate [:type :card_schema]}
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

(defn attach-entity-attrs
  "Stamp each finding with the denormalized display/sort columns - `:entity-name`, `:entity-created-at`,
  `:entity-creator-id`, `:entity-creator-name` - batch-resolved from each entity's own model (F ≪ N: one
  query per entity-type over just the flagged ids, plus one `creator_id → common_name` lookup over the
  distinct creators). Values a checker has already set win (e.g. the stale checker's `:entity-name` from
  its own query), so this only fills what the checker left unset. All four covered models expose
  `name`/`created_at`/`creator_id`."
  [findings]
  (let [attrs-by-key     (into {}
                               (for [[entity-type findings-for-type] (group-by :entity-type findings)
                                     :let  [model (entity-type->model entity-type)]
                                     :when model
                                     :let  [id->attrs (t2/select-pk->fn
                                                       #(select-keys % [:name :created_at :creator_id])
                                                       [model :id :name :created_at :creator_id]
                                                       :id [:in (into #{} (map :entity-id) findings-for-type)])]
                                     [id attrs] id->attrs]
                                 [[entity-type id] attrs]))
        creator-id->name (if-let [ids (not-empty (into #{} (keep :creator_id) (vals attrs-by-key)))]
                           (t2/select-pk->fn :common_name :model/User :id [:in ids])
                           {})]
    (mapv (fn [{:keys [entity-type entity-id] :as finding}]
            (let [{:keys [name created_at creator_id]} (get attrs-by-key [entity-type entity-id])]
              (merge {:entity-name         name
                      :entity-created-at   created_at
                      :entity-creator-id   creator_id
                      :entity-creator-name (get creator-id->name creator_id)}
                     finding)))
          findings)))
