(ns metabase.models.comment
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Comment [_model] :metabase_comment)

(doto :model/Comment
  (derive :metabase/model))

(def commentable-models "Set of models that allow comments"
  #{"card"
    "comment"
    "dashboard"})

(defn for-model
  "All the comments for the given model"
  [model-type model-id]
  (t2/hydrate
   (t2/select :model/Comment :model model-type :model_id model-id {:order-by [[:created_at :asc]]})
   :author))

(defn all
  "All comments"
  []
  (t2/hydrate
   (t2/select :model/Comment {:order-by [[:created_at :desc]]})
   :author))

(defn create!
  "make the thing"
  [params-map]
  (t2/hydrate
   (t2/insert-returning-instance! :model/Comment params-map)
   :author))
