(ns metabase.oauth-server.models.oauth-refresh-token
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/OAuthRefreshToken [_model] :oauth_refresh_token)

(doto :model/OAuthRefreshToken
  (derive :metabase/model))

(defmethod app-db-copy/spec :model/OAuthRefreshToken [_model]
  {:skip? false})

(t2/deftransforms :model/OAuthRefreshToken
  {:scope    mi/transform-json
   :resource mi/transform-json})
