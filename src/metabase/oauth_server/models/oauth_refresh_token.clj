(ns metabase.oauth-server.models.oauth-refresh-token
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.oauth-server.schema :as oauth-server.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/OAuthRefreshToken [_model] :oauth_refresh_token)

(doto :model/OAuthRefreshToken
  (derive :metabase/model))

(t2/deftransforms :model/OAuthRefreshToken
  {:scope    mi/transform-json
   :resource mi/transform-json})

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-oauth-refresh-token!
  "Insert the OAuthRefreshToken `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-refresh-token.create]
  (oauth-server.db/insert-refresh-token! row))

(mu/defn revoke-oauth-refresh-token!
  "Revoke the OAuthRefreshToken `token`, returning the number revoked."
  [token :- :string]
  (oauth-server.db/revoke-refresh-token! token))

(mu/defn revoke-user-oauth-refresh-tokens!
  "Revoke the unrevoked OAuthRefreshTokens of the Users with `user-ids`, returning the number revoked."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]]
  (oauth-server.db/revoke-refresh-tokens-for-users! user-ids))

(mu/defn delete-expired-oauth-refresh-tokens!
  "Delete the OAuthRefreshTokens that expired before `now`, in epoch milliseconds, returning the number deleted."
  [now :- ms/PositiveInt]
  (oauth-server.db/delete-refresh-tokens-expired-before! now))

(mu/defn delete-revoked-oauth-refresh-tokens!
  "Delete the revoked OAuthRefreshTokens, returning the number deleted."
  []
  (oauth-server.db/delete-revoked-refresh-tokens!))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/OAuthRefreshToken [_model]
  {:skip? false})
