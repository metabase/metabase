(ns metabase-enterprise.mfa.db
  "Application database queries for the mfa module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for transactions."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private totp-provider "totp")

(def ^:private confirmed-totp-exists
  ;; enrollment state is the auth_identity.confirmed_at COLUMN (queryable), not the encrypted credentials JSON
  [:exists ^:allow-subquery {:select [1]
                             :from   [:auth_identity]
                             :where  [:and
                                      [:= :auth_identity.user_id :core_user.id]
                                      [:= :auth_identity.provider totp-provider]
                                      [:not= :auth_identity.confirmed_at nil]]}])

(def ^:private unenrolled-user-where
  ;; active personal users without a confirmed TOTP enrollment
  [:and
   [:= :core_user.is_active true]
   [:= :core_user.type "personal"]
   [:not confirmed-totp-exists]])

(def ^:private list-columns
  [:id :email :first_name :last_name :sso_source :is_active :is_superuser])

(def ^:private enrolled-at-select
  ;; a correlated scalar subselect rather than a join: the unique (user_id, provider) constraint guarantees at most
  ;; one row, and joining would force qualifying every selected column, since auth_identity also has
  ;; id/created_at/updated_at
  [[^:allow-subquery {:select [:auth_identity.confirmed_at]
                      :from   [:auth_identity]
                      :where  [:and
                               [:= :auth_identity.user_id :core_user.id]
                               [:= :auth_identity.provider totp-provider]]}
    :enrolled_at]])

(defn- user-list-where
  "Where clause of the admin user lists: enrolled users (deliberately unfiltered beyond the enrollment itself, so
  deactivated users appear and an admin can still remove their enrollment) or unenrolled active personal users,
  optionally narrowed by a name or email `search` the way the People page searches. Uses untable-qualified
  `:%lower.x` columns since `.` in `:%lower.x` splits on the column name, not a table qualifier — fine here
  because neither list query joins."
  [enrolled? search]
  (cond-> [:and (if enrolled? confirmed-totp-exists unenrolled-user-where)]
    (not (str/blank? search))
    (conj (let [pattern (h2x/like-substring search)]
            [:or
             [:like :%lower.first_name pattern]
             [:like :%lower.last_name  pattern]
             [:like :%lower.email      pattern]]))))

(mu/defn user
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/User :id user-id))

(mu/defn user-email
  "The email of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :email :model/User :id user-id))

(mu/defn lock-user
  "The `:id` row of the User with `user-id`, locked for update."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id] :id user-id {:for :update}))

(mu/defn totp-identity
  "The TOTP AuthIdentity of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider totp-provider))

(mu/defn lock-totp-identity
  "The TOTP AuthIdentity of the User with `user-id`, locked for update, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider totp-provider {:for :update}))

(mu/defn password-credentials
  "The password credentials of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :credentials :model/AuthIdentity :user_id user-id :provider "password"))

(mu/defn insert-auth-identity!
  "Insert the AuthIdentity `row`, returning the number inserted."
  [row :- [:map {:closed true}
           [:id           {:optional true} ms/PositiveInt]
           [:user_id      {:optional true} [:maybe ::lib.schema.id/user]]
           [:provider     {:optional true} [:maybe [:or :keyword :string]]]
           [:credentials  {:optional true} [:maybe :map]]
           [:metadata     {:optional true} [:maybe :map]]
           [:provider_id  {:optional true} [:maybe :string]]
           [:last_used_at {:optional true} [:maybe ms/TemporalInstant]]
           [:expires_at   {:optional true} [:maybe ms/TemporalInstant]]
           [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
           [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]
           [:confirmed_at {:optional true} [:maybe ms/TemporalInstant]]]]
  (t2/insert! :model/AuthIdentity row))

(mu/defn update-auth-identity!
  "Apply `changes` to the AuthIdentity with `auth-identity-id`, returning the number updated."
  [auth-identity-id :- ms/PositiveInt
   changes          :- (mut/select-keys ::auth-identity.schema/auth-identity.update [:credentials :confirmed_at])]
  (t2/update! :model/AuthIdentity auth-identity-id changes))

(mu/defn delete-totp-identity!
  "Delete the TOTP AuthIdentity of the User with `user-id`, returning the number deleted."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/AuthIdentity :user_id user-id :provider totp-provider))

(mu/defn confirmed-totp-count
  "The number of confirmed TOTP enrollments."
  []
  (t2/count :model/AuthIdentity :provider totp-provider :confirmed_at [:not= nil]))

(mu/defn unenrolled-user-count
  "The number of active personal Users without a confirmed TOTP enrollment."
  []
  (t2/count :model/User {:where unenrolled-user-where}))

(mu/defn user-list
  "The name-ordered admin list of enrolled (with their enrollment time) or unenrolled Users matching `search`, paged
  by the optional `limit` and `offset`."
  [enrolled? :- :boolean
   search    :- [:maybe :string]
   limit     :- [:maybe ms/PositiveInt]
   offset    :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/User
             (cond-> {:select   (cond-> list-columns enrolled? (into enrolled-at-select))
                      :where    (user-list-where enrolled? search)
                      :order-by [[:%lower.first_name :asc]
                                 [:%lower.last_name  :asc]
                                 [:id :asc]]}
               ;; a nil limit would emit `LIMIT NULL`
               limit (assoc :limit limit :offset offset))))

(mu/defn user-list-count
  "The number of enrolled or unenrolled Users matching `search`."
  [enrolled? :- :boolean
   search    :- [:maybe :string]]
  (t2/count :model/User {:where (user-list-where enrolled? search)}))
