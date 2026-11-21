(ns metabase.oauth-server.models.oauth-access-token
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

;; The `token` and `refresh_token` columns store hashed values.
;; The oidc-provider library hashes these before writing to the store.
(methodical/defmethod t2/table-name :model/OAuthAccessToken [_model] :oauth_access_token)

(doto :model/OAuthAccessToken
  (derive :metabase/model))

(t2/deftransforms :model/OAuthAccessToken
  {:scope    mi/transform-json
   :resource mi/transform-json})

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-oauth-access-token!
  "Insert the OAuthAccessToken `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-access-token.create]
  (oauth-server.db/insert-access-token! row))

(mu/defn revoke-oauth-access-token!
  "Revoke the OAuthAccessToken `token`, returning the number revoked."
  [token :- :string]
  (oauth-server.db/revoke-access-token! token))

(mu/defn revoke-user-oauth-access-tokens!
  "Revoke the unrevoked OAuthAccessTokens of the Users with `user-ids`, returning the number revoked."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]]
  (oauth-server.db/revoke-access-tokens-for-users! user-ids))

(mu/defn delete-expired-oauth-access-tokens!
  "Delete the OAuthAccessTokens that expired before `now`, in epoch milliseconds, returning the number deleted."
  [now :- ms/PositiveInt]
  (oauth-server.db/delete-access-tokens-expired-before! now))

(mu/defn delete-revoked-oauth-access-tokens!
  "Delete the revoked OAuthAccessTokens, returning the number deleted."
  []
  (oauth-server.db/delete-revoked-access-tokens!))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/OAuthAccessToken [_model]
  {:skip? false})
