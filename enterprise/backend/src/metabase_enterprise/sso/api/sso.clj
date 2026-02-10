(ns metabase-enterprise.sso.api.sso
  "`/auth/sso` Routes.

  Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so
  we can have a uniform interface both via the API and code"
  (:require
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.jwt :as jwt]
   [metabase-enterprise.sso.integrations.oidc-from-settings :as oidc-integration]
   [metabase-enterprise.sso.integrations.saml]
   [metabase-enterprise.sso.integrations.slack-connect]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [saml20-clj.core :as saml]
   [stencil.core :as stencil]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; load the SSO integrations so their implementations for the multimethods below are available.
;; `jwt` is actually used here, but keeping it below to document the requirement in case it's removed someday
(comment jwt/keep-me
         metabase-enterprise.sso.integrations.saml/keep-me)

;; GET /auth/sso
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "SSO entry-point for an SSO user that has not logged in yet"
  [_route-params _query-params _body request]
  (try
    (sso.i/sso-get request)
    (catch Throwable e
      (log/error #_e "Error returning SSO entry point")
      (throw e))))

(mu/defn- sso-error-page
  [^Throwable e log-direction :- [:enum :in :out]]
  {:status  (get (ex-data e) :status-code 500)
   :headers {"Content-Type" "text/html"}
   :body    (stencil/render-file "metabase_enterprise/sandbox/api/error_page"
                                 (let [message    (.getMessage e)
                                       data       (u/pprint-to-str (ex-data e))]
                                   {:logDirection   (name log-direction)
                                    :errorMessage   message
                                    :exceptionClass (.getName Exception)
                                    :additionalData data}))})

;; POST /auth/sso
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Route the SSO backends call with successful login details"
  [_route-params _query-params _body request]
  (try
    (sso.i/sso-post request)
    (catch Throwable e
      (log/error e "Error logging in")
      (sso-error-page e :in))))

;; ------------------------------ Single Logout aka SLO ------------------------------

(def metabase-slo-redirect-url
  "The url that the IdP should respond to. Not all IdPs support this, but it's a good idea to send it just in case."
  "/auth/sso/handle_slo")

;; POST /auth/sso/logout
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/logout"
  "Logout."
  [_route-params _query-params _body {cookies :cookies, :as _request}]
  (let [metabase-session-key (get-in cookies [request/metabase-session-cookie :value])
        metabase-session-key-hashed (session/hash-session-key metabase-session-key)
        {:keys [email sso_source]}
        (t2/query-one {:select [:u.email :u.sso_source]
                       :from   [[:core_user :u]]
                       :join   [[:core_session :session] [:= :u.id :session.user_id]]
                       :where  [:or [:= :key_hashed metabase-session-key-hashed] [:= :session.id metabase-session-key]]})]
    ;; If a user doesn't have SLO setup on their IdP,
    ;; they will never hit "/handle_slo" so we must delete the session here:
    ;; NOTE: Only safe to compare the plaintext session-key to core_session.id because of the call to `validate-session-key` above
    (when-not (sso-settings/saml-slo-enabled)
      (t2/delete! :model/Session {:where [:or [:= :key_hashed metabase-session-key-hashed] [:= :id metabase-session-key]]}))
    {:saml-logout-url
     (when (and (sso-settings/saml-slo-enabled)
                (= sso_source "saml"))
       (saml/logout-redirect-location
        :credential (metabase-enterprise.sso.integrations.saml/sp-cert-keystore-details)
        :idp-url (sso-settings/saml-identity-provider-slo-uri)
        :issuer (sso-settings/saml-application-name)
        :user-email email
        :relay-state (u/encode-base64
                      (str (system/site-url) metabase-slo-redirect-url))))}))

;; POST /auth/sso/to_session
;;
;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/to_session"
  "If a user wants to simply convert a JWT to a session token (which they'll manage)
  this provides a path for them to do so."
  [_route-params
   _query-params
   {:keys [jwt]} :- [:map [:jwt ms/NonBlankString]]
   request]
  (when-not (sso-settings/jwt-enabled)
    (throw (ex-info "JWT authentication is not enabled"
                    {:status-code 400})))
  {:session_token (jwt/jwt->session jwt request)})

;; POST /auth/sso/handle_slo
;;
;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/handle_slo"
  "Handles client confirmation of saml logout via slo"
  [_route-params _query-params _body request]
  (try
    (if (sso-settings/saml-slo-enabled)
      (sso.i/sso-handle-slo request)
      (throw (ex-info "SAML Single Logout is not enabled, request forbidden."
                      {:status-code 403})))
    (catch Throwable e
      (log/error e "Error handling SLO")
      (sso-error-page e :out))))

;; ------------------------------ Per-provider OIDC endpoints ------------------------------

;; Slug schema that excludes `/` so /:slug does not greedily match /:slug/callback
(def ^:private ProviderSlug
  [:string {:api/regex #"[a-z0-9][a-z0-9-]*"}])

;; GET /auth/sso/:slug
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:slug"
  "Initiate OIDC SSO for a specific provider."
  [{:keys [slug]} :- [:map [:slug ProviderSlug]]
   _query-params _body request]
  (try
    (oidc-integration/sso-initiate slug request)
    (catch Throwable e
      (log/error e "Error initiating OIDC SSO")
      (throw e))))

;; GET /auth/sso/:slug/callback
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:slug/callback"
  "OIDC callback for a specific provider."
  [{:keys [slug]} :- [:map [:slug ProviderSlug]]
   _query-params _body request]
  (try
    (oidc-integration/sso-callback slug request)
    (catch Throwable e
      (log/error e "Error handling OIDC callback")
      (throw e))))
