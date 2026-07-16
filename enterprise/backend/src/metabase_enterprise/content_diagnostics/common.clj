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

(defn attach-entity-attrs
  "Stamp each finding with the denormalized display/sort columns - `:entity-name`, `:entity-created-at`,
  `:entity-creator-id`, `:entity-creator-name` - batch-resolved from each entity's own model (F ≪ N: one
  query per entity-type over just the flagged ids, plus one `creator_id → common_name` lookup over the
  distinct creators). Values a checker has already set win (e.g. the stale checker's `:entity-name` from
  its own query), so this only fills what the checker left unset. Every covered model exposes
  `name`/`created_at`; `creator_id` is selected only where the model has it - collections have none
  (a personal collection's owner is NOT a creator proxy), so their creator columns stay NULL."
  [findings]
  (let [attrs-by-key     (into {}
                               (for [[entity-type findings-for-type] (group-by :entity-type findings)
                                     :let  [model (entity-type->model entity-type)]
                                     :when model
                                     :let  [cols      (cond-> [:id :name :created_at]
                                                        (not= entity-type :collection) (conj :creator_id))
                                            id->attrs (t2/select-pk->fn
                                                       #(select-keys % [:name :created_at :creator_id])
                                                       (into [model] cols)
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
