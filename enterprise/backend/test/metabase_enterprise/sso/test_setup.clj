(ns metabase-enterprise.sso.test-setup
  "Shared test helpers for SSO tests.

   These utilities are used across multiple SSO integration tests (SAML, JWT, Slack Connect, etc.)
   to avoid circular dependencies between test namespaces."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.premium-features.token-check :as token-check]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Generic Helpers --------------------------------------------------

(defn successful-login?
  "Return true if the response indicates a successful user login.
   Checks for the presence of a session cookie in the response."
  [resp]
  (or
   (string? (get-in resp [:cookies request/metabase-session-cookie :value]))
   (some #(str/starts-with? % request/metabase-session-cookie) (get-in resp [:headers "Set-Cookie"]))))

(defn call-with-login-attributes-cleared!
  "Execute `thunk` and ensure login_attributes are cleared afterward.

   If login_attributes remain after tests run, depending on the order that the tests run,
   lots of tests will fail as the login_attributes data from this test is unexpected in
   those other tests."
  [thunk]
  (try
    (thunk)
    (finally
      (u/ignore-exceptions
        (t2/update! :model/User {} {:login_attributes nil})
        (t2/update! :model/User {:email "rasta@metabase.com"} {:first_name "Rasta" :last_name "Toucan" :sso_source nil})))))

(defn do-with-other-sso-types-disabled!
  "Execute `thunk` with LDAP, SAML, and JWT SSO types disabled.
   Useful when testing a specific SSO provider in isolation."
  [thunk]
  (mt/with-temporary-setting-values
    [ldap-enabled false
     saml-enabled false
     jwt-enabled  false]
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
        [jwt-enabled              true
         jwt-identity-provider-uri default-jwt-idp-uri
         jwt-shared-secret        default-jwt-secret
         site-url                 (format "http://localhost:%s" (config/config-str :mb-jetty-port))]
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

;;; -------------------------------------------------- Slack Connect Setup --------------------------------------------------

(def ^:private default-slack-client-id "test-slack-client-id")
(def ^:private default-slack-client-secret "test-slack-client-secret")

(defn call-with-default-slack-config!
  "Execute `f` with default Slack Connect configuration set up."
  [f]
  (let [current-features (token-check/*token-features*)]
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled                  true
         slack-connect-client-id                default-slack-client-id
         slack-connect-client-secret            default-slack-client-secret
         slack-connect-authentication-mode      "sso"
         slack-connect-user-provisioning-enabled true
         site-url                               (format "http://localhost:%s" (config/config-str :mb-jetty-port))]
        (mt/with-premium-features current-features
          (f))))))

;;; -------------------------------------------------- OIDC (Generic) Setup --------------------------------------------------

(def ^:private default-oidc-provider
  {:name           "test-idp"
   :display-name   "Test IdP"
   :issuer-uri     "https://test.idp.example.com"
   :client-id      "test-client-id"
   :client-secret  "test-client-secret"
   :scopes         ["openid" "email" "profile"]
   :enabled        true
   :auto-provision true})

(defn call-with-default-oidc-config!
  "Execute `f` with default OIDC configuration set up."
  [f]
  (let [current-features (token-check/*token-features*)]
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values
        [oidc-providers [default-oidc-provider]
         site-url       (format "http://localhost:%s" (config/config-str :mb-jetty-port))]
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

(defmacro with-slack-default-setup!
  "Set up default Slack Connect configuration for tests.
   Includes premium features, other SSO types disabled, login attributes cleanup, and default Slack config."
  [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-premium-features #{:audit-app}
       (do-with-other-sso-types-disabled!
        (fn []
          (mt/with-additional-premium-features #{:sso-slack}
            (call-with-login-attributes-cleared!
             (fn []
               (call-with-default-slack-config!
                (fn []
                  ~@body))))))))))
