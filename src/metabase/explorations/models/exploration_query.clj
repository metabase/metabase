(ns metabase.explorations.models.exploration-query
  (:require
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.models.exploration :as exploration]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
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
   :params                 mi/transform-json
   :data_access_token      perms/data-access-token-transform
   :resolved_source_ids    query-perms/resolved-source-ids-transform})

(methodical/defmethod t2/simple-hydrate [:model/ExplorationQuery :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean (some-> (explorations.db/thread-exploration-id-row (:exploration_thread_id instance)) (t2/hydrate :can_read) mi/can-read?))))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationQuery :can_write]
  "Add whether the current user can write each ExplorationQuery, which is whether they can write its parent."
  [_model k instances]
  (exploration/hydrate-can-write-from-parents k instances :exploration_thread_id :model/ExplorationThread))

(defn- hydrate-score-from-result [score-key queries]
  (mi/instances-with-hydrated-data
   queries score-key
   #(u/index-by :exploration_query_id score-key
                (explorations.db/query-result-scores score-key (map :id queries)))
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
                (explorations.db/query-result-row-counts (map :id queries)))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationQuery :segment_name]
  [_model k queries]
  (mi/instances-with-hydrated-data
   queries k
   #(let [seg-ids (into #{} (keep :segment_id) queries)]
      (when (seq seg-ids)
        (explorations.db/segment-names seg-ids)))
   :segment_id))
