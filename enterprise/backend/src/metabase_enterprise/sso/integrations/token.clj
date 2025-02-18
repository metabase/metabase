(ns metabase-enterprise.sso.api.interface
  (:require
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [ring.util.response :as response]))

(defmethod sso.i/sso-get :token [_]
  (response/response {:url (str (sso-settings/jwt-identity-provider-uri) "?" "token=true")}))
