(ns metabase.sso.test-helpers
  "Shared test helpers for SSO tests."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.request.core :as request]
   [metabase.server.instance :as server.instance]
   [metabase.test :as mt]
   [metabase.util :as u]
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
  "Execute `thunk` with LDAP and Slack Connect SSO types disabled.
   Useful when testing a specific SSO provider in isolation.

   Note: This OSS version only disables OSS SSO types. EE tests should use
   [[metabase-enterprise.sso.test-setup/do-with-other-sso-types-disabled!]]
   which also disables SAML and JWT."
  [thunk]
  (mt/with-temporary-setting-values
    [ldap-enabled          false
     slack-connect-enabled false]
    (thunk)))

(defn localhost-site-url
  "Return a valid localhost site URL for tests, even when no Jetty server is running.
   The CLI test runner often executes without a live server instance, so `server-port`
   can be nil in that mode."
  []
  (str "http://localhost:"
       (or (server.instance/server-port)
           (config/config-str :mb-jetty-port)
           3000)))

;;; -------------------------------------------------- Slack Connect Setup --------------------------------------------------

(def ^:private default-slack-client-id "test-slack-client-id")
(def ^:private default-slack-client-secret "test-slack-client-secret")

(defn call-with-default-slack-config!
  "Execute `f` with default Slack Connect configuration set up."
  [f]
  (mt/with-temporary-setting-values
    [slack-connect-enabled                   true
     slack-connect-client-id                 default-slack-client-id
     slack-connect-client-secret             default-slack-client-secret
     slack-connect-authentication-mode       "sso"
     slack-connect-user-provisioning-enabled true
     site-url                                (localhost-site-url)]
    (f)))

(defmacro with-slack-default-setup!
  "Set up default Slack Connect configuration for tests.
   Includes other SSO types disabled, login attributes cleanup, and default Slack config."
  [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-premium-features #{:audit-app}
       (do-with-other-sso-types-disabled!
        (fn []
          (call-with-login-attributes-cleared!
           (fn []
             (call-with-default-slack-config!
              (fn []
                ~@body)))))))))
