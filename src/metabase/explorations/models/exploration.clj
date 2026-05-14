(ns metabase.explorations.models.exploration
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.search.spec :as search.spec]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Exploration [_model] :exploration)

(doto :model/Exploration
  (derive :metabase/model)
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/define-before-insert :model/Exploration
  [exploration]
  ;; Default collection_id to the creator's Personal Collection so a brand-new
  ;; exploration is private to its creator. Callers may pass a `:collection_id`
  ;; explicitly (including `nil` for the root collection) to override.
  (cond-> exploration
    (not (contains? exploration :collection_id))
    (assoc :collection_id (some-> (or (:creator_id exploration) api/*current-user-id*)
                                  collection/user->personal-collection
                                  :id))))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :creator]
  [_model k explorations]
  (mi/instances-with-hydrated-data
   explorations k
   #(t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                      :id (keep :creator_id explorations))
   :creator_id
   {:default {}}))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :threads]
  [_model k explorations]
  (mi/instances-with-hydrated-data
   explorations k
   #(group-by :exploration_id
              (t2/select :model/ExplorationThread
                         :exploration_id [:in (map :id explorations)]
                         {:order-by [[:position :asc] [:id :asc]]}))
   :id
   {:default []}))

;;; ----------------------------------------------- Search ----------------------------------------------------------

(search.spec/define-spec "exploration"
  {:model :model/Exploration
   :attrs {:archived :archived
           :collection-id :collection_id
           :creator-id :creator_id
           :created-at :created_at
           :updated-at :updated_at
           :pinned [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]}
   :search-terms [:name :description]
   :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]}
   :render-terms {:exploration-name :name
                  :exploration-id :id
                  :collection-authority_level :collection.authority_level
                  :collection-location        :collection.location
                  :collection-name            :collection.name
                  :collection-position        true
                  :collection-type            :collection.type
                  :archived-directly          true}})
