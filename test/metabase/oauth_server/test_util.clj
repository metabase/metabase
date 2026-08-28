(ns metabase.oauth-server.test-util
  "Helpers for tests that exercise the OAuth server."
  (:require
   [metabase.test :as mt]))

(defmacro with-oauth-client
  "Execute `body` with a freshly registered `oauth_client` row, binding `client-id-binding` to its
   `client_id`. Tokens must reference a live client — token resolution fails closed when the issuing
   client is gone (SEC-863) — so save test tokens against this client id. The row is deleted when
   `body` exits."
  [[client-id-binding] & body]
  `(mt/with-temp [:model/OAuthClient {~client-id-binding :client_id}
                  {:client_id         (str (random-uuid))
                   :redirect_uris     ["https://example.com/callback"]
                   :grant_types       ["authorization_code"]
                   :response_types    ["code"]
                   :scopes            ["openid"]
                   :registration_type "static"}]
     ~@body))
