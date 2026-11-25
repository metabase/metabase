(ns metabase.oauth-server.models.oauth-authorization-code
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.oauth-server.schema :as oauth-server.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; The `code` column stores a hashed value.
;; The oidc-provider library hashes the authorization code before writing to the store.
(methodical/defmethod t2/table-name :model/OAuthAuthorizationCode [_model] :oauth_authorization_code)

(doto :model/OAuthAuthorizationCode
  (derive :metabase/model))

(t2/deftransforms :model/OAuthAuthorizationCode
  {:scope    mi/transform-json
   :resource mi/transform-json})

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-oauth-authorization-code!
  "Insert the OAuthAuthorizationCode `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-authorization-code.create]
  (oauth-server.db/insert-authorization-code! row))

(mu/defn delete-oauth-authorization-codes! :- :nil
  "Delete the OAuthAuthorizationCodes with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/OAuthAuthorizationCode ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/OAuthAuthorizationCode [_model]
  {:skip? false})
