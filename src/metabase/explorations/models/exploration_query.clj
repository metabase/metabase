(ns metabase.explorations.models.exploration-query
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationQuery [_model] :exploration_query)

(doto :model/ExplorationQuery
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/ExplorationQuery
  {:visualization_settings mi/transform-json
   :dataset_query          mi/transform-json})

(defmethod mi/can-read? :model/ExplorationQuery
  ([instance]
   (mi/can-read? :model/ExplorationThread (:exploration_thread_id instance)))
  ([_model pk]
   (when-let [q (t2/select-one [:model/ExplorationQuery :exploration_thread_id] :id pk)]
     (mi/can-read? :model/ExplorationThread (:exploration_thread_id q)))))

(defmethod mi/can-write? :model/ExplorationQuery
  ([instance]
   (mi/can-write? :model/ExplorationThread (:exploration_thread_id instance)))
  ([_model pk]
   (when-let [q (t2/select-one [:model/ExplorationQuery :exploration_thread_id] :id pk)]
     (mi/can-write? :model/ExplorationThread (:exploration_thread_id q)))))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationQuery :interestingness_score]
  [_model k queries]
  (mi/instances-with-hydrated-data
   queries k
   #(into {} (map (juxt :exploration_query_id :interestingness_score))
          (t2/select [:model/ExplorationQueryResult :exploration_query_id :interestingness_score]
                     :exploration_query_id [:in (map :id queries)]))
   :id))
