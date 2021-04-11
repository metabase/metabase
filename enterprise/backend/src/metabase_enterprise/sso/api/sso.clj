(ns metabase-enterprise.sso.api.sso
  "`/auth/sso` Routes.

  Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so
  we can have a uniform interface both via the API and code"
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET POST]]
            [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
            [metabase.api.common :as api]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings.metastore :as metastore]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [stencil.core :as stencil]))

(defn- sso-backend
  "Function that powers the defmulti in figuring out which SSO backend to use. It might be that we need to have more
  complex logic around this, but now it's just a simple priority. If SAML is configured use that otherwise JWT"
  [_]
  ;; load the SSO integrations so their implementations for the multimethods below are available. Can't load in
  ;; `:require` because it would cause a circular ref / those namespaces aren't used here at any rate
  ;; (`cljr-clean-namespace` would remove them)
  (classloader/require '[metabase-enterprise.sso.integrations jwt saml])
  (cond
    (sso-settings/saml-configured?) :saml
    (sso-settings/jwt-enabled)      :jwt
    :else                           nil))

(defmulti sso-get
  "Multi-method for supporting the first part of an SSO signin request. An implementation of this method will usually
  result in a redirect to an SSO backend"
  sso-backend)

(defmulti sso-post
  "Multi-method for supporting a POST-back from an SSO signin request. An implementation of this method will need to
  validate the POST from the SSO backend and successfully log the user into Metabase."
  sso-backend)

(defn- throw-not-configured-error []
  (throw (ex-info (str (tru "SSO has not been enabled and/or configured"))
           {:status-code 400})))

(defmethod sso-get :default
  [_]
  (throw-not-configured-error))

(defmethod sso-post :default
  [_]
  (throw-not-configured-error))

(defn- throw-if-no-metastore-token []
  (when-not (metastore/enable-sso?)
    (throw (ex-info (str (tru "SSO requires a valid token"))
             {:status-code 403}))))

(api/defendpoint GET "/"
  "SSO entry-point for an SSO user that has not logged in yet"
  {:as req}
  (throw-if-no-metastore-token)
  (try
    (sso-get req)
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

(api/defendpoint POST "/"
  "Route the SSO backends call with successful login details"
  {:as req}
  (throw-if-no-metastore-token)
  (try
    (sso-post req)
    (catch Throwable e
      (log/error e (trs "Error logging in"))
      (sso-error-page e))))

(api/define-routes)
