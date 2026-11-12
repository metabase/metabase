(ns metabase.explorations.models.exploration-page
  "A page within a block: the bundle of queries that appear together on one page
   (currently, those that share a card, dimension, and query_type)."
  (:require
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.models.exploration :as exploration]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationPage [_model] :exploration_page)

(doto :model/ExplorationPage
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/can-read? :model/ExplorationPage
  ([instance]
   (mi/can-read? :model/ExplorationBlock (:exploration_block_id instance)))
  ([_model pk]
   (when-let [p (explorations.db/page-block-id-row pk)]
     (mi/can-read? :model/ExplorationBlock (:exploration_block_id p)))))

(defmethod mi/can-write? :model/ExplorationPage
  ([instance]
   (mi/can-write? :model/ExplorationBlock (:exploration_block_id instance)))
  ([_model pk]
   (when-let [p (explorations.db/page-block-id-row pk)]
     (mi/can-write? :model/ExplorationBlock (:exploration_block_id p)))))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationPage :can_write]
  "Add whether the current user can write each ExplorationPage, which is whether they can write its parent."
  [_model k instances]
  (exploration/hydrate-can-write-from-parents k instances :exploration_block_id :model/ExplorationBlock))
