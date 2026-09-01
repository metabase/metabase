(ns metabase.explorations.models.exploration-page
  "A page within a block: the bundle of queries that appear together on one page
   (currently, those that share a card, dimension, and query_type)."
  (:require
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
   (when-let [p (t2/select-one [:model/ExplorationPage :exploration_block_id] :id pk)]
     (mi/can-read? :model/ExplorationBlock (:exploration_block_id p)))))

(defmethod mi/can-write? :model/ExplorationPage
  ([instance]
   (mi/can-write? :model/ExplorationBlock (:exploration_block_id instance)))
  ([_model pk]
   (when-let [p (t2/select-one [:model/ExplorationPage :exploration_block_id] :id pk)]
     (mi/can-write? :model/ExplorationBlock (:exploration_block_id p)))))
