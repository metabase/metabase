(ns metabase.comments.db
  "Application database queries for `:model/Comment` and `:model/CommentReaction`. Every function here is a direct
  Toucan 2 call with no additional logic, so no other namespace in the module runs a query itself (model
  definitions still use `toucan2.core`).

  The queries below follow [[::opts]] and [[::comment-reaction-opts]]; queries that do not fit them live in the
  comments-only section at the bottom of this namespace."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.comments.schema :as comments.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.core :as users]
   [metabase.users.models.user :as user]
   [metabase.users.settings :as users.settings]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which Comments a query applies to. Keys mirror the columns of `comment`: a scalar matches that value and a set
  matches any of its values."
  [:map {:closed true}
   [:id          {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:target_type {:optional true} [:or :string [:set :string]]]
   [:target_id   {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::comments.schema/comment.column]]
    [:order-by {:optional true} [:sequential ::comments.schema/comment.column]]]])

(mr/def ::comment-reaction-filters
  "Which CommentReactions a query applies to. Keys mirror the columns of `comment_reaction`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:comment_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:user_id    {:optional true} ::lib.schema.id/user]
   [:emoji      {:optional true} :string]])

(mr/def ::comment-reaction-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::comment-reaction-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::comments.schema/comment-reaction.column]]
    [:order-by {:optional true} [:sequential ::comments.schema/comment-reaction.column]]]])

(defn- filter-clause
  [column value]
  (if (set? value)
    [:in column value]
    [:= column value]))

(defn- where-clause
  [filters]
  (into [:and] (map (fn [[column value]] (filter-clause column value))) filters))

(defn- order-by-clause
  [columns]
  (mapv (fn [column] [column :asc]) columns))

(defn- ->model
  [columns]
  (if (seq columns)
    (into [:model/Comment] columns)
    :model/Comment))

(defn- ->honeysql
  [{:keys [order-by] :as opts}]
  (cond-> {:where (where-clause (dissoc opts :columns :order-by))}
    (seq order-by) (assoc :order-by (order-by-clause order-by))))

(defn- ->comment-reaction-model
  [columns]
  (if (seq columns)
    (into [:model/CommentReaction] columns)
    :model/CommentReaction))

(defn- ->comment-reaction-honeysql
  [{:keys [order-by] :as opts}]
  (cond-> {:where (where-clause (dissoc opts :columns :order-by))}
    (seq order-by) (assoc :order-by (order-by-clause order-by))))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-comments :- [:sequential ::comments.schema/comment]
  "The Comments matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::opts]]
  (t2/select (->model columns) (->honeysql opts)))

(mu/defn select-one-comment :- [:maybe ::comments.schema/comment]
  "The first Comment matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::opts]]
  (t2/select-one (->model columns) (->honeysql opts)))

(mu/defn select-comment-reactions :- [:sequential ::comments.schema/comment-reaction]
  "The CommentReactions matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::comment-reaction-opts]]
  (t2/select (->comment-reaction-model columns) (->comment-reaction-honeysql opts)))

(mu/defn comment-reaction-exists? :- :boolean
  "Whether a CommentReaction matching `opts` exists."
  [opts :- [:maybe ::comment-reaction-opts]]
  (t2/exists? :model/CommentReaction (->comment-reaction-honeysql opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-comment! :- ::comments.schema/comment
  "Insert the Comment `row` and return the inserted instance."
  [row :- ::comments.schema/comment.update]
  (t2/insert-returning-instance! :model/Comment row))

(mu/defn update-comments! :- :int
  "Apply `changes` to every Comment matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::comments.schema/comment.update]
  (t2/update! :model/Comment (->honeysql opts) changes))

(mu/defn insert-comment-reaction! :- ::comments.schema/comment-reaction
  "Insert the CommentReaction `row` and return the inserted instance."
  [row :- ::comments.schema/comment-reaction.update]
  (t2/insert-returning-instance! :model/CommentReaction row))

(mu/defn delete-comment-reactions! :- :int
  "Delete every CommentReaction matching `opts`, returning the number deleted."
  [opts :- [:maybe ::comment-reaction-opts]]
  (t2/delete! :model/CommentReaction (->comment-reaction-honeysql opts)))

;;; ------------------------------- Queries used only by the comments module -------------------------------

(mu/defn soft-delete-comments! :- :int
  "Mark every Comment matching `opts` deleted now, returning the number updated."
  [opts :- [:maybe ::opts]]
  (t2/update! :model/Comment (->honeysql opts) {:deleted_at [:now]}))

(mu/defn select-comment-child-target-counts-for-document
  "Rows of `:child_target_id` and `:comment_count` for the document with `document-id`, counting only
  live comments and skipping threads with no child target."
  [document-id :- ms/PositiveInt]
  (t2/select [:model/Comment :child_target_id [:%count.id :comment_count]]
             :target_type "document"
             :target_id document-id
             :child_target_id [:not= nil]
             :deleted_at nil
             {:group-by [:child_target_id]}))

(mu/defn active-user-ids
  "The ids among `user-ids` of active Users, or nil."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-pks-set :model/User :id [:in user-ids] :is_active true))

(mu/defn document
  "The Document with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Document :id id))

(mu/defn exploration
  "The Exploration with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Exploration :id id))

(mu/defn select-comment-recipient-emails
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

(mu/defn select-mentionable-users
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

(mu/defn count-mentionable-users
  "The `:count` of the active Users the current user may @mention."
  []
  (t2/query-one (merge {:select [[[:count [:distinct :core_user.id]] :count]]
                        :from   :core_user}
                       (-> (user/filter-clauses {})
                           restrict-to-visible-users
                           users/filter-clauses-without-paging))))

(mu/defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))
