(ns metabase.explorations.models.exploration-query
  (:require
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationQuery [_model] :exploration_query)

(doto :model/ExplorationQuery
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/ExplorationQuery
  {:visualization_settings mi/transform-json
   :dataset_query          mi/transform-json
   :params                 mi/transform-json})

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

(defn- hydrate-score-from-result [score-key queries]
  (mi/instances-with-hydrated-data
   queries score-key
   #(u/index-by :exploration_query_id score-key
                (t2/select [:model/ExplorationQueryResult :exploration_query_id score-key]
                           :exploration_query_id [:in (map :id queries)]))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationQuery :interestingness_score]
  [_model k queries]
  (hydrate-score-from-result k queries))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationQuery :contextual_interestingness_score]
  [_model k queries]
  (hydrate-score-from-result k queries))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationQuery :row_count]
  [_model k queries]
  (mi/instances-with-hydrated-data
   queries k
   #(u/index-by :exploration_query_id :row_count
                (t2/select [:model/ExplorationQueryResult
                            :exploration_query_result.exploration_query_id
                            [:stored_result.row_count :row_count]]
                           {:join  [:stored_result
                                    [:= :stored_result.id :exploration_query_result.stored_result_id]]
                            :where [:in :exploration_query_result.exploration_query_id
                                    (map :id queries)]}))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationQuery :segment_name]
  [_model k queries]
  (mi/instances-with-hydrated-data
   queries k
   #(let [seg-ids (into #{} (keep :segment_id) queries)]
      (when (seq seg-ids)
        (t2/select-pk->fn :name [:model/Segment :id :name] :id [:in seg-ids])))
   :segment_id))
