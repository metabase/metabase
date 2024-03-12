(ns metabase-enterprise.sso.api.interface
  (:require
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [metabase.util.i18n :refer [tru]]))

(defn- select-sso-backend
  [req]
  (if (contains? (:params req) :jwt)
    :jwt
    :saml))

(defn- sso-backend
  "Function that powers the defmulti in figuring out which SSO backend to use. It might be that we need to have more
  complex logic around this, but now it's just a simple priority. If SAML is configured use that otherwise JWT"
  [req]
  (cond
    (and (sso-settings/saml-enabled) (sso-settings/jwt-enabled)) (select-sso-backend req)
    (sso-settings/saml-enabled) :saml
    (sso-settings/jwt-enabled)  :jwt
    :else                       nil))

(defmulti sso-get
  "Multi-method for supporting the first part of an SSO signin request. An implementation of this method will usually
  result in a redirect to an SSO backend"
  sso-backend)

(defmulti sso-post
  "Multi-method for supporting a POST-back from an SSO signin request. An implementation of this method will need to
  validate the POST from the SSO backend and successfully log the user into Metabase."
  sso-backend)

(defmulti sso-handle-slo
  "Multi-method for handling a SLO request from an SSO backend. An implementation of this method will need to validate
  the SLO request and log the user out of Metabase."
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

(defmethod sso-handle-slo :default
  [_]
  (throw-not-configured-error))
