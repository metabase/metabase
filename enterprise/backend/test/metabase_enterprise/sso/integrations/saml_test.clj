(ns metabase-enterprise.sso.integrations.saml-test
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
            [metabase.config :as config]
            [metabase.http-client :as http]
            [metabase.models.permissions-group :as group :refer [PermissionsGroup]]
            [metabase.models.permissions-group-membership :refer [PermissionsGroupMembership]]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.metastore-test :as metastore-test]
            [metabase.server.middleware.session :as mw.session]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [ring.util.codec :as codec]
            [saml20-clj.core :as saml20]
            [saml20-clj.encode-decode :as encode-decode]
            [toucan.db :as db])
  (:import java.net.URL
           java.nio.charset.StandardCharsets
           org.apache.http.client.utils.URLEncodedUtils
           org.apache.http.message.BasicNameValuePair))

(use-fixtures :once (fixtures/initialize :test-users))

(defn- disable-other-sso-types [thunk]
  (mt/with-temporary-setting-values [ldap-enabled false
                                     jwt-enabled  false]
    (thunk)))

(use-fixtures :each disable-other-sso-types)

(defmacro with-valid-metastore-token
  "Stubs the `metastore/enable-sso?` function to simulate a valid token. This needs to be included to test any of the
  SSO features"
  [& body]
  `(metastore-test/with-metastore-token-features #{:sso}
     ~@body))

(defn client
  "Same as `http/client` but doesn't include the `/api` in the URL prefix"
  [& args]
  (binding [http/*url-prefix* (str "http://localhost:" (config/config-str :mb-jetty-port))]
    (apply http/client args)))

(defn client-full-response
  "Same as `http/client-full-response` but doesn't include the `/api` in the URL prefix"
  [& args]
  (binding [http/*url-prefix* (str "http://localhost:" (config/config-str :mb-jetty-port))]
    (apply http/client-full-response args)))

(defn successful-login?
  "Return true if the response indicates a successful user login"
  [resp]
  (string? (get-in resp [:cookies @#'mw.session/metabase-session-cookie :value])))

(def ^:private default-idp-uri            "http://test.idp.metabase.com")
(def ^:private default-redirect-uri       "http://localhost:3000/test")
(def ^:private default-idp-uri-with-param (str default-idp-uri "?someparam=true"))

(def ^:private default-idp-cert
  "Public certificate from Auth0, used to validate mock SAML responses from Auth0"
  "MIIDEzCCAfugAwIBAgIJYpjQiNMYxf1GMA0GCSqGSIb3DQEBCwUAMCcxJTAjBgNV
BAMTHHNhbWwtbWV0YWJhc2UtdGVzdC5hdXRoMC5jb20wHhcNMTgwNTI5MjEwMDIz
WhcNMzIwMjA1MjEwMDIzWjAnMSUwIwYDVQQDExxzYW1sLW1ldGFiYXNlLXRlc3Qu
YXV0aDAuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzNcrpju4
sILZQNe1adwg3beXtAMFGB+Buuc414+FDv2OG7X7b9OSYar/nsYfWwiazZRxEGri
agd0Sj5mJ4Qqx+zmB/r4UgX3q/KgocRLlShvvz5gTD99hR7LonDPSWET1E9PD4XE
1fRaq+BwftFBl45pKTcCR9QrUAFZJ2R/3g06NPZdhe4bg/lTssY5emCxaZpQEku/
v+zzpV2nLF4by0vSj7AHsubrsLgsCfV3JvJyTxCyo1aIOlv4Vrx7h9rOgl9eEmoU
5XJAl3D7DuvSTEOy7MyDnKF17m7l5nOPZCVOSzmCWvxSCyysijgsM5DSgAE8DPJy
oYezV3gTX2OO2QIDAQABo0IwQDAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBSp
B3lvrtbSDuXkB6fhbjeUpFmL2DAOBgNVHQ8BAf8EBAMCAoQwDQYJKoZIhvcNAQEL
BQADggEBAAEHGIAhR5GPD2JxgLtpNtZMCYiAM4Gr7hoTQMaKiXgVtdQu4iMFfbpE
wIr6UVaDU2HKhvSRFIilOjRGmCGrIzvJgR2l+RL1Z3KrZypI1AXKJT5pF5g5FitB
sZq+kiUpdRILl2hICzw9Q1M2Le+JSUcHcbHTVgF24xuzOZonxeE56Oc26Ju4CorL
pM3Nb5iYaGOlQ+48/GP82cLxlVyi02va8tp7KP03ePSaZeBEKGpFtBtEN/dC3NKO
1mmrT9284H0tvete6KLUH+dsS6bDEYGHZM5KGoSLWRr3qYlCB3AmAw+KvuiuSczL
g9oYBkdxlhK9zZvkjCgaLCen+0aY67A=")

(defn- do-with-some-validators-disabled
  "The sample responses all have `InResponseTo=\"_1\"` and invalid assertion signatures (they were edited by hand) so
  manually add `_1` to the state manager and turn off the <Assertion> signature validator so we can actually run
  tests."
  {:style/indent [:defn 2]}
  ([f]
   (do-with-some-validators-disabled nil #{:signature :not-on-or-after :recipient :issuer}
     f))

  ([disabled-response-validators disabled-assertion-validators f]
   (let [orig              saml20/validate
         remove-validators (fn [options]
                             (-> options
                                 (update :response-validators #(set/difference (set %) (set disabled-response-validators)))
                                 (update :assertion-validators #(set/difference (set %) (set disabled-assertion-validators)))))]
     (with-redefs [saml20/validate (fn f
                                     ([response idp-cert sp-private-key]
                                      (f response idp-cert sp-private-key saml20/default-validation-options))
                                     ([response idp-cert sp-private-key options]
                                      (let [options (merge saml20/default-validation-options options)]
                                        (orig response idp-cert sp-private-key (remove-validators options)))))]
       (f)))))

(deftest validate-certificate-test
  (testing "make sure our test certificate is actually valid"
    (is (some? (#'sso-settings/validate-saml-idp-cert default-idp-cert)))))

(deftest require-valid-metastore-token-test
  (testing "SSO requests fail if they don't have a valid metastore token"
    (metastore-test/with-metastore-token-features #{}
      (is (= "SSO requires a valid token"
             (client :get 403 "/auth/sso"))))))

(deftest require-saml-enabled-test
  (testing "SSO requests fail if SAML hasn't been enabled"
    (with-valid-metastore-token
      (mt/with-temporary-setting-values [saml-enabled false]
        (is (some? (client :get 400 "/auth/sso"))))))

  (testing "SSO requests fail if SAML is enabled but hasn't been configured"
    (with-valid-metastore-token
      (mt/with-temporary-setting-values [saml-enabled               true
                                         saml-identity-provider-uri nil]
        (is (some? (client :get 400 "/auth/sso"))))))

  (testing "The IDP provider certificate must also be included for SSO to be configured"
    (with-valid-metastore-token
      (mt/with-temporary-setting-values [saml-enabled                       true
                                         saml-identity-provider-uri         default-idp-uri
                                         saml-identity-provider-certificate nil]
        (is (some? (client :get 400 "/auth/sso")))))))

(defn- call-with-default-saml-config [f]
  (mt/with-temporary-setting-values [saml-enabled                       true
                                     saml-identity-provider-uri         default-idp-uri
                                     saml-identity-provider-certificate default-idp-cert]
    (f)))

(defn call-with-login-attributes-cleared!
  "If login_attributes remain after these tests run, depending on the order that the tests run, lots of tests will
  fail as the login_attributes data from this tests is unexpected in those other tests"
  [f]
  (try
    (f)
    (finally
      (u/ignore-exceptions (db/update-where! User {} :login_attributes nil)))))

(defmacro ^:private with-saml-default-setup [& body]
  `(with-valid-metastore-token
     (call-with-login-attributes-cleared!
      (fn []
        (call-with-default-saml-config
         (fn []
           ~@body))))))

;; TODO - maybe this belongs in a util namespace?
(defn- uri->params-map
  "Parse the URI string, creating a map from the key/value pairs in the query string"
  [uri-str]
  (assert (string? uri-str))
  (into
   {}
   (for [^BasicNameValuePair pair (-> (URL. uri-str) .getQuery (URLEncodedUtils/parse StandardCharsets/UTF_8))]
     [(keyword (.getName pair)) (.getValue pair)])))

(deftest uri->params-map-test
  (is (= {:a "b", :c "d"}
         (uri->params-map "http://localhost?a=b&c=d"))))

(deftest request-xml-test
  (testing "Make sure the requests we generate look correct"
    (with-saml-default-setup
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [orig saml20/request]
          (with-redefs [saml20/request (fn [m]
                                         (testing "Request ID should be of the format id-<uuid>"
                                           (is (re= (re-pattern (str "^id-" u/uuid-regex "$"))
                                                    (:request-id m))))
                                         (mt/with-clock #t "2020-09-30T17:53:32Z"
                                           (orig (assoc m :request-id "id-419507d5-1d2a-43c4-bcde-3e5b9746bb47"))))]
            (let [request  (client-full-response :get 302 "/auth/sso"
                                                 {:request-options {:redirect-strategy :none}}
                                                 :redirect default-redirect-uri)
                  location (get-in request [:headers "Location"])
                  base-64  (-> location uri->params-map :SAMLRequest)
                  xml      (-> base-64
                               codec/url-decode
                               encode-decode/base64->inflate->str
                               (str/replace #"\n+" "")
                               (str/replace #">\s+<" "><"))]
              (is (= (str "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                          "<samlp:AuthnRequest"
                          " xmlns:samlp=\"urn:oasis:names:tc:SAML:2.0:protocol\""
                          " AssertionConsumerServiceURL=\"http://localhost:3000/auth/sso\""
                          " Destination=\"http://test.idp.metabase.com\""
                          " ID=\"id-419507d5-1d2a-43c4-bcde-3e5b9746bb47\""
                          " IssueInstant=\"2020-09-30T17:53:32Z\""
                          " ProtocolBinding=\"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST\""
                          " ProviderName=\"Metabase\""
                          " Version=\"2.0\">"
                          "<saml:Issuer xmlns:saml=\"urn:oasis:names:tc:SAML:2.0:assertion\">Metabase</saml:Issuer>"
                          "</samlp:AuthnRequest>")
                     xml)))))))))

(deftest redirect-test
  (testing "With SAML configured, a GET request should result in a redirect to the IDP"
    (with-saml-default-setup
      (let [result       (client-full-response :get 302 "/auth/sso"
                                               {:request-options {:redirect-strategy :none}}
                                               :redirect default-redirect-uri)
            redirect-url (get-in result [:headers "Location"])]
        (is (str/starts-with? redirect-url default-idp-uri))))))

(deftest redirect-append-paramters-test
  (testing (str "When the identity provider already includes a query parameter, the SAML code should spot that and "
                "append more parameters onto the query string (rather than always include a `?newparam=here`).")
    (with-saml-default-setup
      (mt/with-temporary-setting-values [saml-identity-provider-uri default-idp-uri-with-param]
        (let [result       (client-full-response :get 302 "/auth/sso"
                                                 {:request-options {:redirect-strategy :none}}
                                                 :redirect default-redirect-uri)
              redirect-url (get-in result [:headers "Location"])]
          (is (= #{:someparam :SAMLRequest :RelayState}
                 (set (keys (uri->params-map redirect-url))))))))))

;; The RelayState is data we include in the redirect request to the IDP. The IDP will include the RelayState in it's
;; response via the POST. This allows the FE to track what the original route the user was trying to access was and
;; redirect the user back to that original URL after successful authentication
(deftest relay-state-test
  (with-saml-default-setup
    (do-with-some-validators-disabled
      (fn []
        (let [result       (client-full-response :get 302 "/auth/sso"
                                                 {:request-options {:redirect-strategy :none}}
                                                 :redirect default-redirect-uri)
              redirect-url (get-in result [:headers "Location"])]
          (testing (format "result = %s" (pr-str result))
            (is (string? redirect-url))
            (is (= default-redirect-uri
                   (saml20/base64->str (:RelayState (uri->params-map redirect-url)))))))))))

(defn- saml-response-from-file [filename]
  (u/encode-base64 (slurp filename)))

(defn- saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response.xml"))

(defn- new-user-saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response-new-user.xml"))

(defn- new-user-with-single-group-saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response-new-user-with-single-group.xml"))

(defn- new-user-with-groups-saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response-new-user-with-groups.xml"))

(defn- saml-post-request-options [saml-response relay-state]
  {:request-options {:content-type     :x-www-form-urlencoded
                     :redirect-strategy :none
                     :form-params      {:SAMLResponse saml-response
                                        :RelayState   relay-state}}})

(defn- some-saml-attributes [user-nickname]
  {"http://schemas.auth0.com/identities/default/provider"   "auth0"
   "http://schemas.auth0.com/nickname"                      user-nickname
   "http://schemas.auth0.com/identities/default/connection" "Username-Password-Authentication"})

(defn- saml-login-attributes [email]
  (let [attribute-keys (keys (some-saml-attributes nil))]
    (-> (db/select-one-field :login_attributes User :email email)
        (select-keys attribute-keys))))

(deftest validate-request-id-test
  (testing "Sample response shoudl fail because _1 isn't a request ID that we issued."
    (with-saml-default-setup
      (do-with-some-validators-disabled
        (fn []
          (testing (str "After a successful login with the identity provider, the SAML provider will POST to the "
                        "`/auth/sso` route.")
            (let [req-options (saml-post-request-options (saml-test-response)
                                                         (saml20/str->base64 default-redirect-uri))
                  response    (client-full-response :post 302 "/auth/sso" req-options)]
              (is (successful-login? response))
              (is (= default-redirect-uri
                     (get-in response [:headers "Location"])))
              (is (= (some-saml-attributes "rasta")
                     (saml-login-attributes "rasta@metabase.com"))))))))))

(deftest validate-signatures-test
  ;; they were edited by hand I think, so the signatures are now incorrect (?)
  (testing "The sample responses should normally fail because the <Assertion> signatures don't match"
    (with-saml-default-setup
      (do-with-some-validators-disabled nil #{:not-on-or-after :recipient :issuer}
        (fn []
          (let [req-options (saml-post-request-options (saml-test-response)
                                                       default-redirect-uri)
                response    (client-full-response :post 401 "/auth/sso" req-options)]
            (testing (format "response =\n%s" (u/pprint-to-str response))
              (is (not (successful-login? response))))))))))

(deftest validate-not-on-or-after-test
  (with-saml-default-setup
    (testing "The sample responses should normally fail because the <Assertion> NotOnOrAfter has passed"
      (do-with-some-validators-disabled nil #{:signature :recipient}
        (fn []
          (let [req-options (saml-post-request-options (saml-test-response)
                                                       (saml20/str->base64 default-redirect-uri))]
            (is (not (successful-login? (client-full-response :post 401 "/auth/sso" req-options))))))))
    (testing "If we time-travel then the sample responses *should* work"
      (let [orig saml20/validate]
        (with-redefs [saml20/validate (fn [& args]
                                        (mt/with-clock #t "2018-07-01T00:00:00.000Z"
                                          (apply orig args)))]
          (do-with-some-validators-disabled nil #{:signature :recipient :issuer}
            (fn []
              (let [req-options (saml-post-request-options (saml-test-response)
                                                           (saml20/str->base64 default-redirect-uri))]
                (is (successful-login? (client-full-response :post 302 "/auth/sso" req-options)))))))))))

(deftest validate-recipient-test
  (with-saml-default-setup
    (testing (str "The sample responses all have <Recipient> of localhost:3000. "
                  "If (site-url) is set to something different, this should fail.")
      (do-with-some-validators-disabled nil #{:signature :not-on-or-after :issuer}
        (fn []
          (testing "with incorrect acs-url"
            (mt/with-temporary-setting-values [site-url "http://localhost:9876"]
              (let [req-options (saml-post-request-options (saml-test-response)
                                                           (saml20/str->base64 default-redirect-uri))]
                (is (not (successful-login? (client-full-response :post 401 "/auth/sso" req-options)))))))
          (testing "with correct acs-url"
            (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
              (let [req-options (saml-post-request-options (saml-test-response)
                                                           (saml20/str->base64 default-redirect-uri))]
                (is (successful-login? (client-full-response :post 302 "/auth/sso" req-options)))))))))))

(deftest validate-issuer-test
  (with-saml-default-setup
    (testing "If the `saml-identity-provider-issuer` Setting is set, we should validate <Issuer> in Responses"
      (do-with-some-validators-disabled nil #{:signature :not-on-or-after :recipient}
        (letfn [(login [expected-status-code]
                  (let [req-options (saml-post-request-options (saml-test-response)
                                                               (saml20/str->base64 default-redirect-uri))]
                    (client-full-response :post expected-status-code "/auth/sso" req-options)))]
          (fn []
            (testing "<Issuer> matches saml-identity-provider-issuer"
              (mt/with-temporary-setting-values [saml-identity-provider-issuer "urn:saml-metabase-test.auth0.com"]
                (is (successful-login? (login 302)))))
            (testing "<Issuer> does not match saml-identity-provider-issuer"
              (mt/with-temporary-setting-values [saml-identity-provider-issuer "WRONG"]
                (is (not (successful-login? (login 401))))))
            (testing "saml-identity-provider-issuer is not set: shouldn't do any validation"
              (mt/with-temporary-setting-values [saml-identity-provider-issuer nil]
                (is (successful-login? (login 302)))))))))))

;; Part of accepting the POST is validating the response and the relay state so we can redirect the user to their
;; original destination
(deftest login-test
  (with-saml-default-setup
    (do-with-some-validators-disabled
      (fn []
        (testing "After a successful login with the identity provider, the SAML provider will POST to the `/auth/sso` route."
          (let [req-options (saml-post-request-options (saml-test-response)
                                                       (saml20/str->base64 default-redirect-uri))
                response    (client-full-response :post 302 "/auth/sso" req-options)]
            (is (successful-login? response))
            (is (= default-redirect-uri
                   (get-in response [:headers "Location"])))
            (is (= (some-saml-attributes "rasta")
                   (saml-login-attributes "rasta@metabase.com")))))))))

(deftest login-invalid-relay-state-test
  (testing (str "if the RelayState is not set or is invalid, you are redirected back to the home page rather than "
                "failing the entire login")
    (doseq [relay-state ["something-random_#!@__^^"
                         ""
                         "   "
                         "/"]]
      (testing (format "\nRelayState = %s" (pr-str relay-state))
        (with-saml-default-setup
          (do-with-some-validators-disabled
            (fn []
              (let [req-options (saml-post-request-options (saml-test-response) relay-state)
                    response    (client-full-response :post 302 "/auth/sso" req-options)]
                (is (successful-login? response))
                (is (= (public-settings/site-url)
                       (get-in response [:headers "Location"])))
                (is (= (some-saml-attributes "rasta")
                       (saml-login-attributes "rasta@metabase.com")))))))))))

(deftest login-create-account-test
  (testing "A new account will be created for a SAML user we haven't seen before"
    (do-with-some-validators-disabled
      (fn []
        (with-saml-default-setup
          (try
            (is (not (db/exists? User :%lower.email "newuser@metabase.com")))
            (let [req-options (saml-post-request-options (new-user-saml-test-response)
                                                         (saml20/str->base64 default-redirect-uri))]
              (is (successful-login? (client-full-response :post 302 "/auth/sso" req-options)))
              (is (= [{:email        "newuser@metabase.com"
                       :first_name   "New"
                       :is_qbnewb    true
                       :is_superuser false
                       :id           true
                       :last_name    "User"
                       :date_joined  true
                       :common_name  "New User"}]
                     (->> (mt/boolean-ids-and-timestamps (db/select User :email "newuser@metabase.com"))
                          (map #(dissoc % :last_login)))))
              (testing "attributes"
                (is (= (some-saml-attributes "newuser")
                       (saml-login-attributes "newuser@metabase.com")))))
            (finally
              (db/delete! User :%lower.email "newuser@metabase.com"))))))))

(defn- group-memberships [user-or-id]
  (when-let [group-ids (seq (db/select-field :group_id PermissionsGroupMembership :user_id (u/the-id user-or-id)))]
    (db/select-field :name PermissionsGroup :id [:in group-ids])))

(deftest login-should-sync-single-group-membership
  (testing "saml group sync works when there's just a single group, which gets interpreted as a string"
    (with-saml-default-setup
      (do-with-some-validators-disabled
        (fn []
          (mt/with-temp PermissionsGroup [group-1 {:name (str ::group-1)}]
            (mt/with-temporary-setting-values [saml-group-sync      true
                                               saml-group-mappings  {"group_1" [(u/the-id group-1)]}
                                               saml-attribute-group "GroupMembership"]
              (try
                ;; user doesn't exist until SAML request
                (is (not (db/select-one-id User :%lower.email "newuser@metabase.com")))
                (let [req-options (saml-post-request-options (new-user-with-single-group-saml-test-response)
                                                             (saml20/str->base64 default-redirect-uri))
                      response    (client-full-response :post 302 "/auth/sso" req-options)]
                  (is (successful-login? response))
                  (is (= #{"All Users"
                           ":metabase-enterprise.sso.integrations.saml-test/group-1"}
                         (group-memberships (db/select-one-id User :email "newuser@metabase.com")))))
                (finally
                  (db/delete! User :%lower.email "newuser@metabase.com"))))))))))

(deftest login-should-sync-multiple-group-membership
  (testing "saml group sync works when there are multiple groups, which gets interpreted as a list of strings"
    (with-saml-default-setup
      (do-with-some-validators-disabled
        (fn []
          (mt/with-temp* [PermissionsGroup [group-1 {:name (str ::group-1)}]
                          PermissionsGroup [group-2 {:name (str ::group-2)}]]
            (mt/with-temporary-setting-values [saml-group-sync      true
                                               saml-group-mappings  {"group_1" [(u/the-id group-1)]
                                                                     "group_2" [(u/the-id group-2)]}
                                               saml-attribute-group "GroupMembership"]
              (try
                (testing "user doesn't exist until SAML request"
                  (is (not (db/select-one-id User :%lower.email "newuser@metabase.com"))))
                (let [req-options (saml-post-request-options (new-user-with-groups-saml-test-response)
                                                             (saml20/str->base64 default-redirect-uri))
                      response    (client-full-response :post 302 "/auth/sso" req-options)]
                  (is (successful-login? response))
                  (is (= #{"All Users"
                           ":metabase-enterprise.sso.integrations.saml-test/group-1"
                           ":metabase-enterprise.sso.integrations.saml-test/group-2"}
                         (group-memberships (db/select-one-id User :email "newuser@metabase.com")))))
                (finally
                  (db/delete! User :%lower.email "newuser@metabase.com"))))))))))

(deftest relay-state-e2e-test
  (testing "Redirect URL (RelayState) should work correctly end-to-end (#13666)"
    (with-saml-default-setup
      ;; The test HTTP client will automatically URL encode these for us.
      (doseq [redirect-url ["/collection/root"
                            default-redirect-uri
                            "/"]]
        (testing (format "\nredirect URL = %s" redirect-url)
          (let [result     (client-full-response :get 302 "/auth/sso"
                                                 {:request-options {:redirect-strategy :none}}
                                                 :redirect redirect-url)
                location   (get-in result [:headers "Location"])
                _          (is (string? location))
                params-map (uri->params-map location)]
            (testing (format "\nresult =\n%s" (u/pprint-to-str params-map))
              (testing "\nRelay state URL should be base-64 encoded"
                (is (= (saml20/str->base64 redirect-url)
                       (:RelayState params-map))))
              (testing "\nPOST request should redirect to the original redirect URL"
                (do-with-some-validators-disabled
                  (fn []
                    (let [req-options (saml-post-request-options (saml-test-response)
                                                                 (:RelayState params-map))
                          response    (client-full-response :post 302 "/auth/sso" req-options)]
                      (is (successful-login? response))
                      (is (= redirect-url
                             (get-in response [:headers "Location"]))))))))))))))
