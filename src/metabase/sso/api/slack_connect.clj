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
  [_route-params
   ;; not closed: read off the raw request `:params`, declared here for documentation and typing only.
   _query-params :- [:map {:closed false}
                     [:redirect {:optional true} [:maybe :string]]]
   ;; body left undeclared rather than closed: this is a browser-redirect entry point for a Slack-driven
   ;; flow, so we don't assert on anything Slack or the browser might attach.
   _body request]
  (try
    (slack-connect-integration/sso-initiate request)
    (catch Throwable e
      (log/errorf "Error initiating Slack Connect SSO: %s" (ex-message e))
      (throw e))))

;; GET /auth/sso/slack-connect/callback
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/callback"
  "Slack Connect OIDC callback."
  [_route-params
   ;; not closed: Slack controls this query string and may add params beyond these (e.g. `error`).
   ;; Read off the raw request `:params`.
   _query-params :- [:map {:closed false}
                     [:code  {:optional true} [:maybe :string]]
                     [:state {:optional true} [:maybe :string]]]
   ;; body left undeclared rather than closed: Slack drives this callback, so we don't assert on it.
   _body request]
  (try
    (slack-connect-integration/sso-callback request)
    (catch Throwable e
      (log/errorf "Error handling Slack Connect callback: %s" (ex-message e))
      (throw e))))

(def ^{:arglists '([request respond raise])} routes
  "`/auth/sso/slack-connect` routes."
  (api.macros/ns-handler *ns*))
