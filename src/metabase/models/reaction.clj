(ns metabase.models.reaction
  (:require
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Reaction [_model] :metabase_comment_reaction)

(doto :model/Reaction
  (derive :metabase/model))

(defn for-comment
  "All the reactions for a given comment"
  [comment-or-id]
  (t2/hydrate
   (t2/select :model/Reaction :comment_id (u/the-id comment-or-id) {:order-by [[:created_at :asc]]})
   :author))

(defn create!
  "make the thing"
  [params-map]
  (t2/insert-returning-instance! :model/Reaction params-map))
