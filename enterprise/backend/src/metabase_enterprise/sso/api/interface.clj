(ns metabase-enterprise.sso.api.interface
  (:require [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
            [metabase.util.i18n :refer [tru]]))

(defn- sso-backend
  "Function that powers the defmulti in figuring out which SSO backend to use. It might be that we need to have more
  complex logic around this, but now it's just a simple priority. If SAML is configured use that otherwise JWT"
  [_]
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
