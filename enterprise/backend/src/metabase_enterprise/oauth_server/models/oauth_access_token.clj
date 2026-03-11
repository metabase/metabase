(ns metabase-enterprise.oauth-server.models.oauth-access-token
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/OAuthAccessToken [_model] :oauth_access_token)

(doto :model/OAuthAccessToken
  (derive :metabase/model))

(t2/deftransforms :model/OAuthAccessToken
  {:scope    mi/transform-json
   :resource mi/transform-json})
