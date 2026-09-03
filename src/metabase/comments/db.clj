(ns metabase.comments.db
  "Application database queries for the comments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn comments-for-target
  "The Comments on the target with `target-type` and `target-id`, oldest first."
  [target-type target-id]
  (t2/select :model/Comment
             {:where    [:and
                         [:= :target_type target-type]
                         [:= :target_id target-id]]
              :order-by [[:created_at :asc]]}))

(defn hydrate-creator-and-reactions
  "Hydrate `:creator` and `:reactions` onto `comments`."
  [comments]
  (t2/hydrate comments :creator :reactions))

(defn hydrate-creator
  "Hydrate `:creator` onto `comment`."
  [comment]
  (t2/hydrate comment :creator))

(defn active-user-ids
  "The ids among `user-ids` of active Users, or nil."
  [user-ids]
  (t2/select-pks-set :model/User :id [:in user-ids] :is_active true))

(defn entity
  "The `model` row with `id`, or nil."
  [model id]
  (t2/select-one model :id id))

(defn comment-by-id
  "The Comment with `id`, or nil."
  [id]
  (t2/select-one :model/Comment :id id))

(defn user-emails
  "The emails of the Users selected by the Honey SQL `query`."
  [query]
  (t2/select-fn-set :email [:model/User :email] query))

(defn insert-comment!
  "Insert the Comment `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Comment row))

(defn update-comment!
  "Apply `changes` to the Comment with `id`."
  [id changes]
  (t2/update! :model/Comment id changes))

(defn soft-delete-comment!
  "Mark the Comment with `id` deleted now."
  [id]
  (t2/update! :model/Comment id {:deleted_at [:now]}))

(defn mention-users
  "The id, name, and email of the Users selected by the Honey SQL `query`."
  [query]
  (t2/select [:model/User :id :first_name :last_name :email] query))

(defn mention-user-count
  "The `:count` of distinct Users matching the Honey SQL `clauses`."
  [clauses]
  (t2/query-one (merge {:select [[[:count [:distinct :core_user.id]] :count]]
                        :from   :core_user}
                       clauses)))

(defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(defn reaction-exists?
  "Whether the User with `user-id` has reacted to the Comment with `comment-id` with `emoji`."
  [comment-id user-id emoji]
  (t2/exists? :model/CommentReaction :comment_id comment-id :user_id user-id :emoji emoji))

(defn insert-reaction!
  "Insert a CommentReaction by the User with `user-id` on the Comment with `comment-id` with `emoji`."
  [comment-id user-id emoji]
  (t2/insert! :model/CommentReaction {:comment_id comment-id, :user_id user-id, :emoji emoji}))

(defn delete-reaction!
  "Delete the CommentReaction by the User with `user-id` on the Comment with `comment-id` with `emoji`."
  [comment-id user-id emoji]
  (t2/delete! :model/CommentReaction :comment_id comment-id :user_id user-id :emoji emoji))

(defn reactions-for-comments
  "The CommentReactions on the Comments with `comment-ids`, ordered by comment, time, and emoji."
  [comment-ids]
  (t2/select :model/CommentReaction
             {:where    [:in :comment_id comment-ids]
              :order-by [[:comment_id :asc] [:created_at :asc] [:emoji :asc]]}))

(defn hydrate-user
  "Hydrate `:user` onto `reactions`."
  [reactions]
  (t2/hydrate reactions :user))
