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

(defn- hydrate-comment
  [comment-or-comments]
  (t2/hydrate comment-or-comments :author))

(defn for-model
  "All the comments for the given model"
  [model-type model-id]
  (hydrate-comment
   (t2/select :model/Comment :model model-type :model_id model-id {:order-by [[:created_at :asc]]})))

(defn all
  "All comments"
  []
  (hydrate-comment
   (t2/select :model/Comment {:order-by [[:created_at :desc]]})))

(defn create!
  "make the thing"
  [params-map]
  (hydrate-comment
   (t2/insert-returning-instance! :model/Comment params-map)))

(defn update!
  "edit the thing"
  [comment-id comment-updates]
  (hydrate-comment
   (t2/select-one :model/Comment
                  :id (first (t2/update-returning-pks! :model/Comment comment-id comment-updates)))))
