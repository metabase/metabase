(ns metabase-enterprise.comments.models.comment-reaction
  "Model for comment reactions (emoji reactions on comments)"
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CommentReaction [_model] :comment_reaction)

(doto :model/CommentReaction
  (derive :metabase/model))

(mi/define-simple-hydration-method user
  :user
  "Hydrate the user who created this reaction"
  [{:keys [user_id]}]
  (t2/select-one [:model/User :id :email :first_name :last_name] :id user_id))

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

(defn get-reactions-for-comments
  "Get all reactions for a list of comment IDs, grouped and formatted for API response.
   Returns a map of comment-id -> vector of reaction objects"
  [comment-ids current-user-id]
  (when (seq comment-ids)
    (let [;; Get all reactions
          reactions (t2/select :model/CommentReaction
                               {:where [:in :comment_id comment-ids]
                                :order-by [[:comment_id :asc] [:created_at :asc] [:emoji :asc]]})

          ;; Get unique user IDs and fetch user info
          user-ids (distinct (map :user_id reactions))
          users-map (when (seq user-ids)
                      (into {}
                            (map (juxt :id identity))
                            (t2/select [:model/User :id :first_name :last_name]
                                       {:where [:in :id user-ids]})))

          ;; Group by comment_id and emoji with user info
          grouped (reduce (fn [acc reaction]
                            (let [comment-id (:comment_id reaction)
                                  emoji (:emoji reaction)
                                  user-info (get users-map (:user_id reaction))
                                  user {:id (:user_id reaction)
                                        :name (if (or (:first_name user-info) (:last_name user-info))
                                                (str (or (:first_name user-info) "")
                                                     (when (and (:first_name user-info) (:last_name user-info)) " ")
                                                     (or (:last_name user-info) ""))
                                                "Unknown User")}]
                              (update-in acc [comment-id emoji] (fnil conj []) user)))
                          {}
                          reactions)]

      ;; Transform to final format with current user first if they reacted
      (into {}
            (for [[comment-id emoji-map] grouped]
              [comment-id
               (vec (for [[emoji users] emoji-map]
                      (let [;; Separate current user from other users
                            current-user-reaction (first (filter #(= (:id %) current-user-id) users))
                            other-users (remove #(= (:id %) current-user-id) users)
                           ;; Combine with current user first, limit to 10 users
                            ordered-users (take 10 (if current-user-reaction
                                                     (cons current-user-reaction other-users)
                                                     other-users))]
                        {:emoji emoji
                         :count (count users)
                         :users (vec ordered-users)})))])))))
