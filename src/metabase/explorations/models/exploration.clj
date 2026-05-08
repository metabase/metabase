(ns metabase.explorations.models.exploration
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.search.spec :as search.spec]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Exploration [_model] :exploration)

(doto :model/Exploration
  (derive :metabase/model)
  ;; When `is_published` is true, read/write are granted via the parent collection's perms (with
  ;; `collection_id = NULL` meaning the root collection). When false, the exploration is private
  ;; to its creator and `mi/can-read?` / `mi/can-write?` short-circuit to `mine?` below.
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defn- mine?
  [{:keys [creator_id]}]
  (or api/*is-superuser?*
      (= creator_id api/*current-user-id*)))

(defmethod mi/can-read? :model/Exploration
  ([{:keys [is_published] :as instance}]
   (if is_published
     (mi/current-user-has-full-permissions? (mi/perms-objects-set instance :read))
     (mine? instance)))
  ([_model pk]
   (when-let [expl (t2/select-one [:model/Exploration :creator_id :collection_id :is_published] :id pk)]
     (mi/can-read? expl))))

(defmethod mi/can-write? :model/Exploration
  ([{:keys [is_published] :as instance}]
   (if is_published
     (mi/current-user-has-full-permissions? (mi/perms-objects-set instance :write))
     (mine? instance)))
  ([_model pk]
   (when-let [expl (t2/select-one [:model/Exploration :creator_id :collection_id :is_published] :id pk)]
     (mi/can-write? expl))))

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
           :is-published :is_published
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
