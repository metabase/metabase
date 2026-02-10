(ns metabase-enterprise.sso.integrations.oidc-from-settings-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.sso.oidc.state :as oidc.state]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.encryption :as encryption]
   [methodical.core :as methodical]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(def ^:private test-encryption-key
  "Test encryption key for OIDC state encryption."
  "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ=")

(def ^:private test-secret
  "Hashed test encryption key."
  (encryption/secret-key->hash test-encryption-key))

(defmacro ^:private with-test-encryption!
  "Wraps body with test encryption key enabled."
  [& body]
  `(with-redefs [encryption/default-secret-key test-secret]
     ~@body))

(defn- do-with-url-prefix-disabled
  "Test fixture that disables API URL prefix."
  [thunk]
  (binding [client/*url-prefix* ""]
    (thunk)))

(use-fixtures :each do-with-url-prefix-disabled)

(def ^:private test-provider
  {:name          "test-idp"
   :display-name  "Test IdP"
   :issuer-uri    "https://test.idp.example.com"
   :client-id     "test-client-id"
   :client-secret "test-client-secret"
   :scopes        ["openid" "email" "profile"]
   :enabled       true})

;; Mock OIDC authentication for tests
(methodical/defmethod auth-identity/authenticate :provider/test-oidc-successful
  [_provider request]
  (if (some #(contains? request %) [:code :error :state])
    {:success? true
     :claims {}
     :user-data {:email "oidcuser@example.com"}
     :provider-id "test-oidc-provider-id"}
    {:success? :redirect
     :redirect-url "https://test.idp.example.com/authorize"
     :state "test-state"
     :nonce "test-nonce"}))

(methodical/prefer-method! #'auth-identity/authenticate :provider/test-oidc-successful :provider/oidc)

(defmacro ^:private with-successful-oidc! [& body]
  `(do
     (derive :provider/oidc-from-settings :provider/test-oidc-successful)
     ~@body
     (underive :provider/oidc-from-settings :provider/test-oidc-successful)))

(defmacro ^:private with-oidc-default-setup! [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-premium-features #{:audit-app}
       (sso.test-setup/do-with-other-sso-types-disabled!
        (fn []
          (mt/with-additional-premium-features #{:sso-oidc}
            (sso.test-setup/call-with-login-attributes-cleared!
             (fn []
               (mt/with-temporary-setting-values
                 [sso-oidc-providers       [test-provider]
                  oidc-user-provisioning-enabled? true
                  site-url                 (format "http://localhost:%s" (mt/config-str :mb-jetty-port))]
                 ~@body)))))))))

;;; -------------------------------------------------- Prerequisites Tests --------------------------------------------------

(deftest sso-prereqs-test
  (testing "SSO requests fail without :sso-oidc feature"
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [sso-oidc-providers [test-provider]]
        (is (= 402
               (:status (mt/client-full-response :get 402 "/auth/sso/test-idp"
                                                 {:request-options {:redirect-strategy :none}}))))))))

(deftest provider-not-found-test
  (testing "SSO requests fail if provider slug doesn't exist"
    (with-test-encryption!
      (with-oidc-default-setup!
        (with-successful-oidc!
          (let [response (mt/client-full-response :get 404 "/auth/sso/nonexistent"
                                                  {:request-options {:redirect-strategy :none}})]
            (is (= 404 (:status response)))))))))

(deftest provider-not-enabled-test
  (testing "SSO requests fail if provider is not enabled"
    (with-test-encryption!
      (mt/with-additional-premium-features #{:sso-oidc}
        (mt/with-temporary-setting-values
          [sso-oidc-providers [(assoc test-provider :enabled false)]
           site-url           (format "http://localhost:%s" (mt/config-str :mb-jetty-port))]
          (with-successful-oidc!
            (let [response (mt/client-full-response :get 400 "/auth/sso/test-idp"
                                                    {:request-options {:redirect-strategy :none}})]
              (is (= 400 (:status response))))))))))

;;; -------------------------------------------------- Redirect Tests --------------------------------------------------

(deftest redirect-test
  (testing "with OIDC provider configured, GET /auth/sso/:slug redirects to IdP"
    (with-test-encryption!
      (with-oidc-default-setup!
        (with-successful-oidc!
          (let [result (mt/client-full-response :get 302 "/auth/sso/test-idp"
                                                {:request-options {:redirect-strategy :none}}
                                                :redirect "/")
                redirect-url (get-in result [:headers "Location"])
                oidc-state-cookie (->> (get-in result [:headers "Set-Cookie"])
                                       (filter #(str/includes? % "metabase.OIDC_STATE"))
                                       first)]
            (is (str/starts-with? redirect-url "https://test.idp.example.com/authorize"))
            (testing "OIDC state is stored in encrypted cookie"
              (is (some? oidc-state-cookie))
              (let [cookie-value (second (re-find #"metabase\.OIDC_STATE=([^;]+)" oidc-state-cookie))]
                (is (some? cookie-value))
                (let [state-data (oidc.state/decrypt-state (codec/url-decode cookie-value))]
                  (is (= "test-state" (:state state-data)))
                  (is (= "test-nonce" (:nonce state-data)))
                  (is (= "/" (:redirect state-data))))))))))))

;;; -------------------------------------------------- Callback Tests --------------------------------------------------

(deftest callback-missing-state-cookie-test
  (testing "callback fails if state cookie is missing"
    (with-test-encryption!
      (with-oidc-default-setup!
        (let [response (mt/client-full-response :get 401 "/auth/sso/test-idp/callback"
                                                {:request-options {:redirect-strategy :none}}
                                                :code "test-code"
                                                :state "some-state")]
          (is (str/includes? (:body response) "OIDC state cookie is invalid, expired, or missing")))))))

(deftest happy-path-callback-test
  (testing "successful callback with valid code and state creates session"
    (with-test-encryption!
      (with-oidc-default-setup!
        (with-successful-oidc!
          ;; Initiate auth to set state cookie
          (let [init-response (mt/client-full-response :get 302 "/auth/sso/test-idp"
                                                       {:request-options {:redirect-strategy :none}}
                                                       :redirect "/")
                set-cookies (get-in init-response [:headers "Set-Cookie"])
                cookie-header (->> set-cookies
                                   (map #(first (str/split % #";")))
                                   (str/join "; "))
                response (mt/client-real-response :get 302 "/auth/sso/test-idp/callback"
                                                  {:request-options {:redirect-strategy :none
                                                                     :headers {"Cookie" cookie-header}}}
                                                  :code "test-code"
                                                  :state "test-state")]
            (is (sso.test-setup/successful-login? response))
            (is (= "/" (get-in response [:headers "Location"])))))))))

;;; -------------------------------------------------- Open Redirect Protection Tests --------------------------------------------------

(deftest no-open-redirect-test
  (testing "Check that we prevent open redirects to untrusted sites"
    (with-oidc-default-setup!
      (with-successful-oidc!
        (doseq [redirect-uri ["https://badsite.com"
                              "//badsite.com"]]
          (is (= 400
                 (:status (mt/client-full-response :get 400 "/auth/sso/test-idp"
                                                   {:request-options {:redirect-strategy :none}}
                                                   :redirect redirect-uri)))))))))
