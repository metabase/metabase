(ns metabase.comments.models.comment-reaction
  "Model for comment reactions (emoji reactions on comments)"
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CommentReaction [_model] :comment_reaction)

(doto :model/CommentReaction
  (derive :metabase/model))

(methodical/defmethod t2/batched-hydrate [:model/CommentReaction :user]
  [_model k reactions]
  (mi/instances-with-hydrated-data
   reactions k
   #(t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                      :id (map :user_id reactions))
   :user_id {:default {}}))

;;; Helpers

(defn reaction-exists?
  "Check if a reaction already exists for a given comment, user, and emoji"
  [comment-id user-id emoji]
  (t2/exists? :model/CommentReaction
              :comment_id comment-id
              :user_id user-id
              :emoji emoji))

(defn create-reaction!
  "Create a new reaction"
  [comment-id user-id emoji]
  (t2/insert! :model/CommentReaction
              {:comment_id comment-id
               :user_id user-id
               :emoji emoji}))

(defn delete-reaction!
  "Delete a specific reaction"
  [comment-id user-id emoji]
  (t2/delete! :model/CommentReaction
              :comment_id comment-id
              :user_id user-id
              :emoji emoji))

(defn toggle-reaction
  "Toggle a reaction - add it if it doesn't exist, remove it if it does"
  [comment-id user-id emoji]
  (if (reaction-exists? comment-id user-id emoji)
    (do
      (delete-reaction! comment-id user-id emoji)
      {:reacted false})
    (do
      (create-reaction! comment-id user-id emoji)
      {:reacted true})))

(defn- format-user [{:keys [id first_name last_name]}]
  {:id   id
   :name (if (and first_name last_name)
           (str first_name " " last_name)
           (or first_name last_name "Unknown User"))})

(defn reactions-for-comments
  "Get all reactions for a list of comment IDs, grouped and formatted for API response.

   Returns a map of `{comment-id {emoji [user1 user2...]}}."
  [current-user-id comment-ids]
  (when (seq comment-ids)
    (let [reactions   (-> (t2/select :model/CommentReaction
                                     {:where    [:in :comment_id comment-ids]
                                      :order-by [[:comment_id :asc] [:created_at :asc] [:emoji :asc]]})
                          (t2/hydrate :user))

          ;; first user comes first if they reacted
          first-or-last (fn [acc user]
                          (if (= (:id user) current-user-id)
                            (into [user] acc)
                            (conj (or acc []) user)))]

      (reduce (fn [acc reaction]
                (let [user (format-user (:user reaction))]
                  (update-in acc [(:comment_id reaction) (:emoji reaction)] first-or-last user)))
              {} reactions))))
