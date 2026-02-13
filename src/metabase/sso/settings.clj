(ns metabase.sso.settings
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting define-multi-setting define-multi-setting-impl]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.json :as json])
  (:import
   (com.unboundid.ldap.sdk DN)))

(set! *warn-on-reflection* true)

(defsetting ldap-host
  (deferred-tru "Server hostname.")
  :encryption :when-encryption-key-set
  :audit :getter)

(defsetting ldap-port
  (deferred-tru "Server port, usually 389 or 636 if SSL is used.")
  :encryption :when-encryption-key-set
  :type       :integer
  :default    389
  :audit      :getter)

(defsetting ldap-security
  (deferred-tru "Use SSL, TLS or plain text.")
  :type    :keyword
  :default :none
  :audit   :raw-value
  :setter  (fn [new-value]
             (when (some? new-value)
               (assert (#{:none :ssl :starttls} (keyword new-value))))
             (setting/set-value-of-type! :keyword :ldap-security new-value)))

(defsetting ldap-bind-dn
  (deferred-tru "The Distinguished Name to bind as (if any), this user will be used to lookup information about other users.")
  :encryption :when-encryption-key-set
  :audit :getter)

(defsetting ldap-password
  (deferred-tru "The password to bind with for the lookup user.")
  :encryption :when-encryption-key-set
  :sensitive? true
  :audit     :getter)

(defsetting ldap-user-base
  (deferred-tru "Search base for users. (Will be searched recursively)")
  :encryption :no
  :audit      :getter)

(defsetting ldap-user-filter
  (deferred-tru "User lookup filter. The placeholder '''{login}''' will be replaced by the user supplied login.")
  :default    "(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))"
  :encryption :no
  :audit      :getter)

(defsetting ldap-attribute-email
  (deferred-tru "Attribute to use for the user''s email. (usually ''mail'', ''email'' or ''userPrincipalName'')")
  :default    "mail"
  :encryption :no
  :getter     (fn [] (u/lower-case-en (setting/get-value-of-type :string :ldap-attribute-email)))
  :audit      :getter)

(defsetting ldap-attribute-firstname
  (deferred-tru "Attribute to use for the user''s first name. (usually ''givenName'')")
  :default    "givenName"
  :getter     (fn [] (u/lower-case-en (setting/get-value-of-type :string :ldap-attribute-firstname)))
  :encryption :no
  :audit      :getter)

(defsetting ldap-attribute-lastname
  (deferred-tru "Attribute to use for the user''s last name. (usually ''sn'')")
  :encryption :no
  :default    "sn"
  :getter     (fn [] (u/lower-case-en (setting/get-value-of-type :string :ldap-attribute-lastname)))
  :audit      :getter)

(defsetting ldap-group-sync
  (deferred-tru "Enable group membership synchronization with LDAP.")
  :type    :boolean
  :default false
  :audit   :getter)

(defsetting ldap-group-base
  (deferred-tru "Search base for groups. Not required for LDAP directories that provide a ''memberOf'' overlay, such as Active Directory. (Will be searched recursively)")
  :audit      :getter
  :encryption :no)

(defsetting ldap-group-mappings
  ;; Should be in the form: {"cn=Some Group,dc=...": [1, 2, 3]} where keys are LDAP group DNs and values are lists of
  ;; MB groups IDs
  (deferred-tru "JSON containing LDAP to Metabase group mappings.")
  :encryption :no
  :type       :json
  :cache?     false
  :default    {}
  :audit      :getter
  :getter     (fn []
                (json/decode (setting/get-value-of-type :string :ldap-group-mappings) #(DN. (str %))))
  :setter     (fn [new-value]
                (cond
                  (string? new-value)
                  (recur (json/decode new-value))

                  (map? new-value)
                  (do
                    (doseq [k (keys new-value)]
                      (when-not (instance? DN k) ; handle DN-encoded keys like we get from the `:getter`
                        (when-not (DN/isValidDN (u/qualified-name k))
                          (throw (IllegalArgumentException. (tru "{0} is not a valid DN." (u/qualified-name k)))))))
                    (setting/set-value-of-type! :json :ldap-group-mappings new-value)))))

(defsetting ldap-configured?
  (deferred-tru "Have the mandatory LDAP settings (host and user search base) been validated and saved?")
  :type       :boolean
  :visibility :public
  :setter     :none
  :getter     (fn [] (boolean (and (ldap-host)
                                   (ldap-user-base))))
  :doc        false)

(defsetting ldap-enabled
  (deferred-tru "Is LDAP currently enabled?")
  :type       :boolean
  :visibility :public
  :setter     (fn [new-value]
                (let [new-value (boolean new-value)]
                  (when new-value
                    ;; Test the LDAP settings before enabling
                    (let [result ((requiring-resolve 'metabase.sso.ldap/test-current-ldap-details))]
                      (when-not (= :SUCCESS (:status result))
                        (throw (ex-info (tru "Unable to connect to LDAP server with current settings")
                                        ((requiring-resolve 'metabase.sso.ldap/humanize-error-messages) result))))))
                  (setting/set-value-of-type! :boolean :ldap-enabled new-value)))
  :default    false
  :audit      :getter)

(defsetting ldap-timeout-seconds
  (deferred-tru "Maximum time, in seconds, to wait for LDAP server before falling back to local authentication")
  :type :double
  :encryption :no
  :export? false
  :default 15.0)

;;;
;;; Google Auth
;;;

(defsetting google-auth-client-id
  (deferred-tru "Client ID for Google Sign-In.")
  :encryption :when-encryption-key-set
  :visibility :public
  :audit      :getter
  :setter     (fn [client-id]
                (if (seq client-id)
                  (let [trimmed-client-id (str/trim client-id)]
                    (when-not (str/ends-with? trimmed-client-id ".apps.googleusercontent.com")
                      (throw (ex-info (tru "Invalid Google Sign-In Client ID: must end with \".apps.googleusercontent.com\"")
                                      {:status-code 400})))
                    (setting/set-value-of-type! :string :google-auth-client-id trimmed-client-id))
                  (do
                    (setting/set-value-of-type! :string :google-auth-client-id nil)
                    (setting/set-value-of-type! :boolean :google-auth-enabled false)))))

(defsetting google-auth-configured
  (deferred-tru "Is Google Sign-In configured?")
  :type   :boolean
  :setter :none
  :getter (fn [] (boolean (google-auth-client-id))))

(defsetting google-auth-enabled
  (deferred-tru "Is Google Sign-in currently enabled?")
  :visibility :public
  :type       :boolean
  :audit      :getter
  :getter     (fn []
                (if-some [value (setting/get-value-of-type :boolean :google-auth-enabled)]
                  value
                  (boolean (google-auth-client-id))))
  :setter     (fn [new-value]
                (if-let [new-value (boolean new-value)]
                  (if-not (google-auth-client-id)
                    (throw (ex-info (tru "Google Sign-In is not configured. Please set the Client ID first.")
                                    {:status-code 400}))
                    (setting/set-value-of-type! :boolean :google-auth-enabled new-value))
                  (setting/set-value-of-type! :boolean :google-auth-enabled new-value))))

(defsetting oidc-allowed-networks
  (deferred-tru "What networks are OIDC requests allowed to? Possible values: 'allow-all' (default), 'allow-private', or 'external-only'.")
  :type :keyword
  :default :allow-all
  :export? false
  :setter (fn [new-value]
            (when (some? new-value)
              (assert (#{:allow-all :allow-private :external-only} (keyword new-value))))
            (setting/set-value-of-type! :keyword :oidc-allowed-networks new-value)))

(defn- ee-sso-configured? []
  (when config/ee-available?
    (setting/get :other-sso-enabled?)))

(defn sso-enabled?
  "Any SSO provider is configured and enabled"
  []
  (or (google-auth-enabled)
      (ldap-enabled)
      (ee-sso-configured?)))

(define-multi-setting google-auth-auto-create-accounts-domain
  (deferred-tru "When set, allow users to sign up on their own if their Google account email address is from this domain.")
  (fn [] (if (premium-features/enable-sso-google?) :ee :oss))
  :encryption :when-encryption-key-set)

(define-multi-setting-impl google-auth-auto-create-accounts-domain :oss
  :getter (fn [] (setting/get-value-of-type :string :google-auth-auto-create-accounts-domain))
  :setter (fn [domain]
            (when (and domain (str/includes? domain ","))
                ;; Multiple comma-separated domains requires the `:sso-google` premium feature flag
              (throw (ex-info (tru "Invalid domain") {:status-code 400})))
            (setting/set-value-of-type! :string :google-auth-auto-create-accounts-domain domain)))

;;;
;;; Common
;;;

(define-multi-setting send-new-sso-user-admin-email?
  (deferred-tru "Should new email notifications be sent to admins, for all new SSO users?")
  (fn [] (if (premium-features/enable-any-sso?)
           :ee
           :oss))
  :type :boolean)

(define-multi-setting-impl send-new-sso-user-admin-email? :oss
  :getter (constantly true)
  :setter :none)
