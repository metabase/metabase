(ns metabase.oauth-server.db
  "Application database queries for the OAuth server module's five models (`:model/OAuthClient`,
  `:model/OAuthClientEvent`, `:model/OAuthAuthorizationCode`, `:model/OAuthAccessToken`,
  `:model/OAuthRefreshToken`). Every function here is a direct Toucan 2 call with no additional logic, so no
  other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The queries below follow each model's `::opts`; queries that do not fit it live in the oauth-server-only
  section at the bottom of this namespace."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.oauth-server.schema :as oauth-server.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(def ^:private revocable-set-columns
  "Maps the `revoked_at_set` filter key to the column whose nullness it tests."
  {:revoked_at_set :revoked_at})

;;; -------------------------------------------------- OAuthClient --------------------------------------------------

(mr/def ::oauth-client-filters
  "Which OAuthClients a query applies to. Keys mirror the columns of `oauth_client`: a scalar matches that value."
  [:map {:closed true}
   [:id        {:optional true} ms/PositiveInt]
   [:client_id {:optional true} :string]])

(mr/def ::oauth-client-opts
  "The filters above plus the columns to select."
  [:merge
   ::oauth-client-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::oauth-server.schema/oauth-client.column]]]])

(defn- oauth-client-args
  [opts]
  (u.query/opts->args opts))

(defn- oauth-client-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(defn- ->oauth-client-model
  [columns]
  (if (seq columns)
    (into [:model/OAuthClient] columns)
    :model/OAuthClient))

(mu/defn select-one-oauth-client :- [:maybe ::oauth-server.schema/oauth-client.partial]
  "The first OAuthClient matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::oauth-client-opts]]
  (apply t2/select-one (->oauth-client-model columns) (oauth-client-args opts)))

(mu/defn select-one-oauth-client-pk :- [:maybe ms/PositiveInt]
  "The id of the first OAuthClient matching `opts`, or nil."
  [opts :- [:maybe ::oauth-client-opts]]
  (apply t2/select-one-pk :model/OAuthClient (oauth-client-args opts)))

(mu/defn oauth-client-exists? :- :boolean
  "Whether an OAuthClient matching `opts` exists."
  [opts :- [:maybe ::oauth-client-opts]]
  (apply t2/exists? :model/OAuthClient (oauth-client-args opts)))

(mu/defn insert-oauth-client! :- ::oauth-server.schema/oauth-client
  "Insert the OAuthClient `row` and return the inserted instance."
  [row :- ::oauth-server.schema/oauth-client.update]
  (t2/insert-returning-instance! :model/OAuthClient row))

(mu/defn update-oauth-clients! :- :int
  "Apply `changes` to every OAuthClient matching `opts`, returning the number updated."
  [opts    :- [:maybe ::oauth-client-opts]
   changes :- ::oauth-server.schema/oauth-client.update]
  (apply t2/update! :model/OAuthClient (conj (oauth-client-kv-args opts) changes)))

;;; ----------------------------------------------- OAuthAccessToken ------------------------------------------------

(mr/def ::oauth-access-token-filters
  "Which OAuthAccessTokens a query applies to. Keys mirror the columns of `oauth_access_token`: a scalar matches
  that value. `revoked_at_set` matches the rows where `revoked_at` is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:token          {:optional true} :string]
   [:user_id        {:optional true} ::lib.schema.id/user]
   [:revoked_at_set {:optional true} :boolean]])

(mr/def ::oauth-access-token-opts
  "The filters above plus the columns to select."
  [:merge
   ::oauth-access-token-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::oauth-server.schema/oauth-access-token.column]]]])

(defn- oauth-access-token-args
  [opts]
  (u.query/opts->args opts {:set-columns revocable-set-columns}))

(defn- oauth-access-token-kv-args
  [opts]
  (u.query/opts->kv-args opts {:set-columns revocable-set-columns}))

(defn- ->oauth-access-token-model
  [columns]
  (if (seq columns)
    (into [:model/OAuthAccessToken] columns)
    :model/OAuthAccessToken))

(mu/defn select-one-oauth-access-token :- [:maybe ::oauth-server.schema/oauth-access-token.partial]
  "The first OAuthAccessToken matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::oauth-access-token-opts]]
  (apply t2/select-one (->oauth-access-token-model columns) (oauth-access-token-args opts)))

(mu/defn insert-oauth-access-token! :- ::oauth-server.schema/oauth-access-token
  "Insert the OAuthAccessToken `row` and return the inserted instance."
  [row :- ::oauth-server.schema/oauth-access-token.update]
  (t2/insert-returning-instance! :model/OAuthAccessToken row))

(mu/defn update-oauth-access-tokens! :- :int
  "Apply `changes` to every OAuthAccessToken matching `opts`, returning the number updated."
  [opts    :- [:maybe ::oauth-access-token-opts]
   changes :- ::oauth-server.schema/oauth-access-token.update]
  (apply t2/update! :model/OAuthAccessToken (conj (oauth-access-token-kv-args opts) changes)))

(mu/defn delete-oauth-access-tokens! :- :int
  "Delete every OAuthAccessToken matching `opts`, returning the number deleted."
  [opts :- [:maybe ::oauth-access-token-opts]]
  (apply t2/delete! :model/OAuthAccessToken (oauth-access-token-args opts)))

;;; ----------------------------------------------- OAuthRefreshToken -----------------------------------------------

(mr/def ::oauth-refresh-token-filters
  "Which OAuthRefreshTokens a query applies to. Keys mirror the columns of `oauth_refresh_token`: a scalar matches
  that value. `revoked_at_set` matches the rows where `revoked_at` is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:token          {:optional true} :string]
   [:user_id        {:optional true} ::lib.schema.id/user]
   [:revoked_at_set {:optional true} :boolean]])

(mr/def ::oauth-refresh-token-opts
  "The filters above plus the columns to select."
  [:merge
   ::oauth-refresh-token-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::oauth-server.schema/oauth-refresh-token.column]]]])

(defn- oauth-refresh-token-args
  [opts]
  (u.query/opts->args opts {:set-columns revocable-set-columns}))

(defn- oauth-refresh-token-kv-args
  [opts]
  (u.query/opts->kv-args opts {:set-columns revocable-set-columns}))

(defn- ->oauth-refresh-token-model
  [columns]
  (if (seq columns)
    (into [:model/OAuthRefreshToken] columns)
    :model/OAuthRefreshToken))

(mu/defn select-one-oauth-refresh-token :- [:maybe ::oauth-server.schema/oauth-refresh-token.partial]
  "The first OAuthRefreshToken matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::oauth-refresh-token-opts]]
  (apply t2/select-one (->oauth-refresh-token-model columns) (oauth-refresh-token-args opts)))

(mu/defn insert-oauth-refresh-token! :- ::oauth-server.schema/oauth-refresh-token
  "Insert the OAuthRefreshToken `row` and return the inserted instance."
  [row :- ::oauth-server.schema/oauth-refresh-token.update]
  (t2/insert-returning-instance! :model/OAuthRefreshToken row))

(mu/defn update-oauth-refresh-tokens! :- :int
  "Apply `changes` to every OAuthRefreshToken matching `opts`, returning the number updated."
  [opts    :- [:maybe ::oauth-refresh-token-opts]
   changes :- ::oauth-server.schema/oauth-refresh-token.update]
  (apply t2/update! :model/OAuthRefreshToken (conj (oauth-refresh-token-kv-args opts) changes)))

(mu/defn delete-oauth-refresh-tokens! :- :int
  "Delete every OAuthRefreshToken matching `opts`, returning the number deleted."
  [opts :- [:maybe ::oauth-refresh-token-opts]]
  (apply t2/delete! :model/OAuthRefreshToken (oauth-refresh-token-args opts)))

;;; --------------------------------------------- OAuthAuthorizationCode --------------------------------------------

(mr/def ::oauth-authorization-code-filters
  "Which OAuthAuthorizationCodes a query applies to. Keys mirror the columns of `oauth_authorization_code`: a
  scalar matches that value."
  [:map {:closed true}
   [:code    {:optional true} :string]
   [:user_id {:optional true} ::lib.schema.id/user]])

(mr/def ::oauth-authorization-code-opts
  "The filters above plus the columns to select."
  [:merge
   ::oauth-authorization-code-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::oauth-server.schema/oauth-authorization-code.column]]]])

(defn- oauth-authorization-code-args
  [opts]
  (u.query/opts->args opts {:set-columns revocable-set-columns}))

(defn- oauth-authorization-code-kv-args
  [opts]
  (u.query/opts->kv-args opts {:set-columns revocable-set-columns}))

(mu/defn select-one-oauth-authorization-code :- [:maybe ::oauth-server.schema/oauth-authorization-code.partial]
  "The first OAuthAuthorizationCode matching `opts`, or nil."
  [opts :- [:maybe ::oauth-authorization-code-opts]]
  (apply t2/select-one :model/OAuthAuthorizationCode (oauth-authorization-code-args opts)))

(mu/defn insert-oauth-authorization-code! :- ::oauth-server.schema/oauth-authorization-code
  "Insert the OAuthAuthorizationCode `row` and return the inserted instance."
  [row :- ::oauth-server.schema/oauth-authorization-code.update]
  (t2/insert-returning-instance! :model/OAuthAuthorizationCode row))

(mu/defn delete-oauth-authorization-codes! :- :int
  "Delete every OAuthAuthorizationCode matching `opts`, returning the number deleted."
  [opts :- [:maybe ::oauth-authorization-code-opts]]
  (apply t2/delete! :model/OAuthAuthorizationCode (oauth-authorization-code-args opts)))

;;; ------------------------------------------------ OAuthClientEvent -----------------------------------------------

(mu/defn insert-oauth-client-event! :- :int
  "Insert the OAuthClientEvent `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-client-event.update]
  (t2/insert! :model/OAuthClientEvent row))

;;; ------------------------------- Queries used only by the oauth-server module -------------------------------

(mu/defn active-user-exists?
  "Whether an active User with `user-id` exists."
  [user-id :- ::lib.schema.id/user]
  (t2/exists? :model/User :id user-id :is_active true))

(mu/defn lock-oauth-authorization-code :- [:maybe ::oauth-server.schema/oauth-authorization-code]
  "The OAuthAuthorizationCode `code` locked for update, or nil."
  [code :- :string]
  (t2/select-one :model/OAuthAuthorizationCode :code code {:for :update}))

(mu/defn delete-oauth-authorization-codes-expired-before! :- :int
  "Delete the OAuthAuthorizationCodes that expired before `now`, returning the number deleted."
  [now :- ms/PositiveInt]
  (t2/delete! :model/OAuthAuthorizationCode :expiry [:< now]))

(mu/defn delete-oauth-access-tokens-expired-before! :- :int
  "Delete the OAuthAccessTokens that expired before `now`, returning the number deleted."
  [now :- ms/PositiveInt]
  (t2/delete! :model/OAuthAccessToken :expiry [:< now]))

(mu/defn delete-oauth-refresh-tokens-expired-before! :- :int
  "Delete the OAuthRefreshTokens that expired before `now`, returning the number deleted."
  [now :- ms/PositiveInt]
  (t2/delete! :model/OAuthRefreshToken :expiry [:< now]))

(defn- client-event-where
  "The `:where` clause for OAuthClientEvents narrowed by `client-id` and/or `event-type`, or nil for no
  narrowing."
  [client-id event-type]
  (let [clauses (cond-> []
                  client-id  (conj [:= :c.client_id client-id])
                  event-type (conj [:= :e.event_type event-type]))]
    (when (seq clauses)
      (into [:and] clauses))))

(mu/defn count-oauth-client-events
  "The number of OAuthClientEvents matching `client-id` and/or `event-type` (all of them when both nil)."
  [client-id  :- [:maybe :string]
   event-type :- [:maybe :string]]
  (let [where (client-event-where client-id event-type)]
    (t2/query (cond-> {:select    [[[:count :*] :count]]
                       :from      [[:oauth_client_event :e]]
                       :left-join [[:oauth_client :c] [:= :e.oauth_client_id :c.id]]}
                where (assoc :where where)))))

(mu/defn select-oauth-client-events
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
