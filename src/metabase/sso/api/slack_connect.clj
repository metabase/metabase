(ns metabase.sso.api.slack-connect
  "API routes for Slack Connect SSO authentication."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.sso.integrations.slack-connect :as slack-connect-integration]
   [metabase.util.log :as log]))

;; GET /auth/sso/slack-connect
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Initiate Slack Connect SSO flow."
  [_route-params _query-params _body request]
  (try
    (slack-connect-integration/sso-initiate request)
    (catch Throwable e
      (log/error e "Error initiating Slack Connect SSO")
      (throw e))))

;; GET /auth/sso/slack-connect/callback
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/callback"
  "Slack Connect OIDC callback."
  [_route-params _query-params _body request]
  (try
    (slack-connect-integration/sso-callback request)
    (catch Throwable e
      (log/error e "Error handling Slack Connect callback")
      (throw e))))

(def ^{:arglists '([request respond raise])} routes
  "`/auth/sso/slack-connect` routes."
  (api.macros/ns-handler *ns*))
