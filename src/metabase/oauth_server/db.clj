(ns metabase.oauth-server.db
  "Application database queries for the OAuth server module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn- client-event-where
  "The `:where` clause for OAuthClientEvents narrowed by `client-id` and/or `event-type`, or nil for no
  narrowing."
  [client-id event-type]
  (let [clauses (cond-> []
                  client-id  (conj [:= :c.client_id client-id])
                  event-type (conj [:= :e.event_type event-type]))]
    (when (seq clauses)
      (into [:and] clauses))))

(defn client-event-count
  "The number of OAuthClientEvents matching `client-id` and/or `event-type` (all of them when both nil)."
  [client-id event-type]
  (let [where (client-event-where client-id event-type)]
    (t2/query (cond-> {:select    [[[:count :*] :count]]
                       :from      [[:oauth_client_event :e]]
                       :left-join [[:oauth_client :c] [:= :e.oauth_client_id :c.id]]}
                where (assoc :where where)))))

(defn client-events
  "Up to `limit` OAuthClientEvents from `offset` matching `client-id` and/or `event-type` (all of them when
  both nil), newest first, with their client and deciding user."
  [client-id event-type limit offset]
  (let [where (client-event-where client-id event-type)]
    (t2/query (cond-> {:select     [:e.id :e.oauth_client_id :e.user_id :e.event_type :e.created_at
                                    [:c.client_id :client_id]
                                    [:c.client_name :client_name]
                                    [:c.client_uri :client_uri]
                                    [:c.registration_type :registration_type]
                                    [:c.application_type :application_type]
                                    [:c.redirect_uris :redirect_uris]
                                    [:u.email :user_email]
                                    [:u.first_name :user_first_name]
                                    [:u.last_name :user_last_name]]
                       :from       [[:oauth_client_event :e]]
                       :left-join  [[:oauth_client :c] [:= :e.oauth_client_id :c.id]
                                    [:core_user :u]    [:= :e.user_id :u.id]]
                       :order-by   [[:e.created_at :desc] [:e.id :desc]]
                       :limit      limit
                       :offset     offset}
                where (assoc :where where)))))

(defn active-user-exists?
  "Whether an active User with `user-id` exists."
  [user-id]
  (t2/exists? :model/User :id user-id :is_active true))

(defn oauth-client-exists?
  "Whether an OAuthClient with `client-id` exists."
  [client-id]
  (t2/exists? :model/OAuthClient :client_id client-id))

(defn revoke-access-tokens-for-user!
  "Revoke the unrevoked OAuthAccessTokens of the User with `user-id`."
  [user-id]
  (t2/update! :model/OAuthAccessToken {:user_id user-id, :revoked_at nil} {:revoked_at :%now}))

(defn revoke-refresh-tokens-for-user!
  "Revoke the unrevoked OAuthRefreshTokens of the User with `user-id`."
  [user-id]
  (t2/update! :model/OAuthRefreshToken {:user_id user-id, :revoked_at nil} {:revoked_at :%now}))

(defn delete-authorization-codes-for-user!
  "Delete the OAuthAuthorizationCodes of the User with `user-id`."
  [user-id]
  (t2/delete! :model/OAuthAuthorizationCode :user_id user-id))

(defn oauth-client-pk
  "The primary key of the OAuthClient with `client-id`, or nil."
  [client-id]
  (t2/select-one-pk :model/OAuthClient :client_id client-id))

(defn insert-client-event!
  "Insert the OAuthClientEvent `row`."
  [row]
  (t2/insert! :model/OAuthClientEvent row))

(defn oauth-client
  "The OAuthClient with `client-id`, or nil."
  [client-id]
  (t2/select-one :model/OAuthClient :client_id client-id))

(defn insert-oauth-client!
  "Insert the OAuthClient `row`."
  [row]
  (t2/insert! :model/OAuthClient row))

(defn update-oauth-client!
  "Apply `row` to the OAuthClient with primary key `id`."
  [id row]
  (t2/update! :model/OAuthClient id row))

(defn insert-authorization-code!
  "Insert the OAuthAuthorizationCode `row`."
  [row]
  (t2/insert! :model/OAuthAuthorizationCode row))

(defn authorization-code
  "The OAuthAuthorizationCode `code`, or nil."
  [code]
  (t2/select-one :model/OAuthAuthorizationCode :code code))

(defn lock-authorization-code
  "The OAuthAuthorizationCode `code` locked for update, or nil."
  [code]
  (t2/select-one :model/OAuthAuthorizationCode :code code {:for :update}))

(defn delete-authorization-code!
  "Delete the OAuthAuthorizationCode `code`."
  [code]
  (t2/delete! :model/OAuthAuthorizationCode :code code))

(defn insert-access-token!
  "Insert the OAuthAccessToken `row`."
  [row]
  (t2/insert! :model/OAuthAccessToken row))

(defn unrevoked-access-token
  "The unrevoked OAuthAccessToken `token`, or nil."
  [token]
  (t2/select-one :model/OAuthAccessToken :token token :revoked_at nil))

(defn insert-refresh-token!
  "Insert the OAuthRefreshToken `row`."
  [row]
  (t2/insert! :model/OAuthRefreshToken row))

(defn unrevoked-refresh-token
  "The unrevoked OAuthRefreshToken `token`, or nil."
  [token]
  (t2/select-one :model/OAuthRefreshToken :token token :revoked_at nil))

(defn revoke-access-token!
  "Revoke the OAuthAccessToken `token`."
  [token]
  (t2/update! :model/OAuthAccessToken {:token token} {:revoked_at :%now}))

(defn revoke-refresh-token!
  "Revoke the OAuthRefreshToken `token`."
  [token]
  (t2/update! :model/OAuthRefreshToken {:token token} {:revoked_at :%now}))

(defn delete-authorization-codes-expired-before!
  "Delete the OAuthAuthorizationCodes that expired before `now`, returning the number deleted."
  [now]
  (t2/delete! :model/OAuthAuthorizationCode :expiry [:< now]))

(defn delete-access-tokens-expired-before!
  "Delete the OAuthAccessTokens that expired before `now`, returning the number deleted."
  [now]
  (t2/delete! :model/OAuthAccessToken :expiry [:< now]))

(defn delete-revoked-access-tokens!
  "Delete the revoked OAuthAccessTokens, returning the number deleted."
  []
  (t2/delete! :model/OAuthAccessToken :revoked_at [:not= nil]))

(defn delete-refresh-tokens-expired-before!
  "Delete the OAuthRefreshTokens that expired before `now`, returning the number deleted."
  [now]
  (t2/delete! :model/OAuthRefreshToken :expiry [:< now]))

(defn delete-revoked-refresh-tokens!
  "Delete the revoked OAuthRefreshTokens, returning the number deleted."
  []
  (t2/delete! :model/OAuthRefreshToken :revoked_at [:not= nil]))
