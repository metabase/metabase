(ns metabase.sso.ldap.settings
  "The `ldap-enabled` setting, which refuses to turn LDAP on until the configured server actually answers.

  It lives here rather than alongside the other SSO settings because that check runs
  [[metabase.sso.ldap/test-current-ldap-details]], while [[metabase.sso.ldap]] reads the LDAP connection settings
  from [[metabase.sso.settings]] -- defining it there would make those two namespaces require each other.

  Nothing refers to this namespace by name; the setting reaches the settings API only because
  [[metabase.sso.init]] loads it."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.sso.ldap :as ldap]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(defsetting ldap-enabled
  (deferred-tru "Is LDAP currently enabled?")
  :type       :boolean
  :visibility :public
  :setter     (fn [new-value]
                (let [new-value (boolean new-value)]
                  (when new-value
                    ;; Test the LDAP settings before enabling
                    (let [result (ldap/test-current-ldap-details)]
                      (when-not (= :SUCCESS (:status result))
                        (throw (ex-info (tru "Unable to connect to LDAP server with current settings")
                                        (ldap/humanize-error-messages result))))))
                  (setting/set-value-of-type! :boolean :ldap-enabled new-value)))
  :default    false
  :audit      :getter)
