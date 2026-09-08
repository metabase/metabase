(ns metabase-enterprise.support-access-grants.db
  "Application database queries for the support-access-grants module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn active-grant-exists? :- :boolean
  "Whether a SupportAccessGrantLog is unrevoked and ends after `now`."
  [now :- ms/TemporalInstant]
  (t2/exists? :model/SupportAccessGrantLog :revoked_at nil :grant_end_timestamp [:> now]))

(mu/defn grant :- [:maybe (ms/InstanceOf :model/SupportAccessGrantLog)]
  "The SupportAccessGrantLog with `grant-id`, or nil."
  [grant-id :- ms/PositiveInt]
  (t2/select-one :model/SupportAccessGrantLog :id grant-id))

(mu/defn current-grant :- [:maybe (ms/InstanceOf :model/SupportAccessGrantLog)]
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

(mu/defn grants-page :- [:sequential (ms/InstanceOf :model/SupportAccessGrantLog)]
  "The newest-first SupportAccessGrantLogs, optionally narrowed to `ticket-number` and `user-id` and excluding revoked
  grants unless `include-revoked?`, paged by `limit` and `offset`."
  [include-revoked? :- [:maybe :boolean]
   ticket-number    :- [:maybe :string]
   user-id          :- [:maybe ms/PositiveInt]
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
   user-id          :- [:maybe ms/PositiveInt]]
  (let [where (grants-where include-revoked? ticket-number user-id)]
    (t2/count :model/SupportAccessGrantLog
              (cond-> {}
                where (assoc :where where)))))

(mu/defn insert-grant! :- (ms/InstanceOf :model/SupportAccessGrantLog)
  "Insert `grant` and return the new instance."
  [grant :- [:map {:closed true}
             [:user_id               ms/PositiveInt]
             [:ticket_number         [:maybe :string]]
             [:notes                 [:maybe :string]]
             [:grant_start_timestamp ms/TemporalInstant]
             [:grant_end_timestamp   ms/TemporalInstant]]]
  (t2/insert-returning-instance! :model/SupportAccessGrantLog grant))

(mu/defn update-grant! :- :int
  "Apply `changes` to the SupportAccessGrantLog with `grant-id`, returning the number updated."
  [grant-id :- ms/PositiveInt
   changes  :- [:map {:closed true}
                [:revoked_at         ms/TemporalInstant]
                [:revoked_by_user_id ms/PositiveInt]]]
  (t2/update! :model/SupportAccessGrantLog grant-id changes))

(mu/defn user :- [:maybe (ms/InstanceOf :model/User)]
  "The User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one :model/User user-id))

(mu/defn user-by-email :- [:maybe (ms/InstanceOf :model/User)]
  "The User with `email`, or nil."
  [email :- :string]
  (t2/select-one :model/User :email email))

(mu/defn user-superuser-flag-by-email :- [:maybe (ms/InstanceOf :model/User)]
  "The `:id` and `:is_superuser` of the User with `email`, or nil."
  [email :- :string]
  (t2/select-one [:model/User :id :is_superuser] :email email))

(mu/defn user-names-and-emails :- [:map-of ms/PositiveInt
                                   [:map {:closed true}
                                    [:first_name [:maybe :string]]
                                    [:email      :string]]]
  "A map of User ID to first name and email for `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn #(select-keys % [:first_name :email]) [:model/User :id :first_name :email] :id [:in user-ids]))

(mu/defn insert-user! :- (ms/InstanceOf :model/User)
  "Insert `user` and return the new instance."
  [user :- [:map {:closed true}
            [:email        :string]
            [:first_name   {:optional true} [:maybe :string]]
            [:last_name    {:optional true} [:maybe :string]]
            [:is_superuser {:optional true} :boolean]]]
  (t2/insert-returning-instance! :model/User user))

(mu/defn update-user! :- :int
  "Apply `changes` to the User with `user-id`, returning the number updated."
  [user-id :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:is_active    {:optional true} :boolean]
               [:is_superuser {:optional true} :boolean]]]
  (t2/update! :model/User user-id changes))

(mu/defn session-exists-for-user? :- :boolean
  "Whether the User with `user-id` has a Session."
  [user-id :- ms/PositiveInt]
  (t2/exists? :model/Session :user_id user-id))

(mu/defn delete-sessions-of-user! :- :int
  "Delete the Sessions of the User with `user-id`, returning the number deleted."
  [user-id :- ms/PositiveInt]
  (t2/delete! :model/Session :user_id user-id))

(mu/defn auth-identity-ids-of-user :- [:maybe [:sequential ms/PositiveInt]]
  "The IDs of the AuthIdentities of the User with `user-id`."
  [user-id :- ms/PositiveInt]
  (t2/select-pks-vec :model/AuthIdentity :user_id user-id))

(mu/defn support-access-auth-identity-id :- [:maybe ms/PositiveInt]
  "The ID of the support-access-grant AuthIdentity of the User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider "support-access-grant"))

(mu/defn insert-auth-identity! :- :int
  "Insert the AuthIdentity `row`, returning the number inserted."
  [row :- [:map {:closed true}
           [:user_id      {:optional true} ms/PositiveInt]
           [:provider     {:optional true} :string]
           [:provider_id  {:optional true} [:maybe :string]]
           [:expires_at   {:optional true} [:maybe ms/TemporalInstant]]
           [:credentials  {:optional true} :any]
           [:metadata     {:optional true} :any]]]
  (t2/insert! :model/AuthIdentity row))

(mu/defn update-auth-identity! :- :int
  "Apply `changes` to the AuthIdentity with `auth-identity-id`, returning the number updated. `changes` may be a
  whole AuthIdentity instance re-saved after a partial edit (e.g. [[metabase.auth-identity.providers.emailed-secret/mark-token-consumed]]
  round-trips the full row it was given), so every column is accepted."
  [auth-identity-id :- ms/PositiveInt
   changes          :- [:map {:closed true}
                        [:id            {:optional true} ms/PositiveInt]
                        [:user_id       {:optional true} ms/PositiveInt]
                        [:provider      {:optional true} :string]
                        [:provider_id   {:optional true} [:maybe :string]]
                        [:expires_at    {:optional true} [:maybe ms/TemporalInstant]]
                        [:last_used_at  {:optional true} [:maybe ms/TemporalInstant]]
                        [:confirmed_at  {:optional true} [:maybe ms/TemporalInstant]]
                        [:created_at    {:optional true} ms/TemporalInstant]
                        [:updated_at    {:optional true} ms/TemporalInstant]
                        [:credentials   {:optional true} :any]
                        [:metadata      {:optional true} :any]]]
  (t2/update! :model/AuthIdentity auth-identity-id changes))

(mu/defn expire-auth-identities! :- :int
  "Set the expiry of the AuthIdentities with `auth-identity-ids` to `expires-at`, returning the number updated."
  [auth-identity-ids :- [:seqable ms/PositiveInt]
   expires-at        :- ms/TemporalInstant]
  (t2/update! :model/AuthIdentity :id [:in auth-identity-ids] {:expires_at expires-at}))
