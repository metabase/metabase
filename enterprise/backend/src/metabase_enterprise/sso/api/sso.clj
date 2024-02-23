(ns metabase-enterprise.sso.api.sso
  "`/auth/sso` Routes.

  Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so
  we can have a uniform interface both via the API and code"
  (:require
   [compojure.core :refer [GET POST]]
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.jwt]
   [metabase-enterprise.sso.integrations.saml]
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.urls :as urls]
   [saml20-clj.core :as saml]
   [saml20-clj.encode-decode :as encode-decode]
   [stencil.core :as stencil]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; load the SSO integrations so their implementations for the multimethods below are available.
(comment metabase-enterprise.sso.integrations.jwt/keep-me
         metabase-enterprise.sso.integrations.saml/keep-me)

;; GET /auth/sso
(api/defendpoint GET "/"
  "SSO entry-point for an SSO user that has not logged in yet"
  [:as req]
  (try
    (sso.i/sso-get req)
    (catch Throwable e
      (log/error #_e (trs "Error returning SSO entry point"))
      (throw e))))

(mu/defn ^:private sso-error-page
  [^Throwable e log-direction :- [:enum "in" "out"]]
  {:status  (get (ex-data e) :status-code 500)
   :headers {"Content-Type" "text/html"}
   :body    (stencil/render-file "metabase_enterprise/sandbox/api/error_page"
                                 (let [message    (.getMessage e)
                                       data       (u/pprint-to-str (ex-data e))]
                                   {:logDirection   log-direction
                                    :errorMessage   message
                                    :exceptionClass (.getName Exception)
                                    :additionalData data}))})

;; POST /auth/sso
(api/defendpoint POST "/"
  "Route the SSO backends call with successful login details"
  [:as req]
  (try
    (sso.i/sso-post req)
    (catch Throwable e
      (log/error e (trs "Error logging in"))
      (sso-error-page e "in"))))


;; ------------------------------ Single Logout aka SLO ------------------------------

(def metabase-slo-redirect-url
  "The url that the IdP should respond to. Not all IdPs support this, but it's a good idea to send it just in case."
  "/auth/sso/handle_slo")

;; POST /auth/sso/logout
(api/defendpoint POST "/logout"
  "Logout."
  [:as {:keys [metabase-session-id]}]
  (api/check-exists? :model/Session metabase-session-id)
  (let [{:keys [email sso_source]}
        (t2/query-one {:select [:u.email :u.sso_source]
                       :from   [[:core_user :u]]
                       :join   [[:core_session :session] [:= :u.id :session.user_id]]
                       :where  [:= :session.id metabase-session-id]})]
    {:saml-logout-url
     (when (and (sso-settings/saml-enabled)
                (= sso_source "saml"))
       (saml/logout-redirect-location
        :idp-url (sso-settings/saml-identity-provider-uri)
        :issuer (sso-settings/saml-application-name)
        :user-email email
        :relay-state (encode-decode/str->base64
                      (str (urls/site-url) metabase-slo-redirect-url))))}))

;; POST /auth/sso/handle_slo
(api/defendpoint POST "/handle_slo"
  "Handles client confirmation of saml logout via slo"
  [:as req]
  (try
    (sso.i/sso-handle-slo req)
    (catch Throwable e
      (log/error e (trs "Error handling SLO"))
      (sso-error-page e "out"))))

(api/define-routes)
