(ns metabase.oauth-server.models.oauth-access-token
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
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

(mu/defn revoke-oauth-access-tokens-for-users!
  "Revoke the unrevoked OAuthAccessTokens of the Users with `user-ids`, returning the number revoked."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]]
  (oauth-server.db/revoke-access-tokens-for-users! user-ids))

(mu/defn delete-oauth-access-tokens! :- :nil
  "Delete the OAuthAccessTokens with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/OAuthAccessToken ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/OAuthAccessToken [_model]
  {:skip? false})
