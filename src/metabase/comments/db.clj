(ns metabase.comments.db
  "Application database queries for the comments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:refer-clojure :exclude [comment])
  (:require
   [honey.sql.helpers :as sql.helpers]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.comments.schema :as comments.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.core :as users]
   [metabase.users.models.user :as user]
   [metabase.users.settings :as users.settings]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn comments-for-target
  "The Comments on the target with `target-type` and `target-id`, oldest first."
  [target-type :- :string
   target-id   :- ms/PositiveInt]
  (t2/select :model/Comment
             {:where    [:and
                         [:= :target_type target-type]
                         [:= :target_id target-id]]
              :order-by [[:created_at :asc]]}))

(defn document-comments
  "The Comments on the document with `document-id`, oldest first, ties broken on `:id`.

  Distinct from [[comments-for-target]], which leaves ties undetermined."
  [document-id]
  (t2/select :model/Comment
             :target_type "document"
             :target_id document-id
             {:order-by [[:created_at :asc] [:id :asc]]}))

(defn document-child-target-counts
  "Rows of `:child_target_id` and `:comment_count` for the document with `document-id`, counting only
  live comments and skipping threads with no child target."
  [document-id]
  (t2/select [:model/Comment :child_target_id [:%count.id :comment_count]]
             :target_type "document"
             :target_id document-id
             :child_target_id [:not= nil]
             :deleted_at nil
             {:group-by [:child_target_id]}))

(mu/defn comment :- [:maybe ::comments.schema/comment]
  "The ::comments.schema/comment with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Comment :id [:auto/param id]))

(mu/defn insert-comment!
  "Insert the Comment `row` and return the inserted instance."
  [row :- ::comments.schema/comment.update]
  (t2/insert-returning-instance! :model/Comment row))

(mu/defn update-comment!
  "Apply `changes` to the Comment with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::comments.schema/comment.update [:content :is_resolved])]
  (t2/update! :model/Comment id changes))

(mu/defn soft-delete-comment!
  "Mark the Comment with `id` deleted now, returning the number updated."
  [id :- ms/PositiveInt]
  (t2/update! :model/Comment id {:deleted_at [:now]}))

(defn- restrict-to-visible-users
  "Narrow `clauses` (from `user/filter-clauses`) to the users the current user should see: superusers see
  everyone; everyone else is limited to their own tenant and further narrowed by the `user-visibility`
  setting."
  [clauses]
  (if api/*is-superuser?*
    clauses
    (let [clauses (sql.helpers/where clauses [:= :tenant_id (:tenant_id @api/*current-user*)])]
      (case (users.settings/user-visibility)
        :all   clauses
        :group (sql.helpers/where clauses [:in :core_user.id (-> (user/same-groups-user-ids api/*current-user-id*)
                                                                 set
                                                                 (conj api/*current-user-id*))])
        :none  (sql.helpers/where clauses [:= :core_user.id api/*current-user-id*])))))

(mu/defn mentionable-user-count
  "The `:count` of the active Users the current user may @mention."
  []
  (t2/query-one (merge {:select [[[:count [:distinct :core_user.id]] :count]]
                        :from   :core_user}
                       (-> (user/filter-clauses {})
                           restrict-to-visible-users
                           users/filter-clauses-without-paging))))

(mu/defn reaction-exists?
  "Whether the User with `user-id` has reacted to the Comment with `comment-id` with `emoji`."
  [comment-id :- ms/PositiveInt
   user-id    :- ::lib.schema.id/user
   emoji      :- :string]
  (t2/exists? :model/CommentReaction :comment_id comment-id :user_id user-id :emoji emoji))

(mu/defn insert-reaction!
  "Insert a CommentReaction by the User with `user-id` on the Comment with `comment-id` with `emoji`."
  [comment-id :- ms/PositiveInt
   user-id    :- ::lib.schema.id/user
   emoji      :- :string]
  (t2/insert! :model/CommentReaction {:comment_id comment-id, :user_id user-id, :emoji emoji}))

(mu/defn delete-reaction!
  "Delete the CommentReaction by the User with `user-id` on the Comment with `comment-id` with `emoji`, returning
  the number deleted."
  [comment-id :- ms/PositiveInt
   user-id    :- ::lib.schema.id/user
   emoji      :- :string]
  (t2/delete! :model/CommentReaction :comment_id comment-id :user_id user-id :emoji emoji))

(mu/defn reactions-for-comments
  "The CommentReactions on the Comments with `comment-ids`, ordered by comment, time, and emoji."
  [comment-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/CommentReaction
             {:where    [:in :comment_id comment-ids]
              :order-by [[:comment_id :asc] [:created_at :asc] [:emoji :asc]]}))

(mu/defn live-comment-targets
  "The set of child target ids of the live exploration Comments anchored to one of `child-target-ids`."
  [{:keys [child-target-ids]} :- [:map {:closed true}
                                  [:child-target-ids [:sequential :string]]]]
  (t2/select-fn-set :child_target_id :model/Comment
                    :target_type     "exploration"
                    :child_target_id [:in child-target-ids]
                    :deleted_at      nil))
