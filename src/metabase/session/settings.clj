(ns metabase.session.settings
  (:require
   [metabase.api.common :as api]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.sso.core :as sso]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(defsetting enable-password-login
  (deferred-tru "Allow logging in by email and password.")
  :visibility :public
  :type       :boolean
  :default    true
  :feature    :disable-password-login
  :audit      :raw-value
  :getter     (fn []
                ;; if `:enable-password-login` has an *explicit* (non-default) value, and SSO is configured, use that;
                ;; otherwise this always returns true.
                (let [v (setting/get-value-of-type :boolean :enable-password-login)]
                  (if (and (some? v)
                           (sso/sso-enabled?))
                    v
                    true))))

(defsetting password-complexity
  "Current password complexity requirements"
  :visibility :public
  :setter     :none
  :getter     u.password/active-password-complexity)

(defsetting session-cookies
  (deferred-tru "When set, enforces the use of session cookies for all users which expire when the browser is closed.")
  :type       :boolean
  :visibility :public
  :default    nil
  :audit      :getter
  :doc "The user login session will always expire after the amount of time defined in MAX_SESSION_AGE (by default 2 weeks).
        This overrides the “Remember me” checkbox when logging in.
        Also see the Changing session expiration documentation page.")

(defsetting reset-token-ttl-hours
  (deferred-tru "Number of hours a password reset is considered valid.")
  :visibility :internal
  :type       :integer
  :default    48
  :audit      :getter)

(defsetting require-mfa
  (deferred-tru "Require all password-authenticated users to set up two-factor authentication.")
  :visibility :public
  :type       :boolean
  :default    false
  :audit      :raw-value
  :setter     (fn [new-value]
                (when new-value
                  (api/check-superuser)
                  (when-not (t2/select-one-fn :totp_enabled :model/User :id api/*current-user-id*)
                    (throw (ex-info (str (tru "You must enable two-factor authentication on your own account before requiring it for others."))
                                    {:status-code 400}))))
                (setting/set-value-of-type! :boolean :require-mfa new-value)))
