(ns metabase-enterprise.support-access-grants.db
  "Application database queries for the support-access-grants module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.support-access-grants.schema :as support-access-grants.schema]
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn active-grant-exists? :- :boolean
  "Whether a SupportAccessGrantLog is unrevoked and ends after `now`."
  [now :- ms/TemporalInstant]
  (t2/exists? :model/SupportAccessGrantLog :revoked_at nil :grant_end_timestamp [:> now]))

(mu/defn grant :- [:maybe ::support-access-grants.schema/support-access-grant-log]
  "The SupportAccessGrantLog with `grant-id`, or nil."
  [grant-id :- ms/PositiveInt]
  (t2/select-one :model/SupportAccessGrantLog :id grant-id))

(mu/defn current-grant :- [:maybe ::support-access-grants.schema/support-access-grant-log]
  "The newest unrevoked SupportAccessGrantLog that has not ended, or nil."
  []
  (t2/select-one :model/SupportAccessGrantLog
                 {:where    [:and [:= :revoked_at nil]
                             [:> :grant_end_timestamp :%now]]
                  :order-by [[:created_at :desc]
                             [:id :desc]]}))

(defn- grants-where
  [include-revoked? ticket-number user-id]
  (let [conditions (cond-> []
                     (not include-revoked?) (conj [:= :revoked_at nil])
                     ticket-number          (conj [:= :ticket_number ticket-number])
                     user-id                (conj [:= :user_id user-id]))]
    (when (seq conditions)
      (into [:and] conditions))))

(mu/defn grants-page :- [:sequential ::support-access-grants.schema/support-access-grant-log]
  "The newest-first SupportAccessGrantLogs, optionally narrowed to `ticket-number` and `user-id` and excluding revoked
  grants unless `include-revoked?`, paged by `limit` and `offset`."
  [include-revoked? :- [:maybe :boolean]
   ticket-number    :- [:maybe :string]
   user-id          :- [:maybe ::lib.schema.id/user]
   limit            :- ms/PositiveInt
   offset           :- ms/IntGreaterThanOrEqualToZero]
  (let [where (grants-where include-revoked? ticket-number user-id)]
    (t2/select :model/SupportAccessGrantLog
               (cond-> {:limit    limit
                        :offset   offset
                        :order-by [[:created_at :desc]]}
                 where (assoc :where where)))))

(mu/defn grant-count :- ms/IntGreaterThanOrEqualToZero
  "The number of SupportAccessGrantLogs [[grants-page]] would page through."
  [include-revoked? :- [:maybe :boolean]
   ticket-number    :- [:maybe :string]
   user-id          :- [:maybe ::lib.schema.id/user]]
  (let [where (grants-where include-revoked? ticket-number user-id)]
    (t2/count :model/SupportAccessGrantLog
              (cond-> {}
                where (assoc :where where)))))

(mu/defn insert-grant! :- ::support-access-grants.schema/support-access-grant-log
  "Insert `grant` and return the new instance."
  [grant :- (mut/select-keys ::support-access-grants.schema/support-access-grant-log.update [:user_id :ticket_number :notes :grant_start_timestamp :grant_end_timestamp])]
  (t2/insert-returning-instance! :model/SupportAccessGrantLog grant))

(mu/defn update-grant! :- :int
  "Apply `changes` to the SupportAccessGrantLog with `grant-id`, returning the number updated."
  [grant-id :- ms/PositiveInt
   changes  :- (mut/select-keys ::support-access-grants.schema/support-access-grant-log.update [:revoked_at :revoked_by_user_id])]
  (t2/update! :model/SupportAccessGrantLog grant-id changes))

(mu/defn user :- [:maybe ::users.schema/user]
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/User user-id))

(mu/defn user-by-email :- [:maybe ::users.schema/user]
  "The User with `email`, or nil."
  [email :- :string]
  (t2/select-one :model/User :email email))

(def ^:private UserSuperuserFlagByEmail
  "Rows returned by [[user-superuser-flag-by-email]]."
  (mut/select-keys ::users.schema/user [:id :is_superuser :common_name]))

(mu/defn user-superuser-flag-by-email :- [:maybe UserSuperuserFlagByEmail]
  "The `:id` and `:is_superuser` of the User with `email`, or nil."
  [email :- :string]
  (t2/select-one [:model/User :id :is_superuser] :email email))

(def ^:private UserNamesAndEmail
  "Rows returned by [[user-names-and-emails]]."
  [:map {:closed true}
   [:first_name [:maybe :string]]
   [:email      :string]])

(mu/defn user-names-and-emails :- [:map-of ms/PositiveInt
                                   UserNamesAndEmail]
  "A map of User ID to first name and email for `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-pk->fn #(select-keys % [:first_name :email]) [:model/User :id :first_name :email] :id [:in user-ids]))

(mu/defn insert-user! :- ::users.schema/user
  "Insert `user` and return the new instance."
  [user :- (mut/select-keys ::users.schema/user.update [:email :first_name :last_name :is_superuser])]
  (t2/insert-returning-instance! :model/User user))

(mu/defn update-user! :- :int
  "Apply `changes` to the User with `user-id`, returning the number updated."
  [user-id :- ::lib.schema.id/user
   changes :- (mut/select-keys ::users.schema/user.update [:is_active :is_superuser])]
  (t2/update! :model/User user-id changes))

(mu/defn session-exists-for-user? :- :boolean
  "Whether the User with `user-id` has a Session."
  [user-id :- ::lib.schema.id/user]
  (t2/exists? :model/Session :user_id user-id))

(mu/defn delete-sessions-of-user! :- :int
  "Delete the Sessions of the User with `user-id`, returning the number deleted."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/Session :user_id user-id))

(mu/defn auth-identity-ids-of-user :- [:maybe [:sequential ms/PositiveInt]]
  "The IDs of the AuthIdentities of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-pks-vec :model/AuthIdentity :user_id user-id))

(mu/defn support-access-auth-identity-id :- [:maybe ms/PositiveInt]
  "The ID of the support-access-grant AuthIdentity of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider "support-access-grant"))

(mu/defn insert-auth-identity! :- :int
  "Insert the AuthIdentity `row`, returning the number inserted."
  [row :- (mut/select-keys ::auth-identity.schema/auth-identity.update [:user_id :provider :provider_id :expires_at :credentials :metadata])]
  (t2/insert! :model/AuthIdentity row))

(mu/defn update-auth-identity! :- :int
  "Apply `changes` to the AuthIdentity with `auth-identity-id`, returning the number updated. `changes` may be a
  whole AuthIdentity instance re-saved after a partial edit (e.g. [[metabase.auth-identity.providers.emailed-secret/mark-token-consumed]]
  round-trips the full row it was given), so every column is accepted."
  [auth-identity-id :- ms/PositiveInt
   changes          :- [:map {:closed true}
                        [:id            {:optional true} ms/PositiveInt]
                        [:user_id       {:optional true} ::lib.schema.id/user]
                        [:provider      {:optional true} :string]
                        [:provider_id   {:optional true} [:maybe :string]]
                        [:expires_at    {:optional true} [:maybe ms/TemporalInstant]]
                        [:last_used_at  {:optional true} [:maybe ms/TemporalInstant]]
                        [:confirmed_at  {:optional true} [:maybe ms/TemporalInstant]]
                        [:created_at    {:optional true} ms/TemporalInstant]
                        [:updated_at    {:optional true} ms/TemporalInstant]
                        [:credentials   {:optional true} [:maybe :map]]
                        [:metadata      {:optional true} [:maybe :map]]]]
  (t2/update! :model/AuthIdentity auth-identity-id changes))

(mu/defn expire-auth-identities! :- :int
  "Set the expiry of the AuthIdentities with `auth-identity-ids` to `expires-at`, returning the number updated."
  [auth-identity-ids :- [:sequential ms/PositiveInt]
   expires-at        :- ms/TemporalInstant]
  (t2/update! :model/AuthIdentity :id [:in auth-identity-ids] {:expires_at expires-at}))
