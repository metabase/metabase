(ns metabase-enterprise.sso.integrations.saml-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.saml :as saml.mt]
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [metabase.http-client :as client]
   [metabase.models.permissions-group :refer [PermissionsGroup]]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.models.user :refer [User]]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [ring.util.codec :as codec]
   [saml20-clj.core :as saml]
   [saml20-clj.encode-decode :as encode-decode]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.net URL)
   (java.nio.charset StandardCharsets)
   (org.apache.http.client.utils URLEncodedUtils)
   (org.apache.http.message BasicNameValuePair)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- disable-other-sso-types [thunk]
  (classloader/require 'metabase.api.ldap)
  (let [current-features (premium-features/*token-features*)]
    ;; The :sso-jwt token is needed to set the jwt-enabled setting
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:sso-jwt}
        (mt/with-temporary-setting-values [ldap-enabled false
                                           jwt-enabled  false]
          (mt/with-premium-features current-features
            (thunk)))))))

(use-fixtures :each disable-other-sso-types)

(def ^:private default-idp-uri            "http://test.idp.metabase.com")
(def ^:private default-redirect-uri       "http://localhost:3000/test")
(def ^:private default-idp-uri-with-param (str default-idp-uri "?someparam=true"))
(def ^:private default-idp-cert           (slurp "test_resources/sso/auth0-public-idp.cert"))

(defn call-with-default-saml-config [f]
  (let [current-features (premium-features/*token-features*)]
    (mt/with-premium-features #{:sso-saml}
      (mt/with-temporary-setting-values [saml-enabled                       true
                                         saml-identity-provider-uri         default-idp-uri
                                         saml-identity-provider-certificate default-idp-cert
                                         saml-keystore-path                 nil
                                         saml-keystore-password             nil
                                         saml-keystore-alias                nil]
        (mt/with-premium-features current-features
          (f))))))

(defmacro with-default-saml-config [& body]
  `(call-with-default-saml-config
    (fn []
      ~@body)))

(defn call-with-login-attributes-cleared!
  "If login_attributes remain after these tests run, depending on the order that the tests run, lots of tests will
  fail as the login_attributes data from this tests is unexpected in those other tests"
  [f]
  (try
    (f)
    (finally
      (u/ignore-exceptions (do (t2/update! User {} {:login_attributes nil})
                               (t2/update! User {:email "rasta@metabase.com"} {:first_name "Rasta" :last_name "Toucan" :sso_source nil}))))))

(defmacro with-saml-default-setup [& body]
  ;; most saml tests make actual http calls, so ensuring any nested with-temp doesn't create transaction
  `(mt/test-helpers-set-global-values!
     (mt/with-additional-premium-features #{:sso-saml}
       (call-with-login-attributes-cleared!
         (fn []
           (call-with-default-saml-config
            (fn []
              ~@body)))))))

(defn client
  "Same as `client/client` but doesn't include the `/api` in the URL prefix"
  [& args]
  (binding [client/*url-prefix* ""]
    (apply client/real-client args)))

(defn client-full-response
  "Same as `client/client-full-response` but doesn't include the `/api` in the URL prefix"
  [& args]
  (binding [client/*url-prefix* ""]
    (apply client/client-real-response args)))

(defn successful-login?
  "Return true if the response indicates a successful user login"
  [resp]
  (string? (get-in resp [:cookies mw.session/metabase-session-cookie :value])))

(defn- do-with-some-validators-disabled
  "The sample responses all have `InResponseTo=\"_1\"` and invalid assertion signatures (they were edited by hand) so
  manually add `_1` to the state manager and turn off the <Assertion> signature validator so we can actually run
  tests."
  {:style/indent [:defn 2]}
  ([f]
   (do-with-some-validators-disabled nil #{:signature :not-on-or-after :recipient :issuer}
     f))

  ([disabled-response-validators disabled-assertion-validators f]
   (let [orig              saml/validate
         remove-validators (fn [options]
                             (-> options
                                 (update :response-validators #(set/difference (set %) (set disabled-response-validators)))
                                 (update :assertion-validators #(set/difference (set %) (set disabled-assertion-validators)))))]
     (with-redefs [saml/validate (fn f
                                   ([response idp-cert sp-private-key]
                                    (f response idp-cert sp-private-key saml/default-validation-options))
                                   ([response idp-cert sp-private-key options]
                                    (let [options (merge saml/default-validation-options options)]
                                      (orig response idp-cert sp-private-key (remove-validators options)))))]
       (f)))))

(deftest validate-certificate-test
  (testing "make sure our test certificate is actually valid"
    (is (some? (#'sso-settings/validate-saml-idp-cert default-idp-cert)))))

(deftest require-valid-premium-features-token-test
  (testing "SSO requests fail if they don't have a valid premium-features token"
    (mt/with-premium-features #{}
      (with-default-saml-config
        (is (= "SSO has not been enabled and/or configured"
               (client :get 400 "/auth/sso")))))))

(deftest require-saml-enabled-test
  (mt/with-premium-features #{:sso-saml}
    (testing "SSO requests fail if SAML hasn't been configured or enabled"
      (mt/with-temporary-setting-values [saml-enabled                       false
                                         saml-identity-provider-uri         nil
                                         saml-identity-provider-certificate nil]
        (is (some? (client :get 400 "/auth/sso")))))

    (testing "SSO requests fail if SAML has been configured but not enabled"
      (mt/with-temporary-setting-values [saml-enabled                       false
                                         saml-identity-provider-uri         default-idp-uri
                                         saml-identity-provider-certificate default-idp-cert]
        (is (some? (client :get 400 "/auth/sso")))))

    (testing "SSO requests fail if SAML is enabled but hasn't been configured"
      (mt/with-temporary-setting-values [saml-enabled               true
                                         saml-identity-provider-uri nil]
        (is (some? (client :get 400 "/auth/sso")))))

    (testing "The IDP provider certificate must also be included for SSO to be configured"
      (mt/with-temporary-setting-values [saml-enabled                       true
                                         saml-identity-provider-uri         default-idp-uri
                                         saml-identity-provider-certificate nil]
        (is (some? (client :get 400 "/auth/sso")))))))

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
        (let [orig saml/request]
          (with-redefs [saml/request (fn [m]
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
                   (saml/base64->str (:RelayState (uri->params-map redirect-url)))))))))))

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
                                        :RelayState   relay-state}}})

(defn- some-saml-attributes [user-nickname]
  {"http://schemas.auth0.com/identities/default/provider"   "auth0"
   "http://schemas.auth0.com/nickname"                      user-nickname
   "http://schemas.auth0.com/identities/default/connection" "Username-Password-Authentication"})

(defn- saml-login-attributes [email]
  (let [attribute-keys (keys (some-saml-attributes nil))]
    (-> (t2/select-one-fn :login_attributes User :email email)
        (select-keys attribute-keys))))

(deftest validate-request-id-test
  (testing "Sample response should fail because _1 isn't a request ID that we issued."
    (with-saml-default-setup
      (do-with-some-validators-disabled
        (fn []
          (testing (str "After a successful login with the identity provider, the SAML provider will POST to the "
                        "`/auth/sso` route.")
            (let [req-options (saml-post-request-options (saml-test-response)
                                                         (saml/str->base64 default-redirect-uri))
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
                                                       (saml/str->base64 default-redirect-uri))]
            (is (not (successful-login? (client-full-response :post 401 "/auth/sso" req-options))))))))
    (testing "If we time-travel then the sample responses *should* work"
      (let [orig saml/validate]
        (with-redefs [saml/validate (fn [& args]
                                      (mt/with-clock #t "2018-07-01T00:00:00.000Z"
                                        (apply orig args)))]
          (do-with-some-validators-disabled nil #{:signature :recipient :issuer}
            (fn []
              (let [req-options (saml-post-request-options (saml-test-response)
                                                           (saml/str->base64 default-redirect-uri))]
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
                                                           (saml/str->base64 default-redirect-uri))]
                (is (not (successful-login? (client-full-response :post 401 "/auth/sso" req-options)))))))
          (testing "with correct acs-url"
            (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
              (let [req-options (saml-post-request-options (saml-test-response)
                                                           (saml/str->base64 default-redirect-uri))]
                (is (successful-login? (client-full-response :post 302 "/auth/sso" req-options)))))))))))

(deftest validate-issuer-test
  (with-saml-default-setup
    (testing "If the `saml-identity-provider-issuer` Setting is set, we should validate <Issuer> in Responses"
      (do-with-some-validators-disabled nil #{:signature :not-on-or-after :recipient}
        (letfn [(login [expected-status-code]
                  (let [req-options (saml-post-request-options (saml-test-response)
                                                               (saml/str->base64 default-redirect-uri))]
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
  (testing "After a successful login with the identity provider, the SAML provider will POST to the `/auth/sso` route."
    (with-saml-default-setup
      (do-with-some-validators-disabled
        (fn []
          (let [req-options (saml-post-request-options (saml-test-response)
                                                       (saml/str->base64 default-redirect-uri))
                response    (client-full-response :post 302 "/auth/sso" req-options)]
            (is (successful-login? response))
            (is (= default-redirect-uri
                   (get-in response [:headers "Location"])))
            (is (= (some-saml-attributes "rasta")
                   (saml-login-attributes "rasta@metabase.com"))))))))
  (testing "Still works with whitespace in the SAML post response (#23451)"
    (with-saml-default-setup
      (do-with-some-validators-disabled
        (fn []
          (let [req-options (saml-post-request-options (whitespace-response)
                                                       (saml/str->base64 default-redirect-uri))
                response    (client-full-response :post 302 "/auth/sso" req-options)]
            (is (successful-login? response))
            (is (= default-redirect-uri
                   (get-in response [:headers "Location"])))
            (is (= (some-saml-attributes "rasta")
                   (saml-login-attributes "rasta@metabase.com")))))))))

(deftest jwt-saml-both-enabled-saml-success-test
  (mt/with-additional-premium-features #{:sso-jwt}
    (testing "with SAML and JWT configured, a GET request without JWT params successfully logins with SAML."
      (with-saml-default-setup
        (do-with-some-validators-disabled
         (fn []
           (let [req-options (saml-post-request-options (saml-test-response)
                                                        (saml/str->base64 default-redirect-uri))
                 response    (client-full-response :post 302 "/auth/sso" req-options)]
             (is (successful-login? response))
             (is (= default-redirect-uri
                    (get-in response [:headers "Location"])))
             (is (= (some-saml-attributes "rasta")
                    (saml-login-attributes "rasta@metabase.com"))))))))))

(deftest login-invalid-relay-state-test
  (testing (str "if the RelayState is not set or is invalid, you are redirected back to the home page rather than "
                "failing the entire login")
    (doseq [relay-state ["something-random_#!@__^^"
                         ""
                         "   "
                         "/"
                         "https://badsite.com"
                         "//badsite.com"]]
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
                       (saml-login-attributes "rasta@metabase.com"))))))))))

  (testing "if the RelayState leads us to the wrong host, avoid the open redirect (boat#160)"
    (doseq [redirect-url ["https://badsite.com"
                          "//badsite.com"]]
      (with-saml-default-setup
        (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
          (do-with-some-validators-disabled
            (fn []
             (let [get-response (client :get 400 "/auth/sso"
                                  {:request-options {:redirect-strategy :none}}
                                  :redirect redirect-url)]
               (is (= "Invalid redirect URL" (:message get-response)))))))))))

(deftest login-create-account-test
  (testing "A new account will be created for a SAML user we haven't seen before"
    (mt/with-premium-features #{:audit-app}
      (do-with-some-validators-disabled
       (fn []
         (with-saml-default-setup
           (try
            (is (not (t2/exists? User :%lower.email "newuser@metabase.com")))
            (let [req-options (saml-post-request-options (new-user-saml-test-response)
                                                         (saml/str->base64 default-redirect-uri))]
              (is (successful-login? (client-full-response :post 302 "/auth/sso" req-options))))
            (let [new-user (t2/select-one User :email "newuser@metabase.com")]
              (is (= {:email        "newuser@metabase.com"
                      :first_name   "New"
                      :is_qbnewb    true
                      :is_superuser false
                      :id           true
                      :last_name    "User"
                      :date_joined  true
                      :common_name  "New User"}
                     (-> (mt/boolean-ids-and-timestamps new-user)
                         (dissoc :last_login))))
              (testing "User Invite Event is logged."
                (is (= {:details  {:email      "newuser@metabase.com"
                                   :first_name "New"
                                   :last_name  "User"
                                   :user_group_memberships [{:id 1}]
                                   :sso_source "saml"}
                        :model    "User"
                        :model_id (:id new-user)
                        :topic    :user-invited
                        :user_id  nil}
                       (mt/latest-audit-log-entry :user-invited (:id new-user))))))
            (testing "attributes"
              (is (= (some-saml-attributes "newuser")
                     (saml-login-attributes "newuser@metabase.com"))))
            (finally
             (t2/delete! User :%lower.email "newuser@metabase.com")))))))))

(deftest login-update-account-test
  (testing "A new 'Unknown' name account will be created for a SAML user with no configured first or last name"
    (do-with-some-validators-disabled
      (fn []
        (with-saml-default-setup
          (try
            (is (not (t2/exists? User :%lower.email "newuser@metabase.com")))
            ;; login with a user with no givenname or surname attributes
            (let [req-options (saml-post-request-options (new-user-no-names-saml-test-response)
                                                         (saml/str->base64 default-redirect-uri))]
              (is (successful-login? (client-full-response :post 302 "/auth/sso" req-options)))
              (is (= [{:email        "newuser@metabase.com"
                       :first_name   nil
                       :is_qbnewb    true
                       :is_superuser false
                       :id           true
                       :last_name    nil
                       :date_joined  true
                       :common_name  "newuser@metabase.com"}]
                     (->> (mt/boolean-ids-and-timestamps (t2/select User :email "newuser@metabase.com"))
                          (map #(dissoc % :last_login))))))
            ;; login with the same user, but now givenname and surname attributes exist
            (let [req-options (saml-post-request-options (new-user-saml-test-response)
                                                         (saml/str->base64 default-redirect-uri))]
              (is (successful-login? (client-full-response :post 302 "/auth/sso" req-options)))
              (is (= [{:email        "newuser@metabase.com"
                       :first_name   "New"
                       :is_qbnewb    true
                       :is_superuser false
                       :id           true
                       :last_name    "User"
                       :date_joined  true
                       :common_name  "New User"}]
                     (->> (mt/boolean-ids-and-timestamps (t2/select User :email "newuser@metabase.com"))
                          (map #(dissoc % :last_login))))))
            (finally
              (t2/delete! User :%lower.email "newuser@metabase.com"))))))))

(defn- group-memberships [user-or-id]
  (when-let [group-ids (seq (t2/select-fn-set :group_id PermissionsGroupMembership :user_id (u/the-id user-or-id)))]
    (t2/select-fn-set :name PermissionsGroup :id [:in group-ids])))

(deftest login-should-sync-single-group-membership
  (testing "saml group sync works when there's just a single group, which gets interpreted as a string"
    (with-saml-default-setup
      (do-with-some-validators-disabled
        (fn []
          (t2.with-temp/with-temp [PermissionsGroup group-1 {:name (str ::group-1)}]
            (mt/with-temporary-setting-values [saml-group-sync      true
                                               saml-group-mappings  {"group_1" [(u/the-id group-1)]}
                                               saml-attribute-group "GroupMembership"]
              (try
                ;; user doesn't exist until SAML request
                (is (not (t2/select-one-pk User :%lower.email "newuser@metabase.com")))
                (let [req-options (saml-post-request-options (new-user-with-single-group-saml-test-response)
                                                             (saml/str->base64 default-redirect-uri))
                      response    (client-full-response :post 302 "/auth/sso" req-options)]
                  (is (successful-login? response))
                  (is (= #{"All Users"
                           ":metabase-enterprise.sso.integrations.saml-test/group-1"}
                         (group-memberships (t2/select-one-pk User :email "newuser@metabase.com")))))
                (finally
                  (t2/delete! User :%lower.email "newuser@metabase.com"))))))))))

(deftest login-should-sync-multiple-group-membership
  (testing "saml group sync works when there are multiple groups, which gets interpreted as a list of strings"
    (testing "when only one Attribute node exists"
      (with-saml-default-setup
        (do-with-some-validators-disabled
          (fn []
            (mt/with-temp [PermissionsGroup group-1 {:name (str ::group-1)}
                           PermissionsGroup group-2 {:name (str ::group-2)}]
              (mt/with-temporary-setting-values [saml-group-sync      true
                                                 saml-group-mappings  {"group_1" [(u/the-id group-1)]
                                                                       "group_2" [(u/the-id group-2)]}
                                                 saml-attribute-group "GroupMembership"]
                (try
                  (testing "user doesn't exist until SAML request"
                    (is (not (t2/select-one-pk User :%lower.email "newuser@metabase.com"))))
                  (let [req-options (saml-post-request-options (new-user-with-groups-saml-test-response)
                                                               (saml/str->base64 default-redirect-uri))
                        response    (client-full-response :post 302 "/auth/sso" req-options)]
                    (is (successful-login? response))
                    (is (= #{"All Users"
                             ":metabase-enterprise.sso.integrations.saml-test/group-1"
                             ":metabase-enterprise.sso.integrations.saml-test/group-2"}
                           (group-memberships (t2/select-one-pk User :email "newuser@metabase.com")))))
                  (finally
                    (t2/delete! User :%lower.email "newuser@metabase.com")))))))))
    (testing "when several Attribute nodes exist (issue #20744)"
      (with-saml-default-setup
        (do-with-some-validators-disabled
          (fn []
            (mt/with-temp [PermissionsGroup group-1 {:name (str ::group-1)}
                           PermissionsGroup group-2 {:name (str ::group-2)}]
              (mt/with-temporary-setting-values [saml-group-sync      true
                                                 saml-group-mappings  {"group_1" [(u/the-id group-1)]
                                                                       "group_2" [(u/the-id group-2)]}
                                                 saml-attribute-group "GroupMembership"]
                (try
                  (testing "user doesn't exist until SAML request"
                    (is (not (t2/select-one-pk User :%lower.email "newuser@metabase.com"))))
                  (let [req-options (saml-post-request-options (new-user-with-groups-in-separate-attribute-nodes-saml-test-response)
                                                               (saml/str->base64 default-redirect-uri))
                        response    (client-full-response :post 302 "/auth/sso" req-options)]
                    (is (successful-login? response))
                    (is (= #{"All Users"
                             ":metabase-enterprise.sso.integrations.saml-test/group-1"
                             ":metabase-enterprise.sso.integrations.saml-test/group-2"}
                           (group-memberships (t2/select-one-pk User :email "newuser@metabase.com")))))
                  (finally
                    (t2/delete! User :%lower.email "newuser@metabase.com")))))))))))

(deftest relay-state-e2e-test
  (testing "Redirect URL (RelayState) should work correctly end-to-end (#13666)"
    (with-saml-default-setup
      ;; The test HTTP client will automatically URL encode these for us.
      (doseq [redirect-url ["http://localhost:3001/collection/root"
                            default-redirect-uri
                            "http://localhost:3001/"]]
        (testing (format "\nredirect URL = %s" redirect-url)
          (let [result     (client-full-response :get 302 "/auth/sso"
                                                 {:request-options {:redirect-strategy :none}}
                                                 :redirect redirect-url)
                location   (get-in result [:headers "Location"])
                _          (is (string? location))
                params-map (uri->params-map location)]
            (testing (format "\nresult =\n%s" (u/pprint-to-str params-map))
              (testing "\nRelay state URL should be base-64 encoded"
                (is (= (saml/str->base64 redirect-url)
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

(deftest sso-subpath-e2e-test
  (testing "Redirect URL should correcly append the site-url when the redirect is a relative path (#28650)"
    (with-saml-default-setup
      (doseq [redirect-url ["/collection/root"
                            "/test"
                            "/"]]
        (testing (format "\nredirect URL = %s" redirect-url)
          (mt/with-temporary-setting-values [site-url "http://localhost:3001/path"]
            (let [result     (client-full-response :get 302 "/auth/sso"
                                                   {:request-options {:redirect-strategy :none}}
                                                   :redirect redirect-url)
                  location   (get-in result [:headers "Location"])
                  _          (is (string? location))
                  params-map (uri->params-map location)]
              (testing (format "\nresult =\n%s" (u/pprint-to-str params-map))
                (testing "\nPOST request should redirect to the original redirect URL with the correct site-url path"
                  (do-with-some-validators-disabled
                   (fn []
                     (let [req-options (saml-post-request-options (saml-test-response)
                                                                  (:RelayState params-map))
                           response    (client-full-response :post 302 "/auth/sso" req-options)]
                       (is (successful-login? response))
                       (is (= (str "http://localhost:3001/path" redirect-url)
                              (get-in response [:headers "Location"])))))))))))))))

(deftest create-new-saml-user-no-user-provisioning-test
  (testing "When user provisioning is disabled, throw an error if we attempt to create a new user."
    (with-saml-default-setup
    (with-redefs [sso-settings/saml-user-provisioning-enabled? (constantly false)
                  public-settings/site-name (constantly "test")]
        (is
         (thrown-with-msg?
          clojure.lang.ExceptionInfo
          #"Sorry, but you'll need a test account to view this page. Please contact your administrator."
          (#'saml.mt/fetch-or-create-user! {:first-name "Test"
                                            :last-name  "user"
                                            :email      "test1234@metabsae.com"})))))))

(deftest logout-should-delete-session-test
  (testing "Successful SAML SLO logouts should delete the user's session."
    (let [session-id (str (random-uuid))]
      (mt/with-temp [:model/User user {:email "saml_test@metabase.com" :sso_source "saml"}
                     :model/Session _ {:user_id (:id user) :id session-id}]
        (with-saml-default-setup
          (is (t2/exists? :model/Session :id session-id))
          (let [req-options (-> (saml-post-request-options
                                 (saml-slo-test-response)
                                 (saml/str->base64 default-redirect-uri))
                                ;; Client sends their session cookie during the SLO request redirect from the IDP.
                                (assoc-in [:request-options :cookies mw.session/metabase-session-cookie :value] session-id))
                response    (client-full-response :post 302 "/auth/sso/handle_slo" req-options)]
            (is (str/blank? (get-in response [:cookies mw.session/metabase-session-cookie :value]))
                "After a successful log-out, you don't have a session")
            (is (not (t2/exists? :model/Session :id session-id))
                "After a successful log-out, the session is deleted")))))))
