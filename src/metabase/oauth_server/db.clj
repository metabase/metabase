(ns metabase.oauth-server.db
  "Application database queries for the OAuth server module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
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

(mu/defn client-event-count
  "The number of OAuthClientEvents matching `client-id` and/or `event-type` (all of them when both nil)."
  [client-id  :- [:maybe :string]
   event-type :- [:maybe :string]]
  (let [where (client-event-where client-id event-type)]
    (t2/query (cond-> {:select    [[[:count :*] :count]]
                       :from      [[(t2/table-name :model/OAuthClientEvent) :e]]
                       :left-join [[(t2/table-name :model/OAuthClient) :c] [:= :e.oauth_client_id :c.id]]}
                where (assoc :where where)))))

(mu/defn client-events
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
                       :from       [[(t2/table-name :model/OAuthClientEvent) :e]]
                       :left-join  [[(t2/table-name :model/OAuthClient) :c] [:= :e.oauth_client_id :c.id]
                                    [(t2/table-name :model/User) :u]    [:= :e.user_id :u.id]]
                       :order-by   [[:e.created_at :desc] [:e.id :desc]]
                       :limit      limit
                       :offset     offset}
                where (assoc :where where)))))

(mu/defn active-user-exists?
  "Whether an active User with `user-id` exists."
  [user-id :- ::lib.schema.id/user]
  (when-not (pos-int? user-id)
    (throw (ex-info "user-id must be a positive integer" {:user-id user-id})))
  (t2/exists? :model/User :id user-id :is_active true))

(mu/defn personal-user?
  "Whether the User with `user-id` is a `:personal` user."
  [user-id :- ::lib.schema.id/user]
  (t2/exists? :model/User :id user-id :type :personal))

(mu/defn oauth-client-exists?
  "Whether an OAuthClient with `client-id` exists."
  [client-id :- :string]
  (when-not (string? client-id)
    (throw (ex-info "client-id must be a string" {:client-id client-id})))
  (t2/exists? :model/OAuthClient :client_id client-id))

(mu/defn revoke-access-tokens-for-users!
  "Revoke the unrevoked OAuthAccessTokens of the Users with `user-ids`, returning the number revoked."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/OAuthAccessToken {:user_id [:in %], :revoked_at nil} {:revoked_at [:now]}) user-ids))

(mu/defn revoke-refresh-tokens-for-users!
  "Revoke the unrevoked OAuthRefreshTokens of the Users with `user-ids`, returning the number revoked."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/OAuthRefreshToken {:user_id [:in %], :revoked_at nil} {:revoked_at [:now]}) user-ids))

(mu/defn authorization-code-ids-of-users :- [:sequential ms/PositiveInt]
  "The ids of every OAuthAuthorizationCode of the Users with `user-ids`."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]]
  (mdb/select-batched #(t2/select-pks-vec :model/OAuthAuthorizationCode :user_id [:in %]) user-ids))

(mu/defn oauth-client-pk
  "The primary key of the OAuthClient with `client-id`, or nil."
  [client-id :- :string]
  (when-not (string? client-id)
    (throw (ex-info "client-id must be a string" {:client-id client-id})))
  (t2/select-one-pk :model/OAuthClient :client_id client-id))

(mu/defn insert-client-event!
  "Insert the OAuthClientEvent `row`, returning the number inserted."
  [row :- (mut/optional-keys ::oauth-server.schema/oauth-client-event.update [:id])]
  (t2/insert! :model/OAuthClientEvent row))

(mu/defn oauth-client
  "The OAuthClient with `client-id`, or nil."
  [client-id :- :string]
  (when-not (string? client-id)
    (throw (ex-info "client-id must be a string" {:client-id client-id})))
  (t2/select-one :model/OAuthClient :client_id client-id))

(mu/defn insert-oauth-client!
  "Insert the OAuthClient `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-client.create]
  (when-not (every? #(or (nil? %) (string? %))
                    (map row [:client_id :client_secret_hash :client_name :client_uri :logo_uri :registration_access_token_hash]))
    (throw (ex-info "OAuth client values must be strings" {:row row})))
  (t2/insert! :model/OAuthClient row))

(mu/defn insert-authorization-code!
  "Insert the OAuthAuthorizationCode `row`, returning the number inserted."
  [row :- (mut/dissoc ::oauth-server.schema/oauth-authorization-code.update :id)]
  (t2/insert! :model/OAuthAuthorizationCode row))

(mu/defn authorization-code
  "The OAuthAuthorizationCode `code`, or nil."
  [code :- :string]
  (when-not (string? code)
    (throw (ex-info "code must be a string" {:code code})))
  (t2/select-one :model/OAuthAuthorizationCode :code code))

(mu/defn lock-authorization-code
  "The OAuthAuthorizationCode `code` locked for update, or nil."
  [code :- :string]
  (when-not (string? code)
    (throw (ex-info "code must be a string" {:code code})))
  (t2/select-one :model/OAuthAuthorizationCode :code code {:for :update}))

(mu/defn authorization-code-ids-with-code :- [:sequential ms/PositiveInt]
  "The ids of every OAuthAuthorizationCode `code`."
  [code :- :string]
  (when-not (string? code)
    (throw (ex-info "code must be a string" {:code code})))
  (vec (t2/select-pks-vec :model/OAuthAuthorizationCode :code code)))

(mu/defn insert-access-token!
  "Insert the OAuthAccessToken `row`, returning the number inserted."
  [row :- (mut/dissoc ::oauth-server.schema/oauth-access-token.update :id)]
  (t2/insert! :model/OAuthAccessToken row))

(mu/defn unrevoked-access-token
  "The unrevoked OAuthAccessToken `token`, or nil."
  [token :- :string]
  (when-not (string? token)
    (throw (ex-info "token must be a string" {:token token})))
  (t2/select-one :model/OAuthAccessToken :token token :revoked_at nil))

(mu/defn insert-refresh-token!
  "Insert the OAuthRefreshToken `row`, returning the number inserted."
  [row :- (mut/dissoc ::oauth-server.schema/oauth-refresh-token.update :id)]
  (t2/insert! :model/OAuthRefreshToken row))

(mu/defn unrevoked-refresh-token
  "The unrevoked OAuthRefreshToken `token`, or nil."
  [token :- :string]
  (when-not (string? token)
    (throw (ex-info "token must be a string" {:token token})))
  (t2/select-one :model/OAuthRefreshToken :token token :revoked_at nil))

(mu/defn revoke-access-token!
  "Revoke the OAuthAccessToken `token`, returning the number revoked."
  [token :- :string]
  (when-not (string? token)
    (throw (ex-info "token must be a string" {:token token})))
  (t2/update! :model/OAuthAccessToken {:token token} {:revoked_at [:now]}))

(mu/defn revoke-refresh-token!
  "Revoke the OAuthRefreshToken `token`, returning the number revoked."
  [token :- :string]
  (when-not (string? token)
    (throw (ex-info "token must be a string" {:token token})))
  (t2/update! :model/OAuthRefreshToken {:token token} {:revoked_at [:now]}))

(mu/defn authorization-code-ids-expired-before :- [:sequential ms/PositiveInt]
  "The ids of the OAuthAuthorizationCodes that expired before `now`."
  [now :- ms/PositiveInt]
  (vec (t2/select-pks-vec :model/OAuthAuthorizationCode :expiry [:< now])))

(mu/defn access-token-ids-expired-before :- [:sequential ms/PositiveInt]
  "The ids of the OAuthAccessTokens that expired before `now`."
  [now :- ms/PositiveInt]
  (vec (t2/select-pks-vec :model/OAuthAccessToken :expiry [:< now])))

(mu/defn revoked-access-token-ids :- [:sequential ms/PositiveInt]
  "The ids of the revoked OAuthAccessTokens."
  []
  (vec (t2/select-pks-vec :model/OAuthAccessToken :revoked_at [:not= nil])))

(mu/defn refresh-token-ids-expired-before :- [:sequential ms/PositiveInt]
  "The ids of the OAuthRefreshTokens that expired before `now`."
  [now :- ms/PositiveInt]
  (vec (t2/select-pks-vec :model/OAuthRefreshToken :expiry [:< now])))

(mu/defn revoked-refresh-token-ids :- [:sequential ms/PositiveInt]
  "The ids of the revoked OAuthRefreshTokens."
  []
  (vec (t2/select-pks-vec :model/OAuthRefreshToken :revoked_at [:not= nil])))
