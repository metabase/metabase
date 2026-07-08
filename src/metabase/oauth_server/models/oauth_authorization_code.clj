(ns metabase.oauth-server.models.oauth-authorization-code
  (:require
   [metabase.models.interface :as mi]
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
