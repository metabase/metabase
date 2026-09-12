(ns metabase.explorations.models.exploration-thread
  (:require
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.query-plan.transcript :as transcript]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThread [_model] :exploration_thread)

(doto :model/ExplorationThread
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/ExplorationThread
  {:query_plan_transcript (mi/transform-json-with-schema "exploration_thread.query_plan_transcript"
                                                         ::transcript/transcript)
   :data_access_token     perms/data-access-token-transform})

(defmethod mi/can-read? :model/ExplorationThread
  ([instance]
   (mi/can-read? :model/Exploration (:exploration_id instance)))
  ([_model pk]
   (when-let [thread (explorations.db/thread-exploration-id-row pk)]
     (mi/can-read? :model/Exploration (:exploration_id thread)))))

(defmethod mi/can-write? :model/ExplorationThread
  ([instance]
   (mi/can-write? :model/Exploration (:exploration_id instance)))
  ([_model pk]
   (when-let [thread (explorations.db/thread-exploration-id-row pk)]
     (mi/can-write? :model/Exploration (:exploration_id thread)))))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :timelines]
  [_model k threads]
  (mi/instances-with-hydrated-data
   threads k
   #(group-by :exploration_thread_id
              (t2/hydrate (explorations.db/thread-timelines-for-threads (map :id threads)) :timeline))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :queries]
  [_model k threads]
  (mi/instances-with-hydrated-data
   threads k
   #(group-by :exploration_thread_id
              (t2/hydrate (explorations.db/queries-for-threads (map :id threads)) :interestingness_score :contextual_interestingness_score :row_count :segment_name))
   :id
   {:default []}))
