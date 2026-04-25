(ns metabase-enterprise.sso.integrations.oidc-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.server.instance :as server.instance]
   [metabase.sso.oidc.state :as oidc.state]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.encryption :as encryption]
   [methodical.core :as methodical]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(def ^:private test-encryption-key
  "Test encryption key for OIDC state encryption."
  "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ=")

(def ^:private test-secret
  "Hashed test encryption key."
  (encryption/secret-key->hash test-encryption-key))

(defmacro ^:private with-ensure-encryption!
  "Ensures an encryption key is available for OIDC state operations.
   Uses the existing encryption key if one is configured, otherwise
   sets a test key. This avoids conflicts with encrypted settings
   in the DB that were written with the real key."
  [& body]
  `(if (encryption/default-encryption-enabled?)
     (do ~@body)
     (with-redefs [encryption/default-secret-key test-secret]
       ~@body)))

(defn- do-with-url-prefix-disabled
  "Test fixture that disables API URL prefix."
  [thunk]
  (binding [client/*url-prefix* ""]
    (thunk)))

(use-fixtures :each do-with-url-prefix-disabled)

(def ^:private test-provider
  {:key            "test-idp"
   :login-prompt   "Test IdP"
   :issuer-uri     "https://test.idp.example.com"
   :client-id      "test-client-id"
   :client-secret  "test-client-secret"
   :scopes         ["openid" "email" "profile"]
   :enabled        true})

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
     (derive :provider/custom-oidc :provider/test-oidc-successful)
     (try
       ~@body
       (finally
         (underive :provider/custom-oidc :provider/test-oidc-successful)))))

(defmacro ^:private with-oidc-default-setup! [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-premium-features #{:audit-app}
       (sso.test-setup/do-with-other-sso-types-disabled!
        (fn []
          (mt/with-additional-premium-features #{:sso-oidc}
            (sso.test-setup/call-with-login-attributes-cleared!
             (fn []
               (mt/with-temporary-setting-values
                 [oidc-providers [test-provider]
                  site-url       (format "http://localhost:%s" (server.instance/server-port))]
                 ~@body)))))))))

;;; -------------------------------------------------- Prerequisites Tests --------------------------------------------------

(deftest provider-not-found-test
  (testing "SSO requests fail if provider key doesn't exist"
    (with-oidc-default-setup!
      (with-ensure-encryption!
        (with-successful-oidc!
          (let [response (mt/client-full-response :get 404 "/auth/sso/nonexistent"
                                                  {:request-options {:redirect-strategy :none}})]
            (is (= 404 (:status response)))))))))

(deftest provider-not-enabled-test
  (testing "SSO requests fail if provider is not enabled"
    (mt/test-helpers-set-global-values!
      (mt/with-additional-premium-features #{:sso-oidc}
        (mt/with-temporary-setting-values
          [oidc-providers [(assoc test-provider :enabled false)]
           site-url           (format "http://localhost:%s" (server.instance/server-port))]
          (with-ensure-encryption!
            (with-successful-oidc!
              (let [response (mt/client-full-response :get 400 "/auth/sso/test-idp"
                                                      {:request-options {:redirect-strategy :none}})]
                (is (= 400 (:status response)))))))))))

;;; -------------------------------------------------- Redirect Tests --------------------------------------------------

(deftest redirect-test
  (testing "with OIDC provider configured, GET /auth/sso/:key redirects to IdP"
    (with-oidc-default-setup!
      (with-ensure-encryption!
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
    (with-oidc-default-setup!
      (with-ensure-encryption!
        (let [response (mt/client-full-response :get 401 "/auth/sso/test-idp/callback"
                                                {:request-options {:redirect-strategy :none}}
                                                :code "test-code"
                                                :state "some-state")]
          (is (str/includes? (:body response) "OIDC state cookie is invalid, expired, or missing")))))))

(deftest happy-path-callback-test
  (testing "successful callback with valid code and state creates session"
    (with-oidc-default-setup!
      (with-ensure-encryption!
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
      (with-ensure-encryption!
        (with-successful-oidc!
          (doseq [redirect-uri ["https://badsite.com"
                                "//badsite.com"]]
            (is (= 400
                   (:status (mt/client-full-response :get 400 "/auth/sso/test-idp"
                                                     {:request-options {:redirect-strategy :none}}
                                                     :redirect redirect-uri))))))))))

;;; -------------------------------------------------- Group Sync Tests --------------------------------------------------

(def ^:private ^:dynamic *group-sync-claims*
  "Dynamic var to control what claims the group sync mock returns."
  {:groups ["test-group"]})

(def ^:private ^:dynamic *group-sync-email*
  "Dynamic var to control the email returned by the group sync mock."
  "oidc-group-user@example.com")

;; Mock that returns claims with group membership
(methodical/defmethod auth-identity/authenticate :provider/test-oidc-with-groups
  [_provider request]
  (if (some #(contains? request %) [:code :error :state])
    {:success?    true
     :claims      *group-sync-claims*
     :user-data   {:email      *group-sync-email*
                   :first_name "OIDC"
                   :last_name  "GroupUser"}
     :provider-id "test-oidc-provider-id"}
    {:success?     :redirect
     :redirect-url "https://test.idp.example.com/authorize"
     :state        "test-state"
     :nonce        "test-nonce"}))

(methodical/prefer-method! #'auth-identity/authenticate :provider/test-oidc-with-groups :provider/oidc)

(defmacro ^:private with-group-sync-oidc! [& body]
  `(do
     (derive :provider/custom-oidc :provider/test-oidc-with-groups)
     (try
       ~@body
       (finally
         (underive :provider/custom-oidc :provider/test-oidc-with-groups)))))

(defn- do-with-group-sync-login!
  "Helper that sets up the OIDC provider with group sync config, performs a login, and calls `f`
   with the login result."
  [provider-config claims email f]
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:audit-app}
      (sso.test-setup/do-with-other-sso-types-disabled!
       (fn []
         (mt/with-additional-premium-features #{:sso-oidc}
           (sso.test-setup/call-with-login-attributes-cleared!
            (fn []
              (mt/with-temporary-setting-values
                [oidc-providers [provider-config]]
                (binding [*group-sync-claims* claims
                          *group-sync-email*  email]
                  (with-group-sync-oidc!
                    (with-redefs [oidc.state/validate-oidc-callback
                                  (fn [_request _state _provider & _opts]
                                    {:valid? true :nonce "test-nonce" :redirect "/"})]
                      (let [result (auth-identity/login!
                                    :provider/custom-oidc
                                    {:oidc-provider-key "test-idp"
                                     :code              "test-code"
                                     :state             "test-state"})]
                        (f result))))))))))))))

(deftest oidc-group-sync-test
  (testing "OIDC login with group sync enabled adds user to mapped groups"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name (str "OIDC Test Group " (random-uuid))}]
      (let [provider-config (assoc test-provider
                                   :group-sync {:enabled         true
                                                :group-attribute "groups"
                                                :group-mappings  {:test-group [group-id]}})]
        (do-with-group-sync-login!
         provider-config {:groups ["test-group"]} "oidc-group-user@example.com"
         (fn [result]
           (is (true? (:success? result)) (str "login result: " (pr-str result)))
           (testing "user is added to the mapped group"
             (let [user (t2/select-one :model/User :%lower.email "oidc-group-user@example.com")]
               (is (some? user))
               (is (contains?
                    (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id user))
                    group-id))))))))))

(deftest oidc-group-sync-disabled-test
  (testing "Group sync disabled — should not sync even with mappings configured"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name (str "OIDC No-Sync Group " (random-uuid))}]
      (let [email           (str "oidc-nosync-" (random-uuid) "@example.com")
            provider-config (assoc test-provider
                                   :group-sync {:enabled         false
                                                :group-attribute "groups"
                                                :group-mappings  {:test-group [group-id]}})]
        (do-with-group-sync-login!
         provider-config {:groups ["test-group"]} email
         (fn [result]
           (is (true? (:success? result)))
           (testing "user is NOT added to the mapped group because sync is disabled"
             (let [user (t2/select-one :model/User :%lower.email email)]
               (is (some? user))
               (is (not (contains?
                         (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id user))
                         group-id)))))))))))

(deftest oidc-group-sync-no-mappings-test
  (testing "No mappings configured — should not add user to any extra groups"
    (let [email           (str "oidc-nomap-" (random-uuid) "@example.com")
          provider-config (assoc test-provider
                                 :group-sync {:enabled         true
                                              :group-attribute "groups"
                                              :group-mappings  {}})]
      (do-with-group-sync-login!
       provider-config {:groups ["test-group"]} email
       (fn [result]
         (is (true? (:success? result)))
         (testing "user exists but only has the All Users group"
           (let [user (t2/select-one :model/User :%lower.email email)]
             (is (some? user))
             ;; All Users group (id=1) is the only group
             (is (= #{1} (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id user)))))))))))

(deftest oidc-group-sync-single-string-value-test
  (testing "Single group value (string instead of array) should still work"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name (str "OIDC String Group " (random-uuid))}]
      (let [email           (str "oidc-strgrp-" (random-uuid) "@example.com")
            provider-config (assoc test-provider
                                   :group-sync {:enabled         true
                                                :group-attribute "groups"
                                                :group-mappings  {:single-group [group-id]}})]
        (do-with-group-sync-login!
         provider-config {:groups "single-group"} email
         (fn [result]
           (is (true? (:success? result)))
           (testing "user is added to the mapped group even with a string claim value"
             (let [user (t2/select-one :model/User :%lower.email email)]
               (is (some? user))
               (is (contains?
                    (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id user))
                    group-id))))))))))

(deftest oidc-group-sync-removal-test
  (testing "Group removal — user removed from old mapped groups on re-login"
    (mt/with-temp [:model/PermissionsGroup {group-a-id :id} {:name (str "OIDC Group A " (random-uuid))}
                   :model/PermissionsGroup {group-b-id :id} {:name (str "OIDC Group B " (random-uuid))}]
      (let [email           (str "oidc-removal-" (random-uuid) "@example.com")
            provider-config (assoc test-provider
                                   :group-sync {:enabled         true
                                                :group-attribute "groups"
                                                :group-mappings  {:group-a [group-a-id]
                                                                  :group-b [group-b-id]}})]
        ;; First login: user has both groups
        (do-with-group-sync-login!
         provider-config {:groups ["group-a" "group-b"]} email
         (fn [result]
           (is (true? (:success? result)))
           (let [user (t2/select-one :model/User :%lower.email email)]
             (is (some? user))
             (let [group-ids (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id user))]
               (is (contains? group-ids group-a-id))
               (is (contains? group-ids group-b-id))))))
        ;; Second login: user only has group-a — should be removed from group-b
        (do-with-group-sync-login!
         provider-config {:groups ["group-a"]} email
         (fn [result]
           (is (true? (:success? result)))
           (testing "user is removed from group-b but still in group-a"
             (let [user      (t2/select-one :model/User :%lower.email email)
                   group-ids (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id user))]
               (is (contains? group-ids group-a-id))
               (is (not (contains? group-ids group-b-id)))))))))))

(deftest oidc-group-sync-custom-attribute-test
  (testing "Non-default group attribute — using a custom claim name"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name (str "OIDC Custom Attr Group " (random-uuid))}]
      (let [email           (str "oidc-custom-attr-" (random-uuid) "@example.com")
            provider-config (assoc test-provider
                                   :group-sync {:enabled         true
                                                :group-attribute "roles"
                                                :group-mappings  {:admin-role [group-id]}})]
        (do-with-group-sync-login!
         provider-config {:roles ["admin-role"]} email
         (fn [result]
           (is (true? (:success? result)))
           (testing "user is added to the mapped group via custom claim attribute"
             (let [user (t2/select-one :model/User :%lower.email email)]
               (is (some? user))
               (is (contains?
                    (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id user))
                    group-id))))))))))

(deftest oidc-group-sync-string-keys-in-claims-test
  (testing "Claims with string keys (not keyword keys) should still work"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name (str "OIDC StrKey Group " (random-uuid))}]
      (let [email           (str "oidc-strkey-" (random-uuid) "@example.com")
            provider-config (assoc test-provider
                                   :group-sync {:enabled         true
                                                :group-attribute "groups"
                                                :group-mappings  {:my-team [group-id]}})]
        (do-with-group-sync-login!
         provider-config {"groups" ["my-team"]} email
         (fn [result]
           (is (true? (:success? result)))
           (testing "user is added to the mapped group even with string-keyed claims"
             (let [user (t2/select-one :model/User :%lower.email email)]
               (is (some? user))
               (is (contains?
                    (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id user))
                    group-id))))))))))
