(ns metabase-enterprise.sso.api.sso
  "`/auth/sso` Routes.

  Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so
  we can have a uniform interface both via the API and code"
  (:require
   [compojure.core :refer [GET POST]]
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.jwt]
   [metabase-enterprise.sso.integrations.saml]
   [metabase.api.common :as api]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [stencil.core :as stencil]))

(set! *warn-on-reflection* true)

;; load the SSO integrations so their implementations for the multimethods below are available.
(comment metabase-enterprise.sso.integrations.jwt/keep-me
         metabase-enterprise.sso.integrations.saml/keep-me)

(defn- throw-if-no-premium-features-token []
  (when-not (premium-features/enable-sso?)
    (throw (ex-info (str (tru "SSO requires a valid token"))
             {:status-code 403}))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/"
  "SSO entry-point for an SSO user that has not logged in yet"
  [:as req]
  (throw-if-no-premium-features-token)
  (try
    (sso.i/sso-get req)
    (catch Throwable e
      (log/error #_e (trs "Error returning SSO entry point"))
      (throw e))))

(defn- sso-error-page [^Throwable e]
  {:status  (get (ex-data e) :status-code 500)
   :headers {"Content-Type" "text/html"}
   :body    (stencil/render-file "metabase_enterprise/sandbox/api/error_page"
              (let [message    (.getMessage e)
                    data       (u/pprint-to-str (ex-data e))]
                {:errorMessage   message
                 :exceptionClass (.getName Exception)
                 :additionalData data}))})

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/"
  "Route the SSO backends call with successful login details"
  [:as req]
  (throw-if-no-premium-features-token)
  (try
    (sso.i/sso-post req)
    (catch Throwable e
      (log/error e (trs "Error logging in"))
      (sso-error-page e))))

(api/define-routes)
