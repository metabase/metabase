(ns metabase.models.comment
  (:require
   [metabase.email.messages :as messages]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Comment [_model] :metabase_comment)

(doto :model/Comment
  (derive :metabase/model))

(declare send-notifications!)

(t2/define-after-insert :model/Comment
  [comment]
  (u/prog1 comment
    (send-notifications! comment)))

(methodical/defmethod t2/batched-hydrate [:default :reactions]
  [_model k comments]
  (mi/instances-with-hydrated-data
   comments k
   #(group-by :comment_id
              (t2/select :model/Reaction :comment_id [:in (map :id comments)]))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:default :replies]
  [_model k comments]
  (mi/instances-with-hydrated-data
   comments k
   #(group-by :model_id
              (t2/select :model/Comment :model "comment" :model_id [:in (map :id comments)]))
   :id
   {:default []}))

(def commentable-models "Set of models that allow comments"
  #{"card"
    "comment"
    "dashboard"})

(defn- hydrate-comment
  [comment-or-comments]
  (t2/hydrate comment-or-comments :author [:reactions :author] [:replies :author] [:replies :reactions] [:replies [:reactions :author]] :resolved_by))

(defn for-model
  "All the comments for the given model"
  [model-type model-id]
  (hydrate-comment
   (t2/select :model/Comment :model model-type :model_id model-id {:order-by [[:created_at :asc]]})))

(defn user-notifications
  "All the comments that a given user should care about"
  [user-or-id]
  (let [user-id      (u/the-id user-or-id)
        model-pairs  (distinct (t2/select-fn-vec (juxt :model_id :model) :model/Comment :author_id user-id))
        model-clause (into [:or] (map (fn [[m-id m]] [:and
                                                      [:= :model_id m-id]
                                                      [:= :model m]]) model-pairs))
        where-clause [:and
                      [:not= :author_id user-id]
                      model-clause]]
    (hydrate-comment
     (t2/select :model/Comment {:where where-clause
                                :order-by [[:created_at :desc]]}))))

(defn- send-notifications!
  [comment]
  (let [user-ids (t2/select-fn-set :author_id :model/Comment {:where [:or
                                                                      [:and
                                                                       [:= :model_id (:model_id comment)]
                                                                       [:= :model (:model comment)]]
                                                                      [:and
                                                                       [:= :id (:model_id comment)]
                                                                       [:= :model "comment"]]]})
        users    (t2/select :model/User :id [:in user-ids])]
    (messages/send-comment-notification! users comment)))

(defn all
  "All top-level comments"
  []
  (hydrate-comment
   (t2/select :model/Comment :model [:not= "comment"] {:order-by [[:created_at :desc]]})))

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
