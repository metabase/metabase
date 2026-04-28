(ns metabase.explorations.models.exploration
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Exploration [_model] :exploration)

(doto :model/Exploration
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defn- mine?
  [{:keys [creator_id]}]
  (or api/*is-superuser?*
      (= creator_id api/*current-user-id*)))

(defmethod mi/can-read? :model/Exploration
  ([instance]      (mine? instance))
  ([_model pk]     (mine? (t2/select-one [:model/Exploration :creator_id] :id pk))))

(defmethod mi/can-write? :model/Exploration
  ([instance]      (mine? instance))
  ([_model pk]     (mine? (t2/select-one [:model/Exploration :creator_id] :id pk))))

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
