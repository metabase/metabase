(ns metabase.oauth-server.models.oauth-client
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/OAuthClient [_model] :oauth_client)

(doto :model/OAuthClient
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defmethod app-db-copy/spec :model/OAuthClient [_model]
  {:skip? false})

(t2/deftransforms :model/OAuthClient
  {:redirect_uris  mi/transform-json
   :grant_types    mi/transform-json
   :response_types mi/transform-json
   :scopes         mi/transform-json
   :contacts       mi/transform-json})
