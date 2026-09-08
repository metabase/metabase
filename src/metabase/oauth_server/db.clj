(ns metabase.oauth-server.db
  "Application database queries for the OAuth server module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.oauth-server.schema :as oauth-server.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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

(mu/defn client-event-count :- [:sequential [:map {:closed true} [:count :int]]]
  "The number of OAuthClientEvents matching `client-id` and/or `event-type` (all of them when both nil)."
  [client-id  :- [:maybe :string]
   event-type :- [:maybe :string]]
  (let [where (client-event-where client-id event-type)]
    (t2/query (cond-> {:select    [[[:count :*] :count]]
                       :from      [[:oauth_client_event :e]]
                       :left-join [[:oauth_client :c] [:= :e.oauth_client_id :c.id]]}
                where (assoc :where where)))))

(def ^:private ClientEvent
  "Rows returned by [[client-events]]."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:oauth_client_id    [:maybe ms/PositiveInt]]
   [:user_id            [:maybe ::lib.schema.id/user]]
   [:event_type         :string]
   [:created_at         ms/TemporalInstant]
   [:client_id          [:maybe :string]]
   [:client_name        [:maybe :string]]
   [:client_uri         [:maybe [:or :string :map sequential?]]]
   [:registration_type  [:maybe [:or :keyword :string]]]
   [:application_type   [:maybe [:or :keyword :string]]]
   [:redirect_uris      [:maybe [:or :string :map sequential?]]]
   [:user_email         [:maybe :string]]
   [:user_first_name    [:maybe :string]]
   [:user_last_name     [:maybe :string]]])

(mu/defn client-events :- [:sequential ClientEvent]
  "Up to `limit` OAuthClientEvents from `offset` matching `client-id` and/or `event-type` (all of them when
  both nil), newest first, with their client and deciding user."
  [client-id  :- [:maybe :string]
   event-type :- [:maybe :string]
   limit      :- ms/PositiveInt
   offset     :- ms/IntGreaterThanOrEqualToZero]
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

(mu/defn active-user-exists? :- :boolean
  "Whether an active User with `user-id` exists."
  [user-id :- ::lib.schema.id/user]
  (t2/exists? :model/User :id user-id :is_active true))

(mu/defn oauth-client-exists? :- :boolean
  "Whether an OAuthClient with `client-id` exists."
  [client-id :- :string]
  (t2/exists? :model/OAuthClient :client_id client-id))

(mu/defn revoke-access-tokens-for-user! :- :int
  "Revoke the unrevoked OAuthAccessTokens of the User with `user-id`, returning the number revoked."
  [user-id :- ::lib.schema.id/user]
  (t2/update! :model/OAuthAccessToken {:user_id user-id, :revoked_at nil} {:revoked_at :%now}))

(mu/defn revoke-refresh-tokens-for-user! :- :int
  "Revoke the unrevoked OAuthRefreshTokens of the User with `user-id`, returning the number revoked."
  [user-id :- ::lib.schema.id/user]
  (t2/update! :model/OAuthRefreshToken {:user_id user-id, :revoked_at nil} {:revoked_at :%now}))

(mu/defn delete-authorization-codes-for-user! :- :int
  "Delete the OAuthAuthorizationCodes of the User with `user-id`, returning the number deleted."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/OAuthAuthorizationCode :user_id user-id))

(mu/defn oauth-client-pk :- [:maybe ms/PositiveInt]
  "The primary key of the OAuthClient with `client-id`, or nil."
  [client-id :- :string]
  (t2/select-one-pk :model/OAuthClient :client_id client-id))

(mu/defn insert-client-event! :- :int
  "Insert the OAuthClientEvent `row`, returning the number inserted."
  [row :- [:map {:closed true}
           [:id              {:optional true} ms/PositiveInt]
           [:oauth_client_id {:optional true} [:maybe ms/PositiveInt]]
           [:user_id         {:optional true} [:maybe ::lib.schema.id/user]]
           [:event_type      {:optional true} [:maybe [:or :keyword :string]]]
           [:created_at      {:optional true} [:maybe ms/TemporalInstant]]]]
  (t2/insert! :model/OAuthClientEvent row))

(mu/defn oauth-client :- [:maybe ::oauth-server.schema/oauth-client]
  "The OAuthClient with `client-id`, or nil."
  [client-id :- :string]
  (t2/select-one :model/OAuthClient :client_id client-id))

(mu/defn insert-oauth-client! :- :int
  "Insert the OAuthClient `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-client.update]
  (t2/insert! :model/OAuthClient row))

(mu/defn update-oauth-client! :- :int
  "Apply `row` to the OAuthClient with primary key `id`, returning the number updated."
  [id  :- ms/PositiveInt
   row :- ::oauth-server.schema/oauth-client.update]
  (t2/update! :model/OAuthClient id row))

(mu/defn insert-authorization-code! :- :int
  "Insert the OAuthAuthorizationCode `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-authorization-code.update]
  (t2/insert! :model/OAuthAuthorizationCode row))

(mu/defn authorization-code :- [:maybe ::oauth-server.schema/oauth-authorization-code]
  "The OAuthAuthorizationCode `code`, or nil."
  [code :- :string]
  (t2/select-one :model/OAuthAuthorizationCode :code code))

(mu/defn lock-authorization-code :- [:maybe ::oauth-server.schema/oauth-authorization-code]
  "The OAuthAuthorizationCode `code` locked for update, or nil."
  [code :- :string]
  (t2/select-one :model/OAuthAuthorizationCode :code code {:for :update}))

(mu/defn delete-authorization-code! :- :int
  "Delete the OAuthAuthorizationCode `code`, returning the number deleted."
  [code :- :string]
  (t2/delete! :model/OAuthAuthorizationCode :code code))

(mu/defn insert-access-token! :- :int
  "Insert the OAuthAccessToken `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-access-token.update]
  (t2/insert! :model/OAuthAccessToken row))

(mu/defn unrevoked-access-token :- [:maybe ::oauth-server.schema/oauth-access-token]
  "The unrevoked OAuthAccessToken `token`, or nil."
  [token :- :string]
  (t2/select-one :model/OAuthAccessToken :token token :revoked_at nil))

(mu/defn insert-refresh-token! :- :int
  "Insert the OAuthRefreshToken `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-refresh-token.update]
  (t2/insert! :model/OAuthRefreshToken row))

(mu/defn unrevoked-refresh-token :- [:maybe ::oauth-server.schema/oauth-refresh-token]
  "The unrevoked OAuthRefreshToken `token`, or nil."
  [token :- :string]
  (t2/select-one :model/OAuthRefreshToken :token token :revoked_at nil))

(mu/defn revoke-access-token! :- :int
  "Revoke the OAuthAccessToken `token`, returning the number revoked."
  [token :- :string]
  (t2/update! :model/OAuthAccessToken {:token token} {:revoked_at :%now}))

(mu/defn revoke-refresh-token! :- :int
  "Revoke the OAuthRefreshToken `token`, returning the number revoked."
  [token :- :string]
  (t2/update! :model/OAuthRefreshToken {:token token} {:revoked_at :%now}))

(mu/defn delete-authorization-codes-expired-before! :- :int
  "Delete the OAuthAuthorizationCodes that expired before `now`, returning the number deleted."
  [now :- ms/PositiveInt]
  (t2/delete! :model/OAuthAuthorizationCode :expiry [:< now]))

(mu/defn delete-access-tokens-expired-before! :- :int
  "Delete the OAuthAccessTokens that expired before `now`, returning the number deleted."
  [now :- ms/PositiveInt]
  (t2/delete! :model/OAuthAccessToken :expiry [:< now]))

(mu/defn delete-revoked-access-tokens! :- :int
  "Delete the revoked OAuthAccessTokens, returning the number deleted."
  []
  (t2/delete! :model/OAuthAccessToken :revoked_at [:not= nil]))

(mu/defn delete-refresh-tokens-expired-before! :- :int
  "Delete the OAuthRefreshTokens that expired before `now`, returning the number deleted."
  [now :- ms/PositiveInt]
  (t2/delete! :model/OAuthRefreshToken :expiry [:< now]))

(mu/defn delete-revoked-refresh-tokens! :- :int
  "Delete the revoked OAuthRefreshTokens, returning the number deleted."
  []
  (t2/delete! :model/OAuthRefreshToken :revoked_at [:not= nil]))
