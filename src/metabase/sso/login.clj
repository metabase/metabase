(ns metabase.sso.login
  (:require
   [metabase.models.session :as session]
   [metabase.request.core :as request]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.settings :as sso.settings]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (com.unboundid.util LDAPSDKException)))

;;; TODO -- these are duplicated with the ones in [[metabase.session.api]], move them somewhere shared.

(def ^:private password-fail-message
  (i18n/deferred-tru "Password did not match stored password."))

(def ^:private password-fail-snippet
  (i18n/deferred-tru "did not match stored password"))

(def ^:private disabled-account-message
  (i18n/deferred-tru "Your account is disabled. Please contact your administrator."))

(def ^:private disabled-account-snippet
  (i18n/deferred-tru "Your account is disabled."))

(mu/defn ldap-login :- [:maybe [:map [:id uuid?]]]
  "If LDAP is enabled and a matching user exists return a new Session for them, or `nil` if they couldn't be
  authenticated."
  [username password device-info :- request/DeviceInfo]
  (when (sso.settings/ldap-enabled)
    (try
      (when-let [user-info (ldap/find-user username)]
        (when-not (ldap/verify-password user-info password)
          ;; Since LDAP knows about the user, fail here to prevent the local strategy to be tried with a possibly
          ;; outdated password
          (throw (ex-info (str password-fail-message)
                          {:status-code 401
                           :errors      {:password password-fail-snippet}})))
        ;; password is ok, return new session if user is not deactivated
        (let [user (ldap/fetch-or-create-user! user-info)]
          (if (:is_active user)
            (session/create-session! :sso user device-info)
            (throw (ex-info (str disabled-account-message)
                            {:status-code 401
                             :errors      {:_error disabled-account-snippet}})))))
      (catch LDAPSDKException e
        (log/error e "Problem connecting to LDAP server, will fall back to local authentication")))))
