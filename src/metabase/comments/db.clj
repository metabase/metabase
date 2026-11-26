(ns metabase.comments.db
  "Application database queries for the comments module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.comments.schema :as comments.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.core :as users]
   [metabase.users.models.user :as user]
   [metabase.users.settings :as users.settings]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
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

(mu/defn active-users
  "The `:user-id`, `:is-superuser?` and `:is-data-analyst?` of the active Users among `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (app-db/select-batched #(t2/select [:model/User
                                      [:id :user-id]
                                      [:is_superuser :is-superuser?]
                                      [:is_data_analyst :is-data-analyst?]]
                                     :id [:in %]
                                     :is_active true)
                         user-ids))

(mu/defn document
  "The Document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Document :id id))

(mu/defn exploration
  "The Exploration with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Exploration :id id))

(mu/defn target
  "The `model` row with `id` a Comment targets, or nil."
  [model :- [:enum :model/Document :model/Exploration]
   id    :- ms/PositiveInt]
  (t2/select-one model :id id))

(mu/defn targets
  "The `model` rows with `ids` Comments target."
  [model :- [:enum :model/Document :model/Exploration]
   ids   :- [:set ms/PositiveInt]]
  (app-db/select-batched #(t2/select model :id [:in %]) ids))

(mu/defn comment-by-id
  "The Comment with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Comment :id id))

(mu/defn comment-recipient-emails
  "The emails of the Users to notify about a comment: the authors of the Comment with `parent-comment-id` and of its
  replies, or the User with `creator-id` for a top-level comment, plus the Users with `mention-ids`."
  [creator-id        :- ::lib.schema.id/user
   parent-comment-id :- [:maybe ms/PositiveInt]
   mention-ids       :- [:maybe [:sequential ms/PositiveInt]]]
  (let [recipients (if parent-comment-id
                     [:in :id ^:allow-subquery {:from   [(t2/table-name :model/Comment)]
                                                :select [:creator_id]
                                                :where  [:or
                                                         [:= :id parent-comment-id]
                                                         [:= :parent_comment_id parent-comment-id]]}]
                     [:= :id creator-id])]
    (into #{}
          (mapcat #(t2/select-fn-set :email [:model/User :email]
                                     {:where [:or
                                              recipients
                                              (when (seq %)
                                                [:in :id %])]}))
          (or (seq (app-db/select-partitions mention-ids)) [nil]))))

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
        :group (sql.helpers/where clauses [:in (u/qualified-key (t2/table-name :model/User) :id) (-> (user/same-groups-user-ids api/*current-user-id*)
                                                                                                     set
                                                                                                     (conj api/*current-user-id*))])
        :none  (sql.helpers/where clauses [:= (u/qualified-key (t2/table-name :model/User) :id) api/*current-user-id*])))))

(mu/defn mentionable-users
  "The id, first name, last name, and email of the active Users the current user may @mention, ordered by name
  then id, limited to `limit` starting at `offset`."
  [limit  :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select [:model/User :id :first_name :last_name :email]
             (h2x/assert-map-or-nil!
              (-> (user/filter-clauses {:limit limit :offset offset})
                  restrict-to-visible-users
                  (sql.helpers/order-by [:%lower.first_name :asc]
                                        [:%lower.last_name :asc]
                                        [:id :asc])))))

(mu/defn mentionable-user-count
  "The `:count` of the active Users the current user may @mention."
  []
  (t2/query-one (merge {:select [[[:count [:distinct (u/qualified-key (t2/table-name :model/User) :id)]] :count]]
                        :from   (t2/table-name :model/User)}
                       (-> (user/filter-clauses {})
                           restrict-to-visible-users
                           users/filter-clauses-without-paging))))

(mu/defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (app-db/select-batched-map #(t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in %]) user-ids))

(mu/defn reaction-id
  "The id of the CommentReaction by the User with `user-id` on the Comment with `comment-id` with `emoji`, or nil."
  [comment-id :- ms/PositiveInt
   user-id    :- ::lib.schema.id/user
   emoji      :- :string]
  (t2/select-one-pk :model/CommentReaction :comment_id comment-id :user_id user-id :emoji emoji))

(mu/defn insert-reactions!
  "Insert the CommentReaction `rows` and return the inserted instances, in the order of `rows`."
  [rows :- [:sequential ::comments.schema/comment-reaction.create]]
  (app-db/insert-returning-instances! :model/CommentReaction rows))

(mu/defn delete-reactions!
  "Delete the CommentReactions with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/sum-batched app-db/delete-partition-size #(t2/delete! :model/CommentReaction :id [:in %]) ids))

(mu/defn reactions-for-comments
  "The CommentReactions on the Comments with `comment-ids`, ordered by comment, time, and emoji."
  [comment-ids :- [:sequential ms/PositiveInt]]
  (vec (sort-by :comment_id
                (app-db/select-batched #(t2/select :model/CommentReaction
                                                   {:where    [:in :comment_id %]
                                                    :order-by [[:comment_id :asc] [:created_at :asc] [:emoji :asc]]})
                                       comment-ids))))
