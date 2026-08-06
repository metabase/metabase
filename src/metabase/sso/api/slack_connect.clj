(ns metabase.sso.api.slack-connect
  "API routes for Slack Connect SSO authentication."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.sso.integrations.slack-connect :as slack-connect-integration]
   [metabase.util.log :as log]))

;; GET /auth/sso/slack-connect
;;
;; No param schemas: this is a browser-navigation OIDC endpoint — the handler reads `:params` off
;; the raw request rather than the destructured route/query/body params.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Initiate Slack Connect SSO flow."
  [_route-params _query-params _body request]
  (try
    (slack-connect-integration/sso-initiate request)
    (catch Throwable e
      (log/errorf "Error initiating Slack Connect SSO: %s" (ex-message e))
      (throw e))))

;; GET /auth/sso/slack-connect/callback
;;
;; No param schemas: Slack controls the callback query string (it may add params beyond
;; `code`/`state`, e.g. `error`), and the handler reads `:params` off the raw request.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/callback"
  "Slack Connect OIDC callback."
  [_route-params _query-params _body request]
  (try
    (slack-connect-integration/sso-callback request)
    (catch Throwable e
      (log/errorf "Error handling Slack Connect callback: %s" (ex-message e))
      (throw e))))

(def ^{:arglists '([request respond raise])} routes
  "`/auth/sso/slack-connect` routes."
  (api.macros/ns-handler *ns*))
