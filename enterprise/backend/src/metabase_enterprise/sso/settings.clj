(ns metabase-enterprise.sso.settings
  "Namespace for defining settings used by the SSO backends. This is separate as both the functions needed to support
  the SSO backends and the generic routing code used to determine which SSO backend to use need this
  information. Separating out this information creates a better dependency graph and avoids circular dependencies."
  (:require
   [buddy.core.codecs :as codecs]
   [metabase-enterprise.scim.core :as scim]
   [metabase.appearance.core :as appearance]
   [metabase.settings.core :as setting :refer [define-multi-setting-impl defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [saml20-clj.core :as saml]))

(set! *warn-on-reflection* true)

(def ^:private GroupMappings
  [:maybe [:map-of ms/KeywordOrString [:sequential ms/PositiveInt]]])

(def ^:private ^{:arglists '([group-mappings])} validate-group-mappings
  (mr/validator GroupMappings))

(defsetting saml-user-provisioning-enabled?
  (deferred-tru "When we enable SAML user provisioning, we automatically create a Metabase account on SAML signin for users who
don''t have one.")
  :type    :boolean
  :default true
  :feature :sso-saml
  :getter  (fn []
             (if (scim/scim-enabled)
               ;; Disable SAML provisioning automatically when SCIM is enabled
               false
               (setting/get-value-of-type :boolean :saml-user-provisioning-enabled?)))
  :audit   :getter)

(defsetting jwt-user-provisioning-enabled?
  (deferred-tru "When a user logs in via JWT, create a Metabase account for them automatically if they don''t have one.")
  :type    :boolean
  :default true
  :feature :sso-jwt
  :audit   :getter)

(defsetting ldap-user-provisioning-enabled?
  (deferred-tru "When we enable LDAP user provisioning, we automatically create a Metabase account on LDAP signin for users who
don''t have one.")
  :type    :boolean
  :default true
  :audit   :getter)

(defsetting saml-identity-provider-uri
  (deferred-tru "This is the URL where your users go to log in to your identity provider. Depending on which IdP you''re
using, this usually looks like `https://your-org-name.example.com` or `https://example.com/app/my_saml_app/abc123/sso/saml`")
  :encryption :when-encryption-key-set
  :feature    :sso-saml
  :audit      :getter)

(mu/defn- validate-saml-idp-cert
  "Validate that an encoded identity provider certificate is valid, or throw an Exception."
  [idp-cert-str :- :string]
  (try
    (instance? java.security.cert.X509Certificate (saml/->X509Certificate idp-cert-str))
    (catch Throwable e
      (log/error e "Error parsing SAML identity provider certificate")
      (throw
       (Exception. (tru "Invalid identity provider certificate. Certificate should be a base-64 encoded string."))))))

(defsetting saml-identity-provider-certificate
  (deferred-tru "Encoded certificate for the identity provider. Depending on your IdP, you might need to download this,
open it in a text editor, then copy and paste the certificate''s contents here.")
  :feature    :sso-saml
  :audit      :no-value
  :encryption :no
  :setter     (fn [new-value]
                ;; when setting the idp cert validate that it's something we
                (when new-value
                  (validate-saml-idp-cert new-value))
                (setting/set-value-of-type! :string :saml-identity-provider-certificate new-value)))

(defsetting saml-identity-provider-issuer
  (deferred-tru "This is a unique identifier for the IdP. Often referred to as Entity ID or simply ''Issuer''. Depending
on your IdP, this usually looks something like `http://www.example.com/141xkex604w0Q5PN724v`")
  :encryption :when-encryption-key-set
  :feature    :sso-saml
  :audit      :getter)

(defsetting saml-application-name
  (deferred-tru "This application name will be used for requests to the Identity Provider")
  :default    "Metabase"
  :feature    :sso-saml
  :audit      :getter
  :encryption :when-encryption-key-set)

(defsetting saml-keystore-path
  (deferred-tru "Absolute path to the Keystore file to use for signing SAML requests")
  :encryption :when-encryption-key-set
  :feature    :sso-saml
  :audit      :getter)

(defsetting saml-keystore-password
  (deferred-tru "Password for opening the keystore")
  :encryption :when-encryption-key-set
  :default    "changeit"
  :sensitive? true
  :feature    :sso-saml
  :audit      :getter)

(defsetting saml-keystore-alias
  (deferred-tru "Alias for the key that {0} should use for signing SAML requests"
                (setting/application-name-for-setting-descriptions appearance/application-name))
  :encryption :when-encryption-key-set
  :feature    :sso-saml
  :audit      :getter)

(defsetting saml-attribute-email
  (deferred-tru "SAML attribute for the user''s email address")
  :default    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
  :feature    :sso-saml
  :encryption :when-encryption-key-set
  :audit      :getter)

(defsetting saml-attribute-tenant
  (deferred-tru "SAML attribute for the user''s tenant slug")
  :encryption :when-encryption-key-set
  :export?    false
  :feature    :sso-saml
  :audit      :getter)

(defsetting saml-attribute-firstname
  (deferred-tru "SAML attribute for the user''s first name")
  :default    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
  :encryption :when-encryption-key-set
  :feature    :sso-saml
  :audit      :getter)

(defsetting saml-attribute-lastname
  (deferred-tru "SAML attribute for the user''s last name")
  :default    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
  :encryption :when-encryption-key-set
  :feature    :sso-saml
  :audit      :getter)

(defsetting saml-group-sync
  (deferred-tru "Enable group membership synchronization with SAML.")
  :type    :boolean
  :default false
  :feature :sso-saml
  :audit   :getter)

(defsetting saml-attribute-group
  (deferred-tru "SAML attribute for group syncing")
  :feature    :sso-saml
  :audit      :getter
  :encryption :when-encryption-key-set)

(defsetting saml-group-mappings
  ;; Should be in the form: {"groupName": [1, 2, 3]} where keys are SAML groups and values are lists of MB groups IDs
  (deferred-tru "JSON containing SAML to {0} group mappings."
                (setting/application-name-for-setting-descriptions appearance/application-name))
  :encryption :when-encryption-key-set
  :type       :json
  :cache?     false
  :default    {}
  :feature    :sso-saml
  :audit      :getter
  :setter     (comp (partial setting/set-value-of-type! :json :saml-group-mappings)
                    (partial mu/validate-throw validate-group-mappings)))

(defsetting saml-configured
  (deferred-tru "Are the mandatory SAML settings configured?")
  :type    :boolean
  :default false
  :feature :sso-saml
  :setter  :none
  :getter  (fn [] (boolean
                   (and (saml-identity-provider-uri)
                        (saml-identity-provider-certificate)))))

(defsetting saml-enabled
  (deferred-tru "Is SAML authentication configured and enabled?")
  :type    :boolean
  :default false
  :feature :sso-saml
  :audit   :getter
  :getter  (fn []
             (if (saml-configured)
               (setting/get-value-of-type :boolean :saml-enabled)
               false)))

(defsetting saml-slo-enabled
  (deferred-tru "Is SAML Single Log Out enabled?")
  :type    :boolean
  :default false
  :feature :sso-saml
  :audit   :getter
  :export? false
  :getter  (fn []
             (if (saml-enabled)
               (setting/get-value-of-type :boolean :saml-slo-enabled)
               false)))

(defsetting saml-identity-provider-slo-uri
  (deferred-tru "This is the URL where your users go to logout of your identity provider. Depending on which IdP you''re
using, this usually looks like `https://your-org-name.example.com` or `https://example.com/app/my_saml_app/abc123/sso/slo`")
  :encryption :when-encryption-key-set
  :feature    :sso-saml
  :export?    false
  :audit      :getter)

(defsetting jwt-identity-provider-uri
  (deferred-tru "URL for JWT-based login page.")
  :encryption :when-encryption-key-set
  :feature    :sso-jwt
  :audit      :getter)

(defsetting jwt-shared-secret
  (deferred-tru (str "String used to seed the private key used to validate JWT messages."
                     " "
                     "A hexadecimal-encoded 256-bit key (i.e., a 64-character string) is strongly recommended."))
  :encryption :when-encryption-key-set
  :type       :string
  :feature    :sso-jwt
  :audit      :no-value)

(defsetting jwt-attribute-email
  (deferred-tru "Key to retrieve the JWT user''s email address")
  :encryption :when-encryption-key-set
  :default    "email"
  :feature    :sso-jwt
  :audit      :getter)

(defsetting jwt-attribute-firstname
  (deferred-tru "Key to retrieve the JWT user''s first name")
  :encryption :when-encryption-key-set
  :default    "first_name"
  :feature    :sso-jwt
  :audit      :getter)

(defsetting jwt-attribute-lastname
  (deferred-tru "Key to retrieve the JWT user''s last name")
  :encryption :when-encryption-key-set
  :default    "last_name"
  :feature    :sso-jwt
  :audit      :getter)

(defsetting jwt-attribute-tenant
  (deferred-tru "Key to retrieve the JWT user''s tenant")
  :export?    false
  :encryption :when-encryption-key-set
  :default    "@tenant"
  :feature    :sso-jwt
  :audit      :getter)

(defsetting jwt-attribute-groups
  (deferred-tru "Key to retrieve the JWT user''s groups")
  :default    "groups"
  :feature    :sso-jwt
  :encryption :when-encryption-key-set
  :audit      :getter)

(defsetting jwt-group-sync
  (deferred-tru "Enable group membership synchronization with JWT.")
  :type    :boolean
  :default false
  :feature :sso-jwt
  :audit   :getter)

(defsetting jwt-group-mappings
  ;; Should be in the form: {"groupName": [1, 2, 3]} where keys are JWT groups and values are lists of MB groups IDs
  (deferred-tru "JSON containing JWT to {0} group mappings."
                (setting/application-name-for-setting-descriptions appearance/application-name))
  :encryption :when-encryption-key-set
  :type       :json
  :cache?     false
  :default    {}
  :feature    :sso-jwt
  :audit      :getter
  :setter     (comp (partial setting/set-value-of-type! :json :jwt-group-mappings)
                    (partial mu/validate-throw validate-group-mappings))
  :doc        "JSON object containing JWT to Metabase group mappings, where keys are JWT groups and values are lists of Metabase groups IDs.")

(defsetting jwt-configured
  (deferred-tru "Are the mandatory JWT settings configured?")
  :type    :boolean
  :default false
  :feature :sso-jwt
  :setter  :none
  :getter  (fn [] (and (boolean (jwt-shared-secret))
                       (boolean (jwt-identity-provider-uri)))))

(defsetting jwt-enabled
  (deferred-tru "Is JWT authentication configured and enabled?")
  :type    :boolean
  :default false
  :feature :sso-jwt
  :audit   :getter
  :getter  (fn []
             (if (jwt-configured)
               (setting/get-value-of-type :boolean :jwt-enabled)
               false))
  :doc "When set to true, will enable JWT authentication with the options configured in the MB_JWT_* variables.
        This is for JWT SSO authentication, and has nothing to do with Static embedding, which is MB_EMBEDDING_SECRET_KEY.")

(defsetting sdk-encryption-validation-key
  (deferred-tru "Used for encrypting and checking whether SDK requests are signed")
  :type       :string
  :init       (fn []
                (let [ba (byte-array 32)
                      _  (.nextBytes (java.security.SecureRandom.) ba)]
                  (codecs/bytes->b64-str ba)))
  :export?    false
  :sensitive? true
  :visibility :internal
  :audit      :no-value)

(define-multi-setting-impl send-new-sso-user-admin-email? :ee
  :getter (fn [] (setting/get-value-of-type :boolean :send-new-sso-user-admin-email?))
  :setter (fn [send-emails] (setting/set-value-of-type! :boolean :send-new-sso-user-admin-email? send-emails)))

(defsetting ldap-sync-user-attributes
  (deferred-tru "Should we sync user attributes when someone logs in via LDAP?")
  :type    :boolean
  :default true
  :audit   :getter)

;; TODO - maybe we want to add a csv setting type?
(defsetting ldap-sync-user-attributes-blacklist
  (deferred-tru "Comma-separated list of user attributes to skip syncing for LDAP users.")
  :encryption :no
  :default    "userPassword,dn,distinguishedName"
  :type       :csv
  :audit      :getter)

(defsetting ldap-group-membership-filter
  (deferred-tru "Group membership lookup filter. The placeholders '{dn}' and '{uid}' will be replaced by the user''s Distinguished Name and UID, respectively.")
  :encryption :no
  :default    "(member={dn})"
  :audit      :getter)

;;; ------------------------------------------------ Slack Connect ------------------------------------------------

(defsetting slack-connect-client-id
  (deferred-tru "Client ID for your Slack app. Get this from https://api.slack.com/apps")
  :encryption :when-encryption-key-set
  :export?    false
  :feature    :sso-slack
  :audit      :getter)

(defsetting slack-connect-client-secret
  (deferred-tru "Client Secret for your Slack app")
  :encryption :when-encryption-key-set
  :export?    false
  :sensitive? true
  :feature    :sso-slack
  :audit      :no-value)

(def slack-connect-auth-mode-sso
  "Authentication mode for full SSO login."
  "sso")

(def slack-connect-auth-mode-link-only
  "Authentication mode for account linking only (no session creation)."
  "link-only")

(defsetting slack-connect-authentication-mode
  (deferred-tru "Controls whether Slack can be used for SSO login or just account linking. Valid values: \"sso\" (default) or \"link-only\"")
  :type       :string
  :export?    false
  :default    slack-connect-auth-mode-sso
  :feature    :sso-slack
  :audit      :getter
  :encryption :no
  :setter     (fn [new-value]
                (when (and new-value
                           (not (contains? #{slack-connect-auth-mode-sso slack-connect-auth-mode-link-only} new-value)))
                  (throw (ex-info (tru "Invalid authentication mode. Must be \"sso\" or \"link-only\"")
                                  {:status-code 400})))
                (setting/set-value-of-type! :string :slack-connect-authentication-mode new-value)))

(defsetting slack-connect-user-provisioning-enabled
  (deferred-tru "When a user logs in via Slack Connect, create a Metabase account for them automatically if they don''t have one.")
  :type    :boolean
  :export? false
  :default true
  :feature :sso-slack
  :getter  (fn []
             (if (= (slack-connect-authentication-mode) slack-connect-auth-mode-link-only)
               false
               (setting/get-value-of-type :boolean :slack-connect-user-provisioning-enabled)))
  :audit   :getter)

(defsetting slack-connect-attribute-team-id
  (deferred-tru "Slack OIDC claim for the team/workspace ID")
  :default    "https://slack.com/team_id"
  :export?    false
  :feature    :sso-slack
  :encryption :when-encryption-key-set
  :audit      :getter)

(defsetting slack-connect-configured
  (deferred-tru "Are the mandatory Slack Connect settings configured?")
  :type    :boolean
  :export? false
  :default false
  :feature :sso-slack
  :setter  :none
  :getter  (fn [] (boolean
                   (and (slack-connect-client-id)
                        (slack-connect-client-secret)))))

(defsetting slack-connect-enabled
  (deferred-tru "Is Slack Connect authentication configured and enabled?")
  :type    :boolean
  :export? false
  :default false
  :feature :sso-slack
  :audit   :getter
  :getter  (fn []
             (if (slack-connect-configured)
               (setting/get-value-of-type :boolean :slack-connect-enabled)
               false)))

(defsetting other-sso-enabled?
  "Are we using an SSO integration other than LDAP or Google Auth? These integrations use the `/auth/sso` endpoint for
  authorization rather than the normal login form or Google Auth button."
  :visibility :public
  :setter     :none
  :getter     (fn [] (or (saml-enabled) (jwt-enabled) (slack-connect-enabled))))
