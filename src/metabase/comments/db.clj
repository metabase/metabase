(ns metabase.comments.db
  "Application database queries for the comments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.comments.schema :as comments.schema]
   [metabase.documents.schema :as documents.schema]
   [metabase.explorations.schema :as explorations.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.core :as users]
   [metabase.users.models.user :as user]
   [metabase.users.schema :as users.schema]
   [metabase.users.settings :as users.settings]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn comments-for-target :- [:sequential ::comments.schema/comment]
  "The Comments on the target with `target-type` and `target-id`, oldest first."
  [target-type :- :string
   target-id   :- ms/PositiveInt]
  (t2/select :model/Comment
             {:where    [:and
                         [:= :target_type target-type]
                         [:= :target_id target-id]]
              :order-by [[:created_at :asc]]}))

(mu/defn active-user-ids :- [:maybe [:set ::lib.schema.id/user]]
  "The ids among `user-ids` of active Users, or nil."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-pks-set :model/User :id [:in user-ids] :is_active true))

(mu/defn document :- [:maybe ::documents.schema/document]
  "The Document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Document :id id))

(mu/defn exploration :- [:maybe ::explorations.schema/exploration]
  "The Exploration with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Exploration :id id))

(mu/defn comment-by-id :- [:maybe ::comments.schema/comment]
  "The Comment with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Comment :id id))

(mu/defn comment-recipient-emails :- [:maybe [:set :string]]
  "The emails of the Users to notify about a comment: the authors of the Comment with `parent-comment-id` and of its
  replies, or the User with `creator-id` for a top-level comment, plus the Users with `mention-ids`."
  [creator-id        :- ::lib.schema.id/user
   parent-comment-id :- [:maybe ms/PositiveInt]
   mention-ids       :- [:maybe [:sequential ms/PositiveInt]]]
  (t2/select-fn-set :email [:model/User :email]
                    {:where [:or
                             (if parent-comment-id
                               [:in :id ^:allow-subquery {:from   [:comment]
                                                          :select [:creator_id]
                                                          :where  [:or
                                                                   [:= :id parent-comment-id]
                                                                   [:= :parent_comment_id parent-comment-id]]}]
                               [:= :id creator-id])
                             (when (seq mention-ids)
                               [:in :id mention-ids])]}))

(mu/defn insert-comment! :- (mut/optional-keys ::comments.schema/comment)
  "Insert the Comment `row` and return the inserted instance."
  [row :- ::comments.schema/comment.update]
  (t2/insert-returning-instance! :model/Comment row))

(mu/defn update-comment! :- :int
  "Apply `changes` to the Comment with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::comments.schema/comment.update [:content :is_resolved])]
  (t2/update! :model/Comment id changes))

(mu/defn soft-delete-comment! :- :int
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

(mu/defn mentionable-users :- [:sequential (mut/select-keys ::users.schema/user [:id :first_name :last_name :email :common_name])]
  "The id, first name, last name, and email of the active Users the current user may @mention, ordered by name
  then id, limited to `limit` starting at `offset`."
  [limit  :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select [:model/User :id :first_name :last_name :email]
             (-> (user/filter-clauses {:limit limit :offset offset})
                 restrict-to-visible-users
                 (sql.helpers/order-by [:%lower.first_name :asc]
                                       [:%lower.last_name :asc]
                                       [:id :asc]))))

(mu/defn mentionable-user-count :- [:map {:closed true} [:count :int]]
  "The `:count` of the active Users the current user may @mention."
  []
  (t2/query-one (merge {:select [[[:count [:distinct :core_user.id]] :count]]
                        :from   :core_user}
                       (-> (user/filter-clauses {})
                           restrict-to-visible-users
                           users/filter-clauses-without-paging))))

(mu/defn users-by-id :- [:map-of ::lib.schema.id/user ::lib.schema.id/user]
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn reaction-exists? :- :boolean
  "Whether the User with `user-id` has reacted to the Comment with `comment-id` with `emoji`."
  [comment-id :- ms/PositiveInt
   user-id    :- ::lib.schema.id/user
   emoji      :- :string]
  (t2/exists? :model/CommentReaction :comment_id comment-id :user_id user-id :emoji emoji))

(mu/defn insert-reaction! :- :int
  "Insert a CommentReaction by the User with `user-id` on the Comment with `comment-id` with `emoji`."
  [comment-id :- ms/PositiveInt
   user-id    :- ::lib.schema.id/user
   emoji      :- :string]
  (t2/insert! :model/CommentReaction {:comment_id comment-id, :user_id user-id, :emoji emoji}))

(mu/defn delete-reaction! :- :int
  "Delete the CommentReaction by the User with `user-id` on the Comment with `comment-id` with `emoji`, returning
  the number deleted."
  [comment-id :- ms/PositiveInt
   user-id    :- ::lib.schema.id/user
   emoji      :- :string]
  (t2/delete! :model/CommentReaction :comment_id comment-id :user_id user-id :emoji emoji))

(mu/defn reactions-for-comments :- [:sequential ::comments.schema/comment-reaction]
  "The CommentReactions on the Comments with `comment-ids`, ordered by comment, time, and emoji."
  [comment-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/CommentReaction
             {:where    [:in :comment_id comment-ids]
              :order-by [[:comment_id :asc] [:created_at :asc] [:emoji :asc]]}))
