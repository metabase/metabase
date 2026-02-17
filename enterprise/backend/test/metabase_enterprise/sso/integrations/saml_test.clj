(ns metabase-enterprise.sso.integrations.saml-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.token-utils :as token-utils]
   [metabase-enterprise.sso.providers.saml :as saml.p]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase-enterprise.tenants.auth-provider] ;; make sure the auth provider is actually registered
   [metabase.appearance.settings :as appearance.settings]
   [metabase.premium-features.token-check :as token-check]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.sso.init]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [ring.util.codec :as codec]
   [saml20-clj.core :as saml]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)
   (java.net URL)
   (java.nio.charset StandardCharsets)
   (java.util.zip Inflater InflaterInputStream)
   (org.apache.commons.io IOUtils)
   (org.apache.http.client.utils URLEncodedUtils)
   (org.apache.http.message BasicNameValuePair)))

(set! *warn-on-reflection* true)

(comment metabase.sso.init/keep-me)

(use-fixtures :once (fixtures/initialize :test-users :web-server))

(defn- disable-api-url-prefix
  [thunk]
  (binding [client/*url-prefix* ""]
    (thunk)))

(use-fixtures :each disable-api-url-prefix)

(defn- do-with-other-sso-types-disabled! [thunk]
  (let [current-features (token-check/*token-features*)]
    ;; The :sso-jwt token is needed to set the jwt-enabled setting
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:sso-jwt}
        (mt/with-temporary-setting-values [ldap-enabled false
                                           jwt-enabled  false]
          (mt/with-premium-features current-features
            (thunk)))))))

(defmacro ^:private with-other-sso-types-disabled! [& body]
  `(do-with-other-sso-types-disabled! (fn [] ~@body)))

(def ^:private default-idp-uri            "http://test.idp.metabase.com")
(def ^:private default-redirect-uri       "http://localhost:3000/test")
(def ^:private default-idp-uri-with-param (str default-idp-uri "?someparam=true"))
(def ^:private default-idp-cert           (slurp "test_resources/sso/auth0-public-idp.cert"))
(def ^:private slo-idp-cert               (slurp "test_resources/sso/idp.cert"))

(defn call-with-default-saml-config! [f]
  (let [current-features (token-check/*token-features*)]
    (mt/with-premium-features #{:sso-saml}
      (mt/with-temporary-setting-values [saml-enabled                       true
                                         saml-identity-provider-uri         default-idp-uri
                                         saml-identity-provider-certificate default-idp-cert
                                         saml-keystore-path                 nil
                                         saml-keystore-password             nil
                                         saml-keystore-alias                nil
                                         site-url                           "http://localhost:3000"]
        (mt/with-premium-features current-features
          (f))))))

(defmacro with-default-saml-config! [& body]
  `(call-with-default-saml-config!
    (fn []
      ~@body)))

(defn- byte-inflate
  ^bytes [^bytes comp-bytes]
  (with-open [is (InflaterInputStream. (ByteArrayInputStream. comp-bytes) (Inflater. true) 1024)]
    (IOUtils/toByteArray is)))

(defn- bytes->str
  ^String [^bytes some-bytes]
  (when some-bytes
    (String. some-bytes "UTF-8")))

(defn call-with-login-attributes-cleared!
  "If login_attributes remain after these tests run, depending on the order that the tests run, lots of tests will
  fail as the login_attributes data from this tests is unexpected in those other tests"
  [thunk]
  (try
    (thunk)
    (finally
      (u/ignore-exceptions
        (t2/update! :model/User {} {:login_attributes nil})
        (t2/update! :model/User {:email "rasta@metabase.com"} {:first_name "Rasta" :last_name "Toucan" :sso_source nil})))))

(defmacro with-saml-default-setup! [& body]
  ;; most saml tests make actual http calls, so ensuring any nested with-temp doesn't create transaction
  `(mt/test-helpers-set-global-values!
     (mt/with-additional-premium-features #{:sso-saml}
       (call-with-login-attributes-cleared!
        (fn []
          (call-with-default-saml-config!
           (fn []
             ~@body)))))))

(defn successful-login?
  "Return true if the response indicates a successful user login"
  [resp]
  (or
   (string? (get-in resp [:cookies request/metabase-session-cookie :value]))
   (some #(str/starts-with? % request/metabase-session-cookie) (get-in resp [:headers "Set-Cookie"]))))

(defn- do-with-some-validators-disabled!
  "The sample responses all have `InResponseTo=\"_1\"` and invalid assertion signatures (they were edited by hand) so
  manually add `_1` to the state manager and turn off the <Assertion> signature validator so we can actually run
  tests."
  ([thunk]
   (do-with-some-validators-disabled!
    #{:issuer :signature :require-authenticated}
    #{:signature :not-on-or-after :recipient :issuer}
    thunk))

  ([disabled-response-validators disabled-assertion-validators thunk]
   (let [orig              saml/validate-response
         remove-validators (fn [options]
                             (-> options
                                 (update :response-validators #(set/difference (set %) (set disabled-response-validators)))
                                 (update :assertion-validators #(set/difference (set %) (set disabled-assertion-validators)))))]
     (with-redefs [saml/validate-response (fn f
                                            [response options]
                                            (orig response (remove-validators options)))]
       (thunk)))))

(deftest ^:parallel validate-certificate-test
  (testing "make sure our test certificate is actually valid"
    (is (some? (#'sso-settings/validate-saml-idp-cert default-idp-cert)))))

(deftest require-valid-premium-features-token-test
  (testing "SSO requests fail if they don't have a valid premium-features token"
    (with-other-sso-types-disabled!
      (mt/with-premium-features #{}
        (with-default-saml-config!
          (is (partial= {:cause "SSO has not been enabled and/or configured",
                         :data {:status "error-sso-disabled", :status-code 400},
                         :message "SSO has not been enabled and/or configured",
                         :status "error-sso-disabled"}
                        (client/client :get 400 "/auth/sso"))))))))

(deftest require-saml-enabled-test
  (with-other-sso-types-disabled!
    (mt/with-premium-features #{:sso-saml}
      (testing "SSO requests fail if SAML hasn't been configured or enabled"
        (mt/with-temporary-setting-values [saml-enabled                       false
                                           saml-identity-provider-uri         nil
                                           saml-identity-provider-certificate nil]
          (is (some? (client/client :get 400 "/auth/sso")))))

      (testing "SSO requests fail if SAML has been configured but not enabled"
        (mt/with-temporary-setting-values [saml-enabled                       false
                                           saml-identity-provider-uri         default-idp-uri
                                           saml-identity-provider-certificate default-idp-cert]
          (is (some? (client/client :get 400 "/auth/sso")))))

      (testing "SSO requests fail if SAML is enabled but hasn't been configured"
        (mt/with-temporary-setting-values [saml-enabled               true
                                           saml-identity-provider-uri nil]
          (is (some? (client/client :get 400 "/auth/sso")))))

      (testing "The IDP provider certificate must also be included for SSO to be configured"
        (mt/with-temporary-setting-values [saml-enabled                       true
                                           saml-identity-provider-uri         default-idp-uri
                                           saml-identity-provider-certificate nil]
          (is (some? (client/client :get 400 "/auth/sso"))))))))

;; TODO - maybe this belongs in a util namespace?
(defn- uri->params-map
  "Parse the URI string, creating a map from the key/value pairs in the query string"
  [uri-str]
  (assert (string? uri-str))
  (into
   {}
   (for [^BasicNameValuePair pair (-> (URL. uri-str) .getQuery (URLEncodedUtils/parse StandardCharsets/UTF_8))]
     [(keyword (.getName pair)) (.getValue pair)])))

(deftest ^:parallel uri->params-map-test
  (is (= {:a "b", :c "d"}
         (uri->params-map "http://localhost?a=b&c=d"))))

(deftest request-xml-test
  (testing "Make sure the requests we generate look correct"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
          (let [orig saml/idp-redirect-response]
            (with-redefs [saml/idp-redirect-response (fn [m]
                                                       (mt/with-clock #t "2020-09-30T17:53:32Z"
                                                         (orig (assoc m :request-id "id-419507d5-1d2a-43c4-bcde-3e5b9746bb47"))))]
              (let [request  (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :redirect default-redirect-uri)
                    location (get-in request [:headers "Location"])
                    base-64  (-> location uri->params-map :SAMLRequest)
                    xml      (-> base-64
                                 codec/url-decode
                                 u/decode-base64-to-bytes
                                 byte-inflate
                                 bytes->str
                                 (str/replace #"\n+" "")
                                 (str/replace #">\s+<" "><"))]
                (is (= (str "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                            "<saml2p:AuthnRequest"
                            " AssertionConsumerServiceURL=\"http://localhost:3000/auth/sso\""
                            " Destination=\"http://test.idp.metabase.com\""
                            " ID=\"id-419507d5-1d2a-43c4-bcde-3e5b9746bb47\""
                            " IsPassive=\"false\""
                            " IssueInstant=\"2020-09-30T17:53:32.000Z\""
                            " ProtocolBinding=\"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST\""
                            " ProviderName=\"Metabase\""
                            " Version=\"2.0\""
                            " xmlns:saml2p=\"urn:oasis:names:tc:SAML:2.0:protocol\">"
                            "<saml2:Issuer xmlns:saml2=\"urn:oasis:names:tc:SAML:2.0:assertion\">Metabase</saml2:Issuer>"
                            "<saml2p:NameIDPolicy Format=\"urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified\"/>"
                            "</saml2p:AuthnRequest>")
                       xml))))))))))

(deftest redirect-test
  (testing "With SAML configured, a GET request should result in a redirect to the IDP"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (let [result       (client/client-real-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :redirect default-redirect-uri)
              redirect-url (get-in result [:headers "Location"])]
          (is (str/starts-with? redirect-url default-idp-uri)))))))

(deftest redirect-append-parameters-test
  (testing (str "When the identity provider already includes a query parameter, the SAML code should spot that and "
                "append more parameters onto the query string (rather than always include a `?newparam=here`).")
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (mt/with-temporary-setting-values [saml-identity-provider-uri default-idp-uri-with-param]
          (let [result       (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :redirect default-redirect-uri)
                redirect-url (get-in result [:headers "Location"])]
            (is (= #{:someparam :SAMLRequest :RelayState}
                   (set (keys (uri->params-map redirect-url)))))))))))

;; The RelayState is data we include in the redirect request to the IDP. The IDP will include the RelayState in it's
;; response via the POST. This allows the FE to track what the original route the user was trying to access was and
;; redirect the user back to that original URL after successful authentication
(deftest relay-state-test
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (do-with-some-validators-disabled!
       (fn []
         (let [result        (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :redirect default-redirect-uri)
               redirect-url (get-in result [:headers "Location"])]
           (testing (format "result = %s" (pr-str result))
             (is (string? redirect-url))
             (is (= default-redirect-uri
                    (u/decode-base64 (:RelayState (uri->params-map redirect-url))))))))))))

(defn- saml-response-from-file [filename]
  (u/encode-base64 (slurp filename)))

(defn- saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response.xml"))

(defn- new-user-saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response-new-user.xml"))

(defn- new-user-no-names-saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response-new-user-no-names.xml"))

(defn- new-user-with-single-group-saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response-new-user-with-single-group.xml"))

(defn- new-user-with-groups-saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response-new-user-with-groups.xml"))

(defn- whitespace-response []
  (str (saml-response-from-file "test_resources/saml-test-response.xml") "\n\n"))

(defn- new-user-with-groups-in-separate-attribute-nodes-saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response-new-user-with-groups-in-separate-attribute-nodes.xml"))

(defn- saml-slo-test-response []
  (saml-response-from-file "test_resources/saml-slo-test-response.xml"))

(defn- saml-post-request-options [saml-response relay-state]
  {:request-options {:content-type     :x-www-form-urlencoded
                     :redirect-strategy :none
                     :form-params      {:SAMLResponse saml-response
                                        :RelayState   (u/encode-base64 relay-state)}}})

(defn- some-saml-attributes [user-nickname]
  {"http://schemas.auth0.com/identities/default/provider"   "auth0"
   "http://schemas.auth0.com/nickname"                      user-nickname
   "http://schemas.auth0.com/identities/default/connection" "Username-Password-Authentication"})

(defn- saml-login-attributes [email]
  (let [attribute-keys (keys (some-saml-attributes nil))]
    (-> (t2/select-one-fn :login_attributes :model/User :email email)
        (select-keys attribute-keys))))

(deftest validate-request-id-test
  (testing "Sample response should fail because _1 isn't a request ID that we issued."
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (do-with-some-validators-disabled!
         (fn []
           (testing (str "After a successful login with the identity provider, the SAML provider will POST to the "
                         "`/auth/sso` route.")
             (let [req-options (saml-post-request-options (saml-test-response)
                                                          default-redirect-uri)
                   response    (client/client-real-response :post 302 "/auth/sso" req-options)]
               (is (successful-login? response))
               (is (= default-redirect-uri
                      (get-in response [:headers "Location"])))
               (is (= (some-saml-attributes "rasta")
                      (saml-login-attributes "rasta@metabase.com")))))))))))

(deftest validate-signatures-test
  ;; they were edited by hand I think, so the signatures are now incorrect (?)
  (testing "The sample responses should normally fail because the <Assertion> signatures don't match"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (do-with-some-validators-disabled!
         nil #{:not-on-or-after :recipient :issuer}
         (fn []
           (let [req-options (saml-post-request-options (saml-test-response)
                                                        default-redirect-uri)
                 response    (client/client-real-response :post 401 "/auth/sso" req-options)]
             (testing (format "response =\n%s" (u/pprint-to-str response))
               (is (not (successful-login? response)))))))))))

(deftest validate-not-on-or-after-test
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (testing "The sample responses should normally fail because the <Assertion> NotOnOrAfter has passed"
        (do-with-some-validators-disabled!
         nil #{:signature :recipient}
         (fn []
           (let [req-options (saml-post-request-options (saml-test-response)
                                                        default-redirect-uri)]
             (is (not (successful-login? (client/client-real-response :post 401 "/auth/sso" req-options)))))))))))

(deftest validate-not-on-or-after-test-2
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (testing "If we time-travel then the sample responses *should* work"
        (let [orig saml/validate-response]
          (with-redefs [saml/validate-response
                        (fn [& args]
                          (mt/with-clock #t "2018-07-01T00:00:00.000Z"
                            (apply orig args)))]
            (do-with-some-validators-disabled!
             #{:signature :issuer :require-authenticated} #{:signature :recipient :issuer}
             (fn []
               (let [req-options (saml-post-request-options (saml-test-response)
                                                            default-redirect-uri)]
                 (is (successful-login? (client/client-real-response :post 302 "/auth/sso" req-options))))))))))))

(deftest validate-recipient-test
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (testing (str "The sample responses all have <Recipient> of localhost:3000. "
                    "If (site-url) is set to something different, this should fail.")
        (do-with-some-validators-disabled!
         #{:signature :issuer :require-authenticated} #{:signature :not-on-or-after :issuer}
         (fn []
           (testing "with incorrect acs-url"
             (mt/with-temporary-setting-values [site-url "http://localhost:9876"]
               (let [req-options (saml-post-request-options (saml-test-response)
                                                            default-redirect-uri)]
                 (is (not (successful-login? (client/client-real-response :post 401 "/auth/sso" req-options)))))))
           (testing "with correct acs-url"
             (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
               (let [req-options (saml-post-request-options (saml-test-response)
                                                            default-redirect-uri)]
                 (is (successful-login? (client/client-real-response :post 302 "/auth/sso" req-options))))))))))))

(deftest validate-issuer-test
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (testing "If the `saml-identity-provider-issuer` Setting is set, we should validate <Issuer> in Responses"
        (do-with-some-validators-disabled!
         #{:signature :require-authenticated}
         #{:signature :not-on-or-after :recipient}
         (letfn [(login [expected-status-code]
                   (let [req-options (saml-post-request-options (saml-test-response)
                                                                default-redirect-uri)]
                     (client/client-real-response :post expected-status-code "/auth/sso" req-options)))]
           (fn []
             (testing "<Issuer> matches saml-identity-provider-issuer"
               (mt/with-temporary-setting-values [saml-identity-provider-issuer "urn:saml-metabase-test.auth0.com"]
                 (is (successful-login? (login 302)))))
             (testing "<Issuer> does not match saml-identity-provider-issuer"
               (mt/with-temporary-setting-values [saml-identity-provider-issuer "WRONG"]
                 (is (not (successful-login? (login 401)))))))))))))

;; Part of accepting the POST is validating the response and the relay state so we can redirect the user to their
;; original destination
(deftest login-test
  (testing "After a successful login with the identity provider, the SAML provider will POST to the `/auth/sso` route."
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (do-with-some-validators-disabled!
         (fn []
           (let [req-options (saml-post-request-options (saml-test-response)
                                                        default-redirect-uri)
                 response    (client/client-real-response :post 302 "/auth/sso" req-options)]
             (is (successful-login? response))
             (is (= default-redirect-uri
                    (get-in response [:headers "Location"])))
             (is (= (some-saml-attributes "rasta")
                    (saml-login-attributes "rasta@metabase.com"))))))))))

(deftest login-test-2
  (testing "Still works with whitespace in the SAML post response (#23451)"
    (with-saml-default-setup!
      (with-other-sso-types-disabled!
        (do-with-some-validators-disabled!
         (fn []
           (let [req-options (saml-post-request-options (whitespace-response)
                                                        default-redirect-uri)
                 response    (client/client-real-response :post 302 "/auth/sso" req-options)]
             (is (successful-login? response))
             (is (= default-redirect-uri
                    (get-in response [:headers "Location"])))
             (is (= (some-saml-attributes "rasta")
                    (saml-login-attributes "rasta@metabase.com"))))))))))

(deftest jwt-saml-both-enabled-saml-success-test
  (with-other-sso-types-disabled!
    (mt/with-additional-premium-features #{:sso-jwt}
      (testing "with SAML and JWT configured, a GET request without JWT params successfully logins with SAML."
        (with-saml-default-setup!
          (do-with-some-validators-disabled!
           (fn []
             (let [req-options (saml-post-request-options (saml-test-response)
                                                          default-redirect-uri)
                   response    (client/client-real-response :post 302 "/auth/sso" req-options)]
               (is (successful-login? response))
               (is (= default-redirect-uri
                      (get-in response [:headers "Location"])))
               (is (= (some-saml-attributes "rasta")
                      (saml-login-attributes "rasta@metabase.com")))))))))))

(deftest login-invalid-relay-state-test
  (testing (str "if the RelayState is not set or is invalid, you are redirected back to the home page rather than "
                "failing the entire login")
    (with-other-sso-types-disabled!
      (doseq [relay-state ["something-random_#!@__^^"
                           ""
                           "   "
                           "/"
                           "https://badsite.com"
                           "//badsite.com"
                           "https:///badsite.com"]]
        (testing (format "\nRelayState = %s" (pr-str relay-state))
          (with-saml-default-setup!
            (do-with-some-validators-disabled!
             (fn []
               (let [req-options {:request-options {:content-type     :x-www-form-urlencoded
                                                    :redirect-strategy :none
                                                    :form-params      {:SAMLResponse (saml-test-response)
                                                                       :RelayState   relay-state}}}
                     response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                 (is (successful-login? response))
                 (is (= (system/site-url)
                        (get-in response [:headers "Location"])))
                 (is (= (some-saml-attributes "rasta")
                        (saml-login-attributes "rasta@metabase.com"))))))))))))

(deftest login-invalid-relay-state-test-2
  (testing "if the RelayState leads us to the wrong host, avoid the open redirect (boat#160)"
    (with-other-sso-types-disabled!
      (doseq [redirect-url ["https://badsite.com"
                            "//badsite.com"
                            "https:///badsite.com"]]
        (with-saml-default-setup!
          (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
            (do-with-some-validators-disabled!
             (fn []
               (let [get-response (client/client :get 400 "/auth/sso"
                                                 {:request-options {:redirect-strategy :none}}
                                                 :redirect redirect-url)]
                 (testing (format "\n%s should not redirect" redirect-url)
                   (is (= "Invalid redirect URL" (:message get-response)))))))))))))

(deftest login-create-account-test
  (testing "A new account will be created for a SAML user we haven't seen before"
    (with-other-sso-types-disabled!
      (mt/with-premium-features #{:audit-app}
        (do-with-some-validators-disabled!
         (fn []
           (with-saml-default-setup!
             (try
               (is (not (t2/exists? :model/User :%lower.email "newuser@metabase.com")))
               (let [req-options (saml-post-request-options (new-user-saml-test-response)
                                                            default-redirect-uri)]
                 (is (successful-login? (client/client-real-response :post 302 "/auth/sso" req-options))))
               (let [new-user (t2/select-one :model/User :email "newuser@metabase.com")]
                 (is (= {:email        "newuser@metabase.com"
                         :first_name   "New"
                         :is_qbnewb    true
                         :is_superuser false
                         :id           true
                         :last_name    "User"
                         :date_joined  true
                         :common_name  "New User"
                         :tenant_id    false}
                        (-> (mt/boolean-ids-and-timestamps new-user)
                            (dissoc :last_login))))
                 (testing "User Invite Event is logged."
                   (is (= "newuser@metabase.com"
                          (get-in (mt/latest-audit-log-entry :user-invited (:id new-user))
                                  [:details :email])))))
               (testing "attributes"
                 (is (= (some-saml-attributes "newuser")
                        (saml-login-attributes "newuser@metabase.com"))))
               (finally
                 (t2/delete! :model/User :%lower.email "newuser@metabase.com"))))))))))

(deftest login-update-account-test
  (testing "A new 'Unknown' name account will be created for a SAML user with no configured first or last name"
    (with-other-sso-types-disabled!
      (do-with-some-validators-disabled!
       (fn []
         (with-saml-default-setup!
           (try
             (is (not (t2/exists? :model/User :%lower.email "newuser@metabase.com")))
             ;; login with a user with no givenname or surname attributes
             (let [req-options (saml-post-request-options (new-user-no-names-saml-test-response)
                                                          default-redirect-uri)]
               (is (successful-login? (client/client-real-response :post 302 "/auth/sso" req-options)))
               (is (= [{:email        "newuser@metabase.com"
                        :first_name   nil
                        :is_qbnewb    true
                        :is_superuser false
                        :id           true
                        :last_name    nil
                        :date_joined  true
                        :common_name  "newuser@metabase.com"
                        :tenant_id    false}]
                      (->> (mt/boolean-ids-and-timestamps (t2/select :model/User :email "newuser@metabase.com"))
                           (map #(dissoc % :last_login))))))
             ;; login with the same user, but now givenname and surname attributes exist
             (let [req-options (saml-post-request-options (new-user-saml-test-response)
                                                          default-redirect-uri)]
               (is (successful-login? (client/client-real-response :post 302 "/auth/sso" req-options)))
               (is (= [{:email        "newuser@metabase.com"
                        :first_name   "New"
                        :is_qbnewb    true
                        :is_superuser false
                        :id           true
                        :last_name    "User"
                        :date_joined  true
                        :common_name  "New User"
                        :tenant_id    false}]
                      (->> (mt/boolean-ids-and-timestamps (t2/select :model/User :email "newuser@metabase.com"))
                           (map #(dissoc % :last_login))))))
             (finally
               (t2/delete! :model/User :%lower.email "newuser@metabase.com")))))))))

(deftest existing-user-reactivated-if-provisioning-is-on
  (testing "An existing user will be reactivated upon login"
    (with-other-sso-types-disabled!
      (do-with-some-validators-disabled!
       (fn []
         (with-saml-default-setup!
           (try
             (is (not (t2/exists? :model/User :%lower.email "newuser@metabase.com")))
             ;; login once to create the user
             (let [req-options (saml-post-request-options (new-user-no-names-saml-test-response)
                                                          default-redirect-uri)]
               (is (successful-login? (client/client-real-response :post 302 "/auth/sso" req-options))))
             ;; deactivate the user
             (t2/update! :model/User :%lower.email "newuser@metabase.com" {:is_active false})
             (testing "We can reactivate a user with a new login"
               (let [req-options (saml-post-request-options (new-user-no-names-saml-test-response)
                                                            default-redirect-uri)]
                 (is (successful-login? (client/client-real-response :post 302 "/auth/sso" req-options)))
                 (is (t2/select-one-fn :is_active [:model/User :is_active] :email "newuser@metabase.com"))))
             ;; deactivate the user again
             (t2/update! :model/User :%lower.email "newuser@metabase.com" {:is_active false})
             (testing "We can't reactivate the user if user provisioning is disabled."
               (with-redefs [sso-settings/saml-user-provisioning-enabled? (constantly false)
                             appearance.settings/site-name (constantly "test")]
                 (let [req-options (saml-post-request-options (new-user-no-names-saml-test-response)
                                                              default-redirect-uri)]
                   ;; we get a `401`
                   (is (client/client-real-response :post 401 "/auth/sso" req-options))
                   (is (not (t2/select-one-fn :is_active [:model/User :is_active] :email "newuser@metabase.com"))))))
             (finally
               (t2/delete! :model/User :%lower.email "newuser@metabase.com")))))))))

(defn- group-memberships [user-or-id]
  (when-let [group-ids (seq (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (u/the-id user-or-id)))]
    (t2/select-fn-set :name :model/PermissionsGroup :id [:in group-ids])))

(deftest login-should-sync-single-group-membership
  (testing "saml group sync works when there's just a single group, which gets interpreted as a string"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (do-with-some-validators-disabled!
         (fn []
           (mt/with-temp [:model/PermissionsGroup group-1 {:name (str ::group-1)}]
             (mt/with-temporary-setting-values [saml-group-sync      true
                                                saml-group-mappings  {"group_1" [(u/the-id group-1)]}
                                                saml-attribute-group "GroupMembership"]
               (try
                 ;; user doesn't exist until SAML request
                 (is (not (t2/select-one-pk :model/User :%lower.email "newuser@metabase.com")))
                 (let [req-options (saml-post-request-options (new-user-with-single-group-saml-test-response)
                                                              default-redirect-uri)
                       response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                   (is (successful-login? response))
                   (is (= #{"All Users"
                            ":metabase-enterprise.sso.integrations.saml-test/group-1"}
                          (group-memberships (t2/select-one-pk :model/User :email "newuser@metabase.com")))))
                 (finally
                   (t2/delete! :model/User :%lower.email "newuser@metabase.com")))))))))))

(deftest login-should-sync-multiple-group-membership
  (testing "saml group sync works when there are multiple groups, which gets interpreted as a list of strings"
    (testing "when only one Attribute node exists"
      (with-other-sso-types-disabled!
        (with-saml-default-setup!
          (do-with-some-validators-disabled!
           (fn []
             (mt/with-temp [:model/PermissionsGroup group-1 {:name (str ::group-1)}
                            :model/PermissionsGroup group-2 {:name (str ::group-2)}]
               (mt/with-temporary-setting-values [saml-group-sync      true
                                                  saml-group-mappings  {"group_1" [(u/the-id group-1)]
                                                                        "group_2" [(u/the-id group-2)]}
                                                  saml-attribute-group "GroupMembership"]
                 (try
                   (testing "user doesn't exist until SAML request"
                     (is (not (t2/select-one-pk :model/User :%lower.email "newuser@metabase.com"))))
                   (let [req-options (saml-post-request-options (new-user-with-groups-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                     (is (successful-login? response))
                     (is (= #{"All Users"
                              ":metabase-enterprise.sso.integrations.saml-test/group-1"
                              ":metabase-enterprise.sso.integrations.saml-test/group-2"}
                            (group-memberships (t2/select-one-pk :model/User :email "newuser@metabase.com")))))
                   (finally
                     (t2/delete! :model/User :%lower.email "newuser@metabase.com"))))))))))))

(deftest login-should-sync-multiple-group-membership-2
  (testing "saml group sync works when there are multiple groups, which gets interpreted as a list of strings"
    (testing "when several Attribute nodes exist (#20744)"
      (with-other-sso-types-disabled!
        (with-saml-default-setup!
          (do-with-some-validators-disabled!
           (fn []
             (mt/with-temp [:model/PermissionsGroup group-1 {:name (str ::group-1)}
                            :model/PermissionsGroup group-2 {:name (str ::group-2)}]
               (mt/with-temporary-setting-values [saml-group-sync      true
                                                  saml-group-mappings  {"group_1" [(u/the-id group-1)]
                                                                        "group_2" [(u/the-id group-2)]}
                                                  saml-attribute-group "GroupMembership"]
                 (try
                   (testing "user doesn't exist until SAML request"
                     (is (not (t2/select-one-pk :model/User :%lower.email "newuser@metabase.com"))))
                   (let [req-options (saml-post-request-options (new-user-with-groups-in-separate-attribute-nodes-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                     (is (successful-login? response))
                     (is (= #{"All Users"
                              ":metabase-enterprise.sso.integrations.saml-test/group-1"
                              ":metabase-enterprise.sso.integrations.saml-test/group-2"}
                            (group-memberships (t2/select-one-pk :model/User :email "newuser@metabase.com")))))
                   (finally
                     (t2/delete! :model/User :%lower.email "newuser@metabase.com"))))))))))))

(deftest relay-state-e2e-test
  (testing "Redirect URL (RelayState) should work correctly end-to-end (#13666)"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        ;; The test HTTP client will automatically URL encode these for us.
        (doseq [redirect-url ["http://localhost:3001/collection/root"
                              default-redirect-uri
                              "http://localhost:3001/"]]
          (testing (format "\nredirect URL = %s" redirect-url)
            (let [result     (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :redirect redirect-url)
                  location   (get-in result [:headers "Location"])
                  _          (is (string? location))
                  params-map (uri->params-map location)]
              (testing (format "\nresult =\n%s" (u/pprint-to-str params-map))
                (testing "\nRelay state URL should be base-64 encoded"
                  (is (= redirect-url
                         (u/decode-base64 (:RelayState params-map)))))
                (testing "\nPOST request should redirect to the original redirect URL"
                  (do-with-some-validators-disabled!
                   (fn []
                     (let [req-options (saml-post-request-options (saml-test-response)
                                                                  (u/decode-base64 (:RelayState params-map)))
                           response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                       (is (successful-login? response))
                       (is (= redirect-url
                              (get-in response [:headers "Location"])))))))))))))))

(deftest sso-subpath-e2e-test
  (testing "Redirect URL should correctly append the site-url when the redirect is a relative path (#28650)"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (doseq [redirect-url ["/collection/root"
                              "/test"
                              "/"]]
          (testing (format "\nredirect URL = %s" redirect-url)
            (mt/with-temporary-setting-values [site-url "http://localhost:3001/path"]
              (let [result     (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :redirect redirect-url)
                    location   (get-in result [:headers "Location"])
                    _          (is (string? location))
                    params-map (uri->params-map location)]
                (testing (format "\nresult =\n%s" (u/pprint-to-str params-map))
                  (testing "\nPOST request should redirect to the original redirect URL with the correct site-url path"
                    (do-with-some-validators-disabled!
                     (fn []
                       (let [req-options (saml-post-request-options (saml-test-response)
                                                                    (u/decode-base64 (:RelayState params-map)))
                             response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                         (is (successful-login? response))
                         (is (= (str "http://localhost:3001/path" redirect-url)
                                (get-in response [:headers "Location"]))))))))))))))))

(deftest create-new-saml-user-no-user-provisioning-test
  (testing "When user provisioning is disabled, throw an error if we attempt to create a new user."
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (with-redefs [sso-settings/saml-user-provisioning-enabled? (constantly false)
                      appearance.settings/site-name (constantly "test")]
          (let [req-options (saml-post-request-options (new-user-saml-test-response)
                                                       default-redirect-uri)]
            (client/client-real-response :post 401 "/auth/sso" req-options)))))))

(deftest logout-should-delete-session-test-slo-enabled
  (testing "Successful SAML SLO logouts should delete the user's session, when saml-slo-enabled."
    (with-other-sso-types-disabled!
      (let [session-key (session/generate-session-key)
            session-key-hashed (session/hash-session-key session-key)]
        (mt/with-temp [:model/User user {:email "saml_test@metabase.com" :sso_source "saml"}
                       :model/Session _ {:user_id (:id user) :id (session/generate-session-id) :key_hashed session-key-hashed}]
          (with-saml-default-setup!
            (mt/with-temporary-setting-values [saml-slo-enabled true
                                               saml-identity-provider-issuer "http://localhost:9090/realms/master"
                                               saml-identity-provider-certificate slo-idp-cert]
              (is (t2/exists? :model/Session :key_hashed session-key-hashed))
              (let [req-options (-> (saml-post-request-options
                                     (saml-slo-test-response)
                                     default-redirect-uri)
                                    ;; Client sends their session cookie during the SLO request redirect from the IDP.
                                    (assoc-in [:request-options :cookies request/metabase-session-cookie :value] session-key))
                    response    (client/client-real-response :post 302 "/auth/sso/handle_slo" req-options)]
                (is (str/blank? (get-in response [:cookies request/metabase-session-cookie :value]))
                    "After a successful log-out, you don't have a session")
                (is (not (t2/exists? :model/Session :key_hashed session-key-hashed))
                    "After a successful log-out, the session is deleted")))))))))

(deftest logout-should-delete-session-test-slo-disabled
  (testing "Successful SAML SLO logouts should not delete the user's session, when not saml-slo-enabled."
    (with-other-sso-types-disabled!
      (mt/with-temporary-setting-values [saml-slo-enabled false]
        (let [session-key (session/generate-session-key)
              session-key-hashed (session/hash-session-key session-key)]
          (mt/with-temp [:model/User user {:email "saml_test@metabase.com" :sso_source "saml"}
                         :model/Session _ {:user_id (:id user) :id (session/generate-session-id) :key_hashed session-key-hashed}]
            (with-saml-default-setup!
              (is (t2/exists? :model/Session :key_hashed session-key-hashed))
              (let [req-options (-> (saml-post-request-options
                                     (saml-slo-test-response)
                                     default-redirect-uri)
                                    ;; Client sends their session cookie during the SLO request redirect from the IDP.
                                    (assoc-in [:request-options :cookies request/metabase-session-cookie :value] session-key))
                    response    (client/client-real-response :post 403 "/auth/sso/handle_slo" req-options)]
                (is (str/blank? (get-in response [:cookies request/metabase-session-cookie :value]))
                    "After a successful log-out, you don't have a session")
                (is (t2/exists? :model/Session :key_hashed session-key-hashed)
                    "After a successful log-out, the session is deleted")))))))))

(deftest logout-should-delete-session-when-idp-slo-conf-missing-test
  (testing "Missing SAML SLO config logouts should still delete the user's session."
    (with-other-sso-types-disabled!
      (mt/with-temporary-setting-values [saml-slo-enabled false]
        (let [session-key (session/generate-session-key)
              session-key-hashed (session/hash-session-key session-key)]
          (mt/with-temp [:model/User user {:email "saml_test@metabase.com" :sso_source "saml"}
                         :model/Session _ {:user_id (:id user) :id (session/generate-session-id) :key_hashed session-key-hashed}]
            (is (t2/exists? :model/Session :key_hashed session-key-hashed))
            (let [req-options (assoc-in {} [:request-options :cookies request/metabase-session-cookie :value] session-key)]
              (client/client :post "/auth/sso/logout" req-options)
              (is (not (t2/exists? :model/Session :key_hashed session-key-hashed))))))))))

(deftest saml-embedding-sdk-integration-returns-idp-url-tests
  (testing "should return IdP URL and method info when embedding SDK header is present"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (let [result (client/client-real-response
                      :get 200 "/auth/sso"
                      {:request-options {:headers {"x-metabase-client" "embedding-sdk-react"
                                                   "origin" "example.com"}}})]
          (is (partial= {:status 200
                         :body {:method "saml"}
                         :headers {"Content-Type" "application/json"}}
                        result))
          (is (str/starts-with? (-> result :body :url) default-idp-uri)))))))

(deftest saml-embedding-sdk-integration-includes-origin-tests
  (testing "should include origin in the redirect URL when embedding SDK header is present with origin"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (let [result (client/client-real-response
                      :get 200 "/auth/sso"
                      {:request-options {:headers {"x-metabase-client" "embedding-sdk-react"
                                                   "origin" "https://app.example.com"}}})
              origin (-> (get-in result [:body :url])
                         uri->params-map
                         :RelayState
                         u/decode-base64
                         uri->params-map
                         :origin)]
          (is (= "https://app.example.com" origin)))))))

(deftest saml-embedding-sdk-integration-includes-token-tests
  (mt/with-temporary-setting-values [sdk-encryption-validation-key "1FlZMdousOLX9d3SSL+KuWq2+l1gfKoFM7O4ZHqKjTgabo7QdqP8US2bNPN+PqisP1QOKvesxkxOigIrvvd5OQ=="]
    (testing "should include token in the redirect URL when embedding SDK header is present with origin"
      (with-other-sso-types-disabled!
        (with-saml-default-setup!
          (let [result (client/client-real-response
                        :get 200 "/auth/sso"
                        {:request-options {:headers {"x-metabase-client" "embedding-sdk-react"
                                                     "origin" "https://app.example.com"}}})
                token (-> (get-in result [:body :url])
                          uri->params-map
                          :RelayState
                          u/decode-base64
                          uri->params-map
                          :token)]
            (is (not (nil? token)))))))))

(deftest saml-embedding-sdk-integration-no-embedding-tests
  (testing "should redirect to IdP when no embedding SDK header is present"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (let [result (client/client-real-response
                      :get 302 "/auth/sso"
                      {:request-options {:redirect-strategy :none}})]
          (is (partial= {:status 302}
                        result))
          (is (str/starts-with? (get-in result [:headers "Location"]) default-idp-uri)))))))

(deftest saml-embedding-sdk-post-integration-tests
  (testing "should the token when it is included in relay state and embedding SDK header"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (do-with-some-validators-disabled!
         (fn []
           (let [relay-state (str  "http://localhost:3000/"
                                   "?token=" (token-utils/generate-token)
                                   "&origin=https%3A%2F%2Fapp.example.com")
                 req-options (saml-post-request-options
                              (saml-test-response)
                              relay-state)
                 response (client/client-real-response :post 200 "/auth/sso" req-options)]
             (is (partial= {:status 200
                            :headers {"Content-Type" "text/html"}}
                           response))
             (is (str/includes? (:body response) "SAML_AUTH_COMPLETE"))
             (is (str/includes? (:body response) "authData")))))))))

(deftest non-string-saml-attributes-dropped-test
  (testing "SAML attributes with non-string values are dropped"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (do-with-some-validators-disabled!
         (fn []
           ;; Mock the saml-response->attributes function to return mixed attribute types
           (with-redefs [saml.p/saml-response->attributes
                         (fn [_]
                           {"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" "rasta@metabase.com"
                            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname" "Rasta"
                            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname" "Toucan"
                            "string_attr" "valid-string"
                            "number_attr" 42
                            "boolean_attr" true
                            "array_attr" ["item1" "item2"]
                            "object_attr" {:nested "value"}
                            "null_attr" nil})]
             (let [req-options (saml-post-request-options (saml-test-response)
                                                          default-redirect-uri)
                   response    (client/client-real-response :post 302 "/auth/sso" req-options)]
               (is (successful-login? response))

               ;; Doesn't test the warning message because there are issues setting up log capture with client-real-response
               ;; and client-full-response doesn't work with the saml lib

               (testing "only string attributes are saved to login_attributes"
                 (let [user-attrs (t2/select-one-fn :login_attributes :model/User :email "rasta@metabase.com")]
                   (is (=? {"string_attr" "valid-string"
                            "number_attr" "42"
                            "boolean_attr" "true"} user-attrs))))))))))))

;;; ------------------------------------------------ Tenant Tests ----------------------------------------------------

(defn- new-user-with-tenant-saml-test-response []
  (saml-response-from-file "test_resources/saml-test-response-new-user-with-tenant.xml"))

(deftest tenants-can-be-auto-provisioned-via-saml
  (with-other-sso-types-disabled!
    (mt/with-model-cleanup [:model/Tenant]
      (with-saml-default-setup!
        (mt/with-additional-premium-features #{:tenants}
          (mt/with-temporary-setting-values [use-tenants true
                                             saml-attribute-tenant "tenant"]
            (do-with-some-validators-disabled!
             (fn []
               (mt/with-model-cleanup [:model/User :model/Collection :model/Tenant]
                 (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                              default-redirect-uri)
                       response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                   (is (successful-login? response))
                   (is (some? (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com")))
                   (is (t2/exists? :model/Tenant :slug "tenant-mctenantson")))
                 (testing "they should be able to log in again"
                   (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                     (is (successful-login? response)))))))))))))

(deftest new-users-should-be-set-to-the-correct-tenant-via-saml
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true
                                           saml-attribute-tenant "tenant"]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                        :name "Tenant McTenantson"}]
            (do-with-some-validators-disabled!
             (fn []
               (mt/with-model-cleanup [:model/User]
                 (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                              default-redirect-uri)
                       response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                   (is (successful-login? response))
                   (is (= tenant-id (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com"))))
                 (testing "they should be able to log in again"
                   (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                     (is (successful-login? response))
                     (is (= tenant-id (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com"))))))))))))))

(deftest new-users-are-not-assigned-a-tenant-if-tenants-is-not-enabled-via-saml
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (mt/with-temporary-setting-values [use-tenants true
                                         saml-attribute-tenant "tenant"]
        (mt/with-temp [:model/Tenant _ {:slug "tenant-mctenantson"
                                        :name "Tenant McTenantson"}]
          (do-with-some-validators-disabled!
           (fn []
             (mt/with-model-cleanup [:model/User]
               (mt/with-temporary-setting-values [use-tenants false]
                 (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                              default-redirect-uri)
                       response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                   (testing "They are able to log in"
                     (is (successful-login? response)))
                   (testing "But don't get assigned a tenant"
                     (is (nil? (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com"))))))
               (testing "they should be able to log in without the tenant attribute configured"
                 (mt/with-temporary-setting-values [saml-attribute-tenant nil]
                   (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                     (is (successful-login? response))
                     (is (nil? (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com"))))))))))))))

(deftest a-user-can-log-into-deactivated-tenant-via-saml
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true
                                           saml-attribute-tenant "tenant"]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                        :name "Tenant McTenantson"
                                                        :is_active false}
                         :model/User {existing-email :email} {:tenant_id tenant-id}]
            (do-with-some-validators-disabled!
             (fn []
               (testing "a new user fails to log in"
                 (mt/with-model-cleanup [:model/User]
                   (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                     (is (successful-login? response)))))
               (testing "an existing user also fails to log in"
                 (with-redefs [saml.p/saml-response->attributes
                               (fn [_]
                                 {"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" existing-email
                                  "tenant" "tenant-mctenantson"})]
                   (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 302 "/auth/sso" req-options)]
                     (is (successful-login? response)))))))))))))

(deftest a-user-can-not-log-into-deactivated-tenant-via-saml-if-provisioning-is-off
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true
                                           saml-attribute-tenant "tenant"]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                        :name "Tenant McTenantson"
                                                        :is_active false}
                         :model/User {existing-email :email} {:tenant_id tenant-id}]
            (with-redefs [sso-settings/saml-user-provisioning-enabled? (constantly false)]
              (do-with-some-validators-disabled!
               (fn []
                 (testing "a new user fails to log in"
                   (mt/with-model-cleanup [:model/User]
                     (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                                  default-redirect-uri)
                           response    (client/client-real-response :post 401 "/auth/sso" req-options)]
                       (is (not (successful-login? response))))))
                 (testing "an existing user also fails to log in"
                   (with-redefs [saml.p/saml-response->attributes
                                 (fn [_]
                                   {"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" existing-email
                                    "tenant" "tenant-mctenantson"})]
                     (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                                  default-redirect-uri)
                           response    (client/client-real-response :post 401 "/auth/sso" req-options)]
                       (is (not (successful-login? response)))))))))))))))

(deftest a-tenant-cannot-be-changed-once-set-via-saml
  (with-other-sso-types-disabled!
    (with-saml-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true
                                           saml-attribute-tenant "tenant"]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                        :name "Tenant McTenantson"}
                         :model/Tenant _ {:slug "other"
                                          :name "Other"}
                         :model/User {email-with-tenant :email} {:tenant_id tenant-id}]
            (do-with-some-validators-disabled!
             (fn []
               (testing "tenant -> other tenant fails with correct error message"
                 (with-redefs [saml.p/saml-response->attributes
                               (fn [_]
                                 {"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" email-with-tenant
                                  "tenant" "other"})]
                   (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 401 "/auth/sso" req-options)]
                     (is (not (successful-login? response))))))))))))))

(deftest external-user-requires-tenant-claim-via-saml
  (testing "External user must include tenant claim in SAML response"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (mt/with-additional-premium-features #{:tenants}
          (mt/with-temporary-setting-values [use-tenants true
                                             saml-attribute-tenant "tenant"]
            (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                          :name "Tenant McTenantson"}
                           :model/User {email-with-tenant :email} {:tenant_id tenant-id}]
              (do-with-some-validators-disabled!
               (fn []
                 ;; Use the regular new-user response which doesn't have tenant attribute
                 (with-redefs [saml.p/saml-response->attributes
                               (fn [_]
                                 {"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" email-with-tenant})]
                   (let [req-options (saml-post-request-options (new-user-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 401 "/auth/sso" req-options)]
                     (is (not (successful-login? response))))))))))))))

(deftest internal-user-cannot-have-tenant-claim-via-saml
  (testing "Internal user cannot log in with tenant claim in SAML response"
    (with-other-sso-types-disabled!
      (with-saml-default-setup!
        (mt/with-additional-premium-features #{:tenants}
          (mt/with-temporary-setting-values [use-tenants true
                                             saml-attribute-tenant "tenant"]
            (mt/with-temp [:model/Tenant _ {:slug "tenant-mctenantson"
                                            :name "Tenant McTenantson"}
                           :model/User {email-without-tenant :email} {:tenant_id nil}]
              (do-with-some-validators-disabled!
               (fn []
                 (with-redefs [saml.p/saml-response->attributes
                               (fn [_]
                                 {"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" email-without-tenant
                                  "tenant" "tenant-mctenantson"})]
                   (let [req-options (saml-post-request-options (new-user-with-tenant-saml-test-response)
                                                                default-redirect-uri)
                         response    (client/client-real-response :post 401 "/auth/sso" req-options)]
                     (is (not (successful-login? response))))))))))))))
