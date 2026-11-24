(ns metabase.oauth-server.models.oauth-client
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.oauth-server.schema :as oauth-server.schema]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/OAuthClient [_model] :oauth_client)

(doto :model/OAuthClient
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/OAuthClient
  {:redirect_uris  mi/transform-json
   :grant_types    mi/transform-json
   :response_types mi/transform-json
   :scopes         mi/transform-json
   :contacts       mi/transform-json})

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-oauth-client!
  "Insert the OAuthClient `row`, returning the number inserted."
  [row :- ::oauth-server.schema/oauth-client.create]
  (oauth-server.db/insert-oauth-client! row))

(mu/defn update-oauth-clients! :- :nil
  "Apply `updates`, each the primary key of an OAuthClient and the columns to set, in one transaction."
  [updates :- [:sequential ::oauth-server.schema/oauth-client.update]]
  (app-db/update-batched! :model/OAuthClient updates {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/OAuthClient [_model]
  {:skip? false})
