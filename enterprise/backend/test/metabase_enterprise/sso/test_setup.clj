(ns metabase-enterprise.sso.test-setup
  "Shared test helpers for enterprise SSO tests (SAML, JWT, OIDC).

   For Slack Connect and generic SSO helpers, see [[metabase.sso.test-helpers]]."
  (:require
   [metabase.premium-features.token-check :as token-check]
   [metabase.sso.test-helpers :as sso.test-helpers]
   [metabase.test :as mt]
   [metabase.util.random :as u.random]))

(set! *warn-on-reflection* true)

(def successful-login?
  "Return true if the response indicates a successful user login."
  sso.test-helpers/successful-login?)

(def call-with-login-attributes-cleared!
  "Execute thunk and ensure login_attributes are cleared afterward."
  sso.test-helpers/call-with-login-attributes-cleared!)

(defn do-with-other-sso-types-disabled!
  "Execute `thunk` with LDAP, SAML, JWT, and Slack Connect SSO types disabled.
   Useful when testing a specific SSO provider in isolation.

   This EE version disables all SSO types including EE-only SAML and JWT."
  [thunk]
  (mt/with-temporary-setting-values
    [ldap-enabled          false
     saml-enabled          false
     jwt-enabled           false
     slack-connect-enabled false]
    (thunk)))

;;; -------------------------------------------------- SAML Setup --------------------------------------------------

(def ^:private default-saml-idp-uri "http://test.idp.metabase.com")
(def ^:private default-saml-idp-cert (delay (slurp "test_resources/sso/auth0-public-idp.cert")))

(defn call-with-default-saml-config!
  "Execute `f` with default SAML configuration set up."
  [f]
  (let [current-features (token-check/*token-features*)]
    (mt/with-premium-features #{:sso-saml}
      (mt/with-temporary-setting-values [saml-enabled                       true
                                         saml-identity-provider-uri         default-saml-idp-uri
                                         saml-identity-provider-certificate @default-saml-idp-cert
                                         saml-keystore-path                 nil
                                         saml-keystore-password             nil
                                         saml-keystore-alias                nil
                                         site-url                           "http://localhost:3000"]
        (mt/with-premium-features current-features
          (f))))))

(defmacro with-saml-default-setup!
  "Set up default SAML configuration for tests.
   Includes premium features, login attributes cleanup, and default SAML config."
  [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-additional-premium-features #{:sso-saml}
       (call-with-login-attributes-cleared!
        (fn []
          (call-with-default-saml-config!
           (fn []
             ~@body)))))))

;;; -------------------------------------------------- JWT Setup --------------------------------------------------

(def default-jwt-idp-uri
  "Default JWT IDP URI for tests."
  "http://test.idp.metabase.com")

(def default-jwt-secret
  "Default JWT secret for tests. Note: this is regenerated on each test run."
  (u.random/secure-hex 32))

(defn call-with-default-jwt-config!
  "Execute `f` with default JWT configuration set up."
  [f]
  (let [current-features (token-check/*token-features*)]
    (mt/with-additional-premium-features #{:sso-jwt}
      (mt/with-temporary-setting-values
        [jwt-enabled               true
         jwt-identity-provider-uri default-jwt-idp-uri
         jwt-shared-secret         default-jwt-secret
         site-url                  (sso.test-helpers/localhost-site-url)]
        (mt/with-premium-features current-features
          (f))))))

(defmacro with-jwt-default-setup!
  "Set up default JWT configuration for tests.
   Includes premium features, model cleanup, other SSO types disabled, login attributes cleanup, and default JWT config."
  [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-model-cleanup [:model/User :model/Collection :model/Tenant]
       (mt/with-premium-features #{:audit-app}
         (do-with-other-sso-types-disabled!
          (fn []
            (mt/with-additional-premium-features #{:sso-jwt}
              (call-with-login-attributes-cleared!
               (fn []
                 (call-with-default-jwt-config!
                  (fn []
                    ~@body)))))))))))

;;; -------------------------------------------------- OIDC (Generic) Setup --------------------------------------------------

(def ^:private default-oidc-provider
  {:key            "test-idp"
   :login-prompt   "Test IdP"
   :issuer-uri     "https://test.idp.example.com"
   :client-id      "test-client-id"
   :client-secret  "test-client-secret"
   :scopes         ["openid" "email" "profile"]
   :enabled        true})

(defn call-with-default-oidc-config!
  "Execute `f` with default OIDC configuration set up."
  [f]
  (let [current-features (token-check/*token-features*)]
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values
        [oidc-providers [default-oidc-provider]
         site-url       (sso.test-helpers/localhost-site-url)]
        (mt/with-premium-features current-features
          (f))))))

(defmacro with-oidc-default-setup!
  "Set up default OIDC configuration for tests."
  [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-premium-features #{:audit-app}
       (do-with-other-sso-types-disabled!
        (fn []
          (mt/with-additional-premium-features #{:sso-oidc}
            (call-with-login-attributes-cleared!
             (fn []
               (call-with-default-oidc-config!
                (fn []
                  ~@body))))))))))
