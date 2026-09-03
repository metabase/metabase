(ns metabase-enterprise.support-access-grants.db
  "Application database queries for the support-access-grants module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [toucan2.core :as t2]))

(defn active-grant-exists?
  "Whether a SupportAccessGrantLog is unrevoked and ends after `now`."
  [now]
  (t2/exists? :model/SupportAccessGrantLog :revoked_at nil :grant_end_timestamp [:> now]))

(defn grant
  "The SupportAccessGrantLog with `grant-id`, or nil."
  [grant-id]
  (t2/select-one :model/SupportAccessGrantLog :id grant-id))

(defn current-grant
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

(defn grants-page
  "The newest-first SupportAccessGrantLogs, optionally narrowed to `ticket-number` and `user-id` and excluding revoked
  grants unless `include-revoked?`, paged by `limit` and `offset`."
  [include-revoked? ticket-number user-id limit offset]
  (t2/select :model/SupportAccessGrantLog
             (cond-> {:limit    limit
                      :offset   offset
                      :order-by [[:created_at :desc]]}
               (grants-where include-revoked? ticket-number user-id)
               (assoc :where (grants-where include-revoked? ticket-number user-id)))))

(defn grant-count
  "The number of SupportAccessGrantLogs [[grants-page]] would page through."
  [include-revoked? ticket-number user-id]
  (t2/count :model/SupportAccessGrantLog
            (cond-> {}
              (grants-where include-revoked? ticket-number user-id)
              (assoc :where (grants-where include-revoked? ticket-number user-id)))))

(defn insert-grant!
  "Insert `grant` and return the new instance."
  [grant]
  (t2/insert-returning-instance! :model/SupportAccessGrantLog grant))

(defn update-grant!
  "Apply `changes` to the SupportAccessGrantLog with `grant-id`."
  [grant-id changes]
  (t2/update! :model/SupportAccessGrantLog grant-id changes))

(defn hydrate-user-info
  "Hydrate `:user_info` onto `grants`."
  [grants]
  (t2/hydrate grants :user_info))

(defn user
  "The User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/User user-id))

(defn user-by-email
  "The User with `email`, or nil."
  [email]
  (t2/select-one :model/User :email email))

(defn user-superuser-flag-by-email
  "The `:id` and `:is_superuser` of the User with `email`, or nil."
  [email]
  (t2/select-one [:model/User :id :is_superuser] :email email))

(defn user-names-and-emails
  "A map of User ID to first name and email for `user-ids`."
  [user-ids]
  (t2/select-pk->fn #(select-keys % [:first_name :email]) [:model/User :id :first_name :email] :id [:in user-ids]))

(defn insert-user!
  "Insert `user` and return the new instance."
  [user]
  (t2/insert-returning-instance! :model/User user))

(defn update-user!
  "Apply `changes` to the User with `user-id`."
  [user-id changes]
  (t2/update! :model/User user-id changes))

(defn session-exists-for-user?
  "Whether the User with `user-id` has a Session."
  [user-id]
  (t2/exists? :model/Session :user_id user-id))

(defn delete-sessions-of-user!
  "Delete the Sessions of the User with `user-id`."
  [user-id]
  (t2/delete! :model/Session :user_id user-id))

(defn auth-identity-ids-of-user
  "The IDs of the AuthIdentities of the User with `user-id`."
  [user-id]
  (t2/select-pks-vec :model/AuthIdentity :user_id user-id))

(defn support-access-auth-identity-id
  "The ID of the support-access-grant AuthIdentity of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider "support-access-grant"))

(defn insert-auth-identity!
  "Insert the AuthIdentity `row`."
  [row]
  (t2/insert! :model/AuthIdentity row))

(defn update-auth-identity!
  "Apply `changes` to the AuthIdentity with `auth-identity-id`."
  [auth-identity-id changes]
  (t2/update! :model/AuthIdentity auth-identity-id changes))

(defn expire-auth-identities!
  "Set the expiry of the AuthIdentities with `auth-identity-ids` to `expires-at`."
  [auth-identity-ids expires-at]
  (t2/update! :model/AuthIdentity :id [:in auth-identity-ids] {:expires_at expires-at}))
