(ns metabase.oauth-server.models.oauth-client
  (:require
   [metabase.models.interface :as mi]
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/OAuthClient [_model] :oauth_client)

(doto :model/OAuthClient
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/OAuthClient
  {:redirect_uris  mi/transform-json
   :grant_types    mi/transform-json
   :response_types mi/transform-json
   :scopes         mi/transform-json
   :contacts       mi/transform-json})
