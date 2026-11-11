(ns metabase.oauth-server.models.oauth-refresh-token
  (:require
   [metabase.models.interface :as mi]
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/OAuthRefreshToken [_model] :oauth_refresh_token)

(doto :model/OAuthRefreshToken
  (derive :metabase/model))

(t2/deftransforms :model/OAuthRefreshToken
  {:scope    mi/transform-json
   :resource mi/transform-json})
