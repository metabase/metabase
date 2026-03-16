(ns metabase-enterprise.sso.integrations.jwt-test
  (:require
   [buddy.sign.jwt :as jwt]
   [buddy.sign.util :as buddy-util]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.token-utils :as token-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase-enterprise.tenants.auth-provider] ;; make sure the auth provider is actually registered
   [metabase.appearance.settings :as appearance.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(defn- disable-api-url-prefix
  [thunk]
  (binding [client/*url-prefix* ""]
    (thunk)))

(use-fixtures :each disable-api-url-prefix)

(def ^:private default-redirect-uri "/")

;; Reference test-helper values for use in token creation
(def ^:private default-idp-uri sso.test-setup/default-jwt-idp-uri)
(def ^:private default-jwt-secret sso.test-setup/default-jwt-secret)

(defmacro ^:private with-jwt-default-setup!
  "Set up default JWT configuration for tests.
   Delegates to [[sso.test-setup/with-jwt-default-setup!]]."
  [& body]
  `(sso.test-setup/with-jwt-default-setup! ~@body))

(deftest sso-prereqs-test
  (sso.test-setup/do-with-other-sso-types-disabled!
   (fn []
     (mt/with-additional-premium-features #{:sso-jwt}
       (testing "SSO requests fail if JWT hasn't been configured or enabled"
         (mt/with-temporary-setting-values
           [jwt-enabled
            false
            jwt-identity-provider-uri
            nil
            jwt-shared-secret
            nil]
           (is
            (partial=
             {:cause   "SSO has not been enabled and/or configured",
              :data    {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso")))

           (testing "SSO requests fail if they don't have a valid premium-features token"
             (sso.test-setup/call-with-default-jwt-config!
              (fn []
                (mt/with-premium-features #{}
                  (is
                   (partial=
                    {:cause   "SSO has not been enabled and/or configured",
                     :data    {:status "error-sso-disabled", :status-code 400},
                     :message "SSO has not been enabled and/or configured",
                     :status  "error-sso-disabled"}
                    (client/client :get 400 "/auth/sso")))))))))

       (testing "SSO requests fail if JWT is enabled but hasn't been configured"
         (mt/with-temporary-setting-values
           [jwt-enabled
            true
            jwt-identity-provider-uri
            nil]
           (is
            (partial=
             {:cause   "SSO has not been enabled and/or configured",
              :data    {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso")))))

       (testing "SSO requests fail if JWT is configured but hasn't been enabled"
         (mt/with-temporary-setting-values
           [jwt-enabled
            false
            jwt-identity-provider-uri
            default-idp-uri
            jwt-shared-secret
            default-jwt-secret]
           (is
            (partial=
             {:cause   "SSO has not been enabled and/or configured",
              :data    {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso")))))

       (testing "The JWT idp uri must also be included for SSO to be configured"
         (mt/with-temporary-setting-values
           [jwt-enabled true
            jwt-identity-provider-uri nil
            jwt-shared-secret nil]
           (is
            (partial=
             {:cause   "SSO has not been enabled and/or configured",
              :data    {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso")))))

       (testing "The JWT Shared Secret must also be included for SSO to be configured"
         (mt/with-temporary-setting-values
           [jwt-enabled true
            jwt-identity-provider-uri default-idp-uri
            jwt-shared-secret nil]
           (is
            (partial=
             {:cause   "SSO has not been enabled and/or configured",
              :data    {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso")))))))))

(deftest redirect-test
  (testing "with JWT configured, a GET request should result in a redirect to the IdP"
    (with-jwt-default-setup!
      (let [result       (client/client-full-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :redirect default-redirect-uri)
            redirect-url (get-in result [:headers "Location"])]
        (is (str/starts-with? redirect-url default-idp-uri)))))
  (testing
   (str "JWT configured with a redirect-uri containing query params, "
        "a GET request should result in a redirect to the IdP as a correctly formatted URL (#13078)")
    (with-jwt-default-setup!
      (mt/with-temporary-setting-values
        [jwt-identity-provider-uri "http://test.idp.metabase.com/login?some_param=yes"]
        (let [result       (client/client-full-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :redirect default-redirect-uri)
              redirect-url (get-in result [:headers "Location"])]
          (is (str/includes? redirect-url "&return_to=")))))))

(deftest jwt-saml-both-enabled-test
  (with-jwt-default-setup!
    (sso.test-setup/with-saml-default-setup!
      (mt/with-temporary-setting-values [jwt-enabled true]
        (testing "with SAML and JWT configured, a GET request with JWT params should sign in correctly"
          (let [response (client/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :jwt
                                                      (jwt/sign
                                                       {:email      "rasta@metabase.com"
                                                        :first_name "Rasta"
                                                        :last_name  "Toucan"
                                                        :extra      "keypairs"
                                                        :are        "also present"}
                                                       default-jwt-secret))]
            (is (sso.test-setup/successful-login? response))
            (testing "redirect URI"
              (is
               (= default-redirect-uri
                  (get-in response [:headers "Location"]))))
            (testing "jwt_attributes"
              (is
               (= {"extra" "keypairs", "are" "also present"}
                  (t2/select-one-fn :jwt_attributes :model/User :email "rasta@metabase.com"))))))

        (testing "with SAML and JWT configured, a GET request without JWT params should redirect to SAML IdP"
          (let [response (client/client-full-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri)]
            (is (not (sso.test-setup/successful-login? response)))))

        (testing "with SAML and JWT configured, a GET request with preferred_method=jwt should sign in via JWT"
          (let [response (client/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :preferred_method "jwt"
                                                      :jwt
                                                      (jwt/sign
                                                       {:email      "rasta@metabase.com"
                                                        :first_name "Rasta"
                                                        :last_name  "Toucan"
                                                        :extra      "keypairs"
                                                        :are        "also present"}
                                                       default-jwt-secret))]
            (is (sso.test-setup/successful-login? response))
            (testing "redirect URI (preferred_method=jwt)"
              (is
               (= default-redirect-uri
                  (get-in response [:headers "Location"]))))
            (testing "login attributes (preferred_method=jwt)"
              (is
               (= {"extra" "keypairs", "are" "also present"}
                  (t2/select-one-fn :jwt_attributes :model/User :email "rasta@metabase.com"))))))

        (testing "with SAML and JWT configured, a GET request with preferred_method=saml should redirect to SAML IdP"
          (let [response (client/client-full-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :preferred_method "saml")]
            (is (not (sso.test-setup/successful-login? response)))))))))

(deftest happy-path-test
  (testing
   (str "Happy path login, valid JWT, checks to ensure the user was logged in successfully and the redirect to "
        "the right location")
    (with-jwt-default-setup!
      (let [response (client/client-real-response :get 302 "/auth/sso" {:request-options {:redirect-strategy :none}}
                                                  :return_to default-redirect-uri
                                                  :jwt
                                                  (jwt/sign
                                                   {:email      "rasta@metabase.com"
                                                    :first_name "Rasta"
                                                    :last_name  "Toucan"
                                                    :extra      "keypairs"
                                                    :are        "also present"
                                                       ;; registered claims should not be synced as login attributes
                                                    :iss        "issuer"
                                                    :exp        (+ (buddy-util/now) 3600)
                                                    :iat        (buddy-util/now)}
                                                   default-jwt-secret))]
        (is (sso.test-setup/successful-login? response))
        (testing "redirect URI"
          (is
           (= default-redirect-uri
              (get-in response [:headers "Location"]))))
        (testing "login attributes"
          (is
           (= {"extra" "keypairs", "are" "also present"}
              (t2/select-one-fn :jwt_attributes :model/User :email "rasta@metabase.com"))))))))

(deftest no-open-redirect-test
  (testing "Check that we prevent open redirects to untrusted sites"
    (with-jwt-default-setup!
      (doseq [redirect-uri ["https://badsite.com"
                            "//badsite.com"
                            "https:///badsite.com"]]
        (is
         (= "Invalid redirect URL"
            (->
             (client/client
              :get 400 "/auth/sso" {:request-options {:redirect-strategy :none}}
              :return_to redirect-uri
              :jwt
              (jwt/sign
               {:email      "rasta@metabase.com"
                :first_name "Rasta"
                :last_name  "Toucan"
                :extra      "keypairs"
                :are        "also present"}
               default-jwt-secret))
             :message)))))))

(deftest expired-jwt-test
  (testing "Check an expired JWT"
    (with-jwt-default-setup!
      (is
       (= "Token is older than max-age (180)"
          (client/client :get 401 "/auth/sso" {:request-options {:redirect-strategy :none}}
                         :return_to default-redirect-uri
                         :jwt
                         (jwt/sign
                          {:email      "test@metabase.com",
                           :first_name "Test"
                           :last_name  "User"
                           :iat        (- (buddy-util/now) (u/minutes->seconds 5))}
                          default-jwt-secret)))))))

(deftest create-new-account-test
  (testing "A new account will be created for a JWT user we haven't seen before"
    (with-jwt-default-setup!
      (mt/with-model-cleanup [:model/User]
        (letfn
         [(new-user-exists? []
            (boolean (seq (t2/select :model/User :%lower.email "newuser@metabase.com"))))]
          (is (false? (new-user-exists?)))
          (let [response (client/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :jwt
                                                      (jwt/sign
                                                       {:email      "newuser@metabase.com"
                                                        :first_name "New"
                                                        :last_name  "User"
                                                        :more       "stuff"
                                                        :for        "the new user"}
                                                       default-jwt-secret))]
            (is (sso.test-setup/successful-login? response))
            (let [new-user (t2/select-one :model/User :email "newuser@metabase.com")]
              (testing "new user"
                (is
                 (=?
                  {:email           "newuser@metabase.com"
                   :first_name      "New"
                   :is_qbnewb       true
                   :is_superuser    false
                   :id              true
                   :last_name       "User"
                   :date_joined     true
                   :common_name     "New User"
                   :tenant_id       false}
                  (-> (mt/boolean-ids-and-timestamps [new-user])
                      first
                      (dissoc :last_login)))))
              (testing "User Invite Event is logged."
                (is
                 (= "newuser@metabase.com"
                    (get-in (mt/latest-audit-log-entry :user-invited (:id new-user))
                            [:details :email]))))
              (testing "attributes"
                (is
                 (=
                  {"more" "stuff"
                   "for"  "the new user"}
                  (t2/select-one-fn :jwt_attributes :model/User :email "newuser@metabase.com")))))))))))

(deftest update-account-test
  (testing "A new account with 'Unknown' name will be created for a new JWT user without a first or last name."
    (with-jwt-default-setup!
      (mt/with-model-cleanup [:model/User]
        (letfn
         [(new-user-exists? []
            (boolean (seq (t2/select :model/User :%lower.email "newuser@metabase.com"))))]
          (is
           (= false
              (new-user-exists?)))
          (let [response (client/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :jwt
                                                      (jwt/sign {:email "newuser@metabase.com"}
                                                                default-jwt-secret))]
            (is (sso.test-setup/successful-login? response))
            (testing "new user with no first or last name"
              (is
               (=?
                [{:email           "newuser@metabase.com"
                  :first_name      nil
                  :is_qbnewb       true
                  :is_superuser    false
                  :id              true
                  :last_name       nil
                  :date_joined     true
                  :common_name     "newuser@metabase.com"
                  :tenant_id       false}]
                (->>
                 (mt/boolean-ids-and-timestamps (t2/select :model/User :email "newuser@metabase.com"))
                 (map #(dissoc % :last_login)))))))
          (let [response (client/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :jwt
                                                      (jwt/sign
                                                       {:email      "newuser@metabase.com"
                                                        :first_name "New"
                                                        :last_name  "User"}
                                                       default-jwt-secret))]
            (is (sso.test-setup/successful-login? response))
            (testing "update user first and last name"
              (is
               (=?
                [{:email        "newuser@metabase.com"
                  :first_name   "New"
                  :is_qbnewb    true
                  :is_superuser false
                  :id           true
                  :last_name    "User"
                  :date_joined  true
                  :common_name  "New User"
                  :tenant_id    false}]
                (->>
                 (mt/boolean-ids-and-timestamps (t2/select :model/User :email "newuser@metabase.com"))
                 (map #(dissoc % :last_login))))))))))))

(defn- group-memberships [user-or-id]
  (when-let [group-ids (seq
                        (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (u/the-id user-or-id)))]
    (t2/select-fn-set :name :model/PermissionsGroup :id [:in group-ids])))

(deftest login-sync-group-memberships-test
  (testing "login should sync group memberships if enabled"
    (with-jwt-default-setup!
      (mt/with-temp [:model/PermissionsGroup my-group {:name (str ::my-group)}]
        (mt/with-temporary-setting-values
          [jwt-group-sync
           true
           jwt-group-mappings
           {"my_group" [(u/the-id my-group)]}
           jwt-attribute-groups
           "GrOuPs"]
          (mt/with-model-cleanup [:model/User]
            (let [response (client/client-real-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email      "newuser@metabase.com"
                                                          :first_name "New"
                                                          :last_name  "User"
                                                          :more       "stuff"
                                                          :GrOuPs     ["my_group"]
                                                          :for        "the new user"}
                                                         default-jwt-secret))]
              (is (sso.test-setup/successful-login? response))
              (is
               (=
                #{"All Users"
                  ":metabase-enterprise.sso.integrations.jwt-test/my-group"}
                (group-memberships
                 (u/the-id (t2/select-one-pk :model/User :email "newuser@metabase.com"))))))))))))

(deftest login-sync-group-memberships-no-mappings-test
  (testing "login should sync group memberships by name when no mappings are defined"
    (with-jwt-default-setup!
      (mt/with-temp [:model/PermissionsGroup _ {:name "developers"}
                     :model/PermissionsGroup _ {:name "analysts"}
                     :model/PermissionsGroup _ {:name "admins"}]
        (mt/with-temporary-setting-values
          [jwt-group-sync true
           jwt-group-mappings nil ; No mappings defined
           jwt-attribute-groups "groups"]
          (mt/with-model-cleanup [:model/User]
            (let [response (client/client-real-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email      "newuser@metabase.com"
                                                          :first_name "New"
                                                          :last_name  "User"
                                                          :groups     ["developers" "analysts"]}
                                                         default-jwt-secret))]
              (is (sso.test-setup/successful-login? response))
              (testing "user is assigned to groups matching the names from JWT claims"
                (is (= #{"All Users" "developers" "analysts"}
                       (group-memberships
                        (u/the-id (t2/select-one-pk :model/User :email "newuser@metabase.com"))))))
              (testing "user is not assigned to groups not mentioned in JWT claims"
                (is (not (contains? (group-memberships
                                     (u/the-id (t2/select-one-pk :model/User :email "newuser@metabase.com")))
                                    "admins")))))))))))

(deftest login-as-existing-user-test
  (testing "login as an existing user works"
    (testing "An existing user will be reactivated upon login"
      (with-jwt-default-setup!
        (mt/with-model-cleanup [:model/User]
          ;; just create the user
          (let [response (client/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :jwt
                                                      (jwt/sign
                                                       {:email "newuser@metabase.com"
                                                        :first_name "New"
                                                        :last_name "User"}
                                                       default-jwt-secret))]
            (is (sso.test-setup/successful-login? response)))

          ;; then log in again
          (let [response (client/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :jwt
                                                      (jwt/sign
                                                       {:email "newuser@metabase.com"
                                                        :first_name "New"
                                                        :last_name "User"}
                                                       default-jwt-secret))]
            (is (sso.test-setup/successful-login? response))))))

    (testing "Existing user login attributes are not changed on subsequent logins"
      (with-jwt-default-setup!
        (mt/with-model-cleanup [:model/User]
          ;; Create user with initial login attributes
          (let [response (client/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :jwt
                                                      (jwt/sign
                                                       {:email      "existinguser@metabase.com"
                                                        :first_name "Existing"
                                                        :last_name  "User"
                                                        :department "Engineering"
                                                        :role       "Developer"}
                                                       default-jwt-secret))]
            (is (sso.test-setup/successful-login? response))
            (testing "initial login attributes are stored"
              (is (= nil
                     (t2/select-one-fn :login_attributes :model/User :email "existinguser@metabase.com")))))

          ;; Log in again with different attributes
          (let [response (client/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none}}
                                                      :return_to default-redirect-uri
                                                      :jwt
                                                      (jwt/sign
                                                       {:email      "existinguser@metabase.com"
                                                        :first_name "Existing"
                                                        :last_name  "User"
                                                        :department "Marketing"
                                                        :role       "Manager"
                                                        :location   "Remote"}
                                                       default-jwt-secret))]
            (is (sso.test-setup/successful-login? response))
            (testing "login attributes remain unchanged from initial login"
              (is (= nil
                     (t2/select-one-fn :login_attributes :model/User :email "existinguser@metabase.com"))))))))))

(deftest login-update-account-test
  (testing "An existing user will be reactivated upon login"
    (with-jwt-default-setup!
      (mt/with-model-cleanup [:model/User]
        ;; just create the user
        (let [response (client/client-real-response :get 302 "/auth/sso"
                                                    {:request-options {:redirect-strategy :none}}
                                                    :return_to default-redirect-uri
                                                    :jwt
                                                    (jwt/sign
                                                     {:email "newuser@metabase.com"
                                                      :first_name "New"
                                                      :last_name "User"}
                                                     default-jwt-secret))]
          (is (sso.test-setup/successful-login? response)))

        ;; deactivate the user
        (t2/update! :model/User :email "newuser@metabase.com" {:is_active false})
        (is (not (t2/select-one-fn :is_active :model/User :email "newuser@metabase.com")))

        (let [response (client/client-real-response :get 302 "/auth/sso"
                                                    {:request-options {:redirect-strategy :none}}
                                                    :return_to default-redirect-uri
                                                    :jwt
                                                    (jwt/sign
                                                     {:email "newuser@metabase.com"
                                                      :first_name "New"
                                                      :last_name "User"}
                                                     default-jwt-secret))]
          (is (sso.test-setup/successful-login? response))
          (is (t2/select-one-fn :is_active :model/User :email "newuser@metabase.com")))

        ;; deactivate the user again
        (t2/update! :model/User :email "newuser@metabase.com" {:is_active false})
        (is (not (t2/select-one-fn :is_active :model/User :email "newuser@metabase.com")))
        (with-redefs [sso-settings/jwt-user-provisioning-enabled? (constantly false)
                      appearance.settings/site-name               (constantly "test")]
          (is (=? {:body "Sorry, but you'll need a test account to view this page. Please contact your administrator."}
                  (client/client-real-response :get 401 "/auth/sso"
                                               {:request-options {:redirect-strategy :none}}
                                               :return_to default-redirect-uri
                                               :jwt
                                               (jwt/sign
                                                {:email "newuser@metabase.com"
                                                 :first_name "New"
                                                 :last_name "User"}
                                                default-jwt-secret)))))))))

(deftest tenants-can-be-auto-provisioned
  (mt/with-model-cleanup [:model/Tenant]
    (with-jwt-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/PermissionsGroup _my-group {:name (str ::my-group)}]
            (mt/with-model-cleanup [:model/User :model/Collection :model/Tenant]
              (let [response (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :return_to default-redirect-uri
                                                          :jwt
                                                          (jwt/sign
                                                           {:email "newuser@metabase.com"
                                                            "@tenant" "tenant-mctenantson"
                                                            :first_name "New"
                                                            :last_name "User"}
                                                           default-jwt-secret))]
                (is (sso.test-setup/successful-login? response))
                (is (some? (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com")))
                (is (t2/exists? :model/Tenant :slug "tenant-mctenantson")))
              (testing "they should be able to log in again"
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email "newuser@metabase.com"
                                                              "@tenant" "tenant-mctenantson"
                                                              :first_name "New"
                                                              :last_name "User"}
                                                             default-jwt-secret))]
                  (is (sso.test-setup/successful-login? response)))))))))))

(deftest new-users-should-be-set-to-the-correct-tenant
  (with-jwt-default-setup!
    (mt/with-additional-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/PermissionsGroup _my-group {:name (str ::my-group)}
                       :model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                      :name "Tenant McTenantson"}]
          (mt/with-model-cleanup [:model/User]
            (let [response (client/client-real-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email "newuser@metabase.com"
                                                          "@tenant" "tenant-mctenantson"
                                                          :first_name "New"
                                                          :last_name "User"}
                                                         default-jwt-secret))]
              (is (sso.test-setup/successful-login? response))
              (is
               (= tenant-id (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com"))))
            (testing "they should be able to log in again"
              (let [response (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :return_to default-redirect-uri
                                                          :jwt
                                                          (jwt/sign
                                                           {:email "newuser@metabase.com"
                                                            "@tenant" "tenant-mctenantson"
                                                            :first_name "New"
                                                            :last_name "User"}
                                                           default-jwt-secret))]
                (is (sso.test-setup/successful-login? response))
                (is
                 (= tenant-id (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com")))))))))))

(deftest new-users-are-not-assigned-a-tenant-if-tenants-is-not-enabled
  (with-jwt-default-setup!
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/PermissionsGroup _my-group {:name (str ::my-group)}
                     :model/Tenant _ {:slug "tenant-mctenantson"
                                      :name "Tenant McTenantson"}]
        (mt/with-model-cleanup [:model/User]
          (mt/with-temporary-setting-values [use-tenants false]
            (let [response (client/client-real-response :get 403 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email "newuser@metabase.com"
                                                          "@tenant" "tenant-mctenantson"
                                                          :first_name "New"
                                                          :last_name "User"}
                                                         default-jwt-secret))]
              (is (not (sso.test-setup/successful-login? response)))
              (is
               (nil? (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com")))))
          (testing "they should be able to log in without the tenant bit, of course"
            (let [response (client/client-real-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email "newuser@metabase.com"
                                                          :first_name "New"
                                                          :last_name "User"}
                                                         default-jwt-secret))]
              (is (sso.test-setup/successful-login? response))
              (is
               (nil? (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com"))))))))))

(deftest name-does-not-get-overwritten-on-new-login
  (with-jwt-default-setup!
    (mt/with-additional-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/PermissionsGroup _my-group {:name (str ::my-group)}
                       :model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                      :name "Tenant McTenantson"}
                       :model/User {email :email
                                    first-name :first_name
                                    last-name :last_name} {:tenant_id tenant-id
                                                           :first_name (mt/random-name)
                                                           :last_name (mt/random-name)}]
          (mt/with-temporary-setting-values [use-tenants true]
            (testing "they should be able to log in without specifying a name"
              (let [response (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :return_to default-redirect-uri
                                                          :jwt
                                                          (jwt/sign
                                                           {:email email
                                                            "@tenant" "tenant-mctenantson"}
                                                           default-jwt-secret))]
                (is (sso.test-setup/successful-login? response))
                (testing "their name is unchanged"
                  (is (= [first-name last-name] (t2/select-one-fn (juxt :first_name :last_name) :model/User :email email))))))))))))

(deftest a-user-can-log-in-with-a-deactivated-tenant
  (with-jwt-default-setup!
    (mt/with-additional-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/PermissionsGroup _my-group {:name (str ::my-group)}
                       :model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                      :name "Tenant McTenantson"
                                                      :is_active false}
                       :model/User {existing-email :email} {:tenant_id tenant-id}]
          (mt/with-temporary-setting-values [use-tenants true]
            (testing "a new user can log into a deactivated tenant"
              (mt/with-model-cleanup [:model/User]
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email "newuser@metabase.com"
                                                              "@tenant" "tenant-mctenantson"
                                                              :first_name "New"
                                                              :last_name "User"}
                                                             default-jwt-secret))]
                  (is (sso.test-setup/successful-login? response))
                  (is (t2/select-one-fn :is_active :model/Tenant :id tenant-id)))))
            (testing "an existing user also fails to log in with correct error message"
              (let [response (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :return_to default-redirect-uri
                                                          :jwt
                                                          (jwt/sign
                                                           {:email existing-email
                                                            "@tenant" "tenant-mctenantson"
                                                            :first_name "Existing"
                                                            :last_name "User"}
                                                           default-jwt-secret))]
                (is (sso.test-setup/successful-login? response))
                (is (t2/select-one-fn :is_active :model/Tenant :id tenant-id))))))))))

(deftest users-cannot-log-into-deactivated-tenant-with-provisioning-disabled
  (with-jwt-default-setup!
    (mt/with-additional-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/PermissionsGroup _my-group {:name (str ::my-group)}
                       :model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                      :name "Tenant McTenantson"
                                                      :is_active false}
                       :model/User {existing-email :email} {:tenant_id tenant-id}]
          (with-redefs [sso-settings/jwt-user-provisioning-enabled? (constantly false)]
            (testing "with user provisioning turned off"
              (testing "a new user cannot log into a deactivated tenant, and the tenant doesn't get activated"
                (mt/with-model-cleanup [:model/User]
                  (let [response (client/client-real-response :get 401 "/auth/sso"
                                                              {:request-options {:redirect-strategy :none}}
                                                              :return_to default-redirect-uri
                                                              :jwt
                                                              (jwt/sign
                                                               {:email "newuser@metabase.com"
                                                                "@tenant" "tenant-mctenantson"
                                                                :first_name "New"
                                                                :last_name "User"}
                                                               default-jwt-secret))]
                    (is (not (sso.test-setup/successful-login? response)))
                    (is (not (t2/select-one-fn :is_active :model/Tenant :id tenant-id))))))
              (testing "an existing user cannot log into a deactivated tenant"
                (let [response (client/client-real-response :get 403 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email existing-email
                                                              "@tenant" "tenant-mctenantson"
                                                              :first_name "Existing"
                                                              :last_name "User"}
                                                             default-jwt-secret))]
                  (is (not (sso.test-setup/successful-login? response)))
                  (is (str/includes? (:body response) "Tenant is not active"))
                  (is (not (t2/select-one-fn :is_active :model/Tenant :id tenant-id))))))))))))

;; not yet - we need to figure out what to do about personal collections here first
#_(deftest existing-users-can-be-updated-with-a-tenant
    (with-jwt-default-setup!
      (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                    :name "Tenant McTenantson"}]
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-model-cleanup [:model/User]
            (testing "log in without a tenant"
              (let [response (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :return_to default-redirect-uri
                                                          :jwt
                                                          (jwt/sign
                                                           {:email "newuser@metabase.com"
                                                            :first_name "New"
                                                            :last_name "User"}
                                                           default-jwt-secret))]
                (is (sso.test-setup/successful-login? response))
                (is (nil? (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com")))))
            (testing "now log in WITH a tenant"
              (let [response (client/client-real-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :return_to default-redirect-uri
                                                          :jwt
                                                          (jwt/sign
                                                           {:email "newuser@metabase.com"
                                                            "@tenant" "tenant-mctenantson"
                                                            :first_name "New"
                                                            :last_name "User"}
                                                           default-jwt-secret))]
                (is (sso.test-setup/successful-login? response))
                (is
                 (= tenant-id (t2/select-one-fn :tenant_id :model/User :email "newuser@metabase.com"))))))))))

(deftest a-tenant-cannot-be-changed-once-set
  (with-jwt-default-setup!
    (mt/with-additional-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                      :name "Tenant McTenantson"}
                       :model/Tenant _ {:slug "other"
                                        :name "Other"}
                       :model/User {email-with-tenant :email} {:tenant_id tenant-id}]
          (testing "tenant -> other tenant fails with correct error message"
            (let [response (client/client-real-response :get 403 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign {:email email-with-tenant "@tenant" "other"}
                                                                  default-jwt-secret))]
              (is (not (sso.test-setup/successful-login? response)))
              (is (str/includes? (:body response) "Tenant ID mismatch with existing user")))))))))

(deftest external-user-requires-tenant-claim
  (testing "External user must include tenant claim in JWT"
    (with-jwt-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "tenant-mctenantson"
                                                        :name "Tenant McTenantson"}
                         :model/User {email-with-tenant :email} {:tenant_id tenant-id}]
            (let [response (client/client-real-response :get 403 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email email-with-tenant}
                                                         default-jwt-secret))]
              (is (not (sso.test-setup/successful-login? response)))
              (is (str/includes? (:body response) "Tenant claim required for external user")))))))))

(deftest internal-user-cannot-have-tenant-claim
  (testing "Internal user cannot log in with tenant claim in JWT"
    (with-jwt-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Tenant _ {:slug "tenant-mctenantson"
                                          :name "Tenant McTenantson"}
                         :model/User {email-without-tenant :email} {}]
            (let [response (client/client-real-response :get 403 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email email-without-tenant
                                                          "@tenant" "tenant-mctenantson"}
                                                         default-jwt-secret))]
              (is (not (sso.test-setup/successful-login? response)))
              (is (str/includes? (:body response) "Cannot add tenant claim to internal user")))))))))

(deftest internal-user-cannot-login-with-tenant-claim-if-tenants-disabled
  (testing "Internal user cannot log in with tenant claim in JWT"
    (with-jwt-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants false]
          (mt/with-temp [:model/Tenant _ {:slug "tenant-mctenantson"
                                          :name "Tenant McTenantson"}
                         :model/User {email-without-tenant :email} {}]
            (let [response (client/client-real-response :get 403 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email email-without-tenant
                                                          "@tenant" "tenant-mctenantson"
                                                          :foo "bar"}
                                                         default-jwt-secret))]
              (is (not (sso.test-setup/successful-login? response)))
              ;; the `@tenant` key is special, does not become a user attribute
              (is (nil? (t2/select-one-fn :jwt_attributes :model/User :email email-without-tenant))))))))))

(deftest create-new-jwt-user-no-user-provisioning-test
  (testing "When user provisioning is disabled, throw an error if we attempt to create a new user."
    (with-jwt-default-setup!
      (with-redefs [sso-settings/jwt-user-provisioning-enabled? (constantly false)
                    appearance.settings/site-name               (constantly "test")]
        (is (=? {:body "Sorry, but you'll need a test account to view this page. Please contact your administrator."}
                (client/client-real-response :get 401 "/auth/sso"
                                             {:request-options {:redirect-strategy :none}}
                                             :return_to default-redirect-uri
                                             :jwt
                                             (jwt/sign
                                              {:email "test1234@metabase.com"
                                               :first_name "Test"
                                               :last_name "User"}
                                              default-jwt-secret))))))))

(deftest non-string-jwt-claims-dropped-test
  (testing "JWT claims with non-string values are dropped and warning is logged"
    (with-jwt-default-setup!
      (mt/with-log-messages-for-level [jwt-log-messages [metabase-enterprise :warn]]
        (let [response (client/client-full-response :get 302 "/auth/sso"
                                                    {:request-options {:redirect-strategy :none}}
                                                    :return_to default-redirect-uri
                                                    :jwt
                                                    (jwt/sign
                                                     {:email      "rasta@metabase.com"
                                                      :first_name "Rasta"
                                                      :last_name  "Toucan"
                                                      :string_attr "valid-string"
                                                      :number_attr 42
                                                      :boolean_attr false
                                                      :array_attr ["item1" "item2"]
                                                      :object_attr {:nested "value"}
                                                      :null_attr nil
                                                      "@attribute" "foo"}
                                                     default-jwt-secret))]
          (is (sso.test-setup/successful-login? response))

          (testing "only string attributes are saved to jwt_attributes"
            (is (= {"string_attr" "valid-string"
                    "number_attr" "42"
                    "boolean_attr" "false"}
                   (t2/select-one-fn :jwt_attributes :model/User :email "rasta@metabase.com"))))

          (testing "warning messages are logged for non-stringable values"
            (is (some #(re-find #"Dropping attribute 'array_attr' with non-stringable value: \[\"item1\" \"item2\"\]" %) (map :message (jwt-log-messages))))
            (is (some #(re-find #"Dropping attribute 'object_attr' with non-stringable value: \{:nested \"value\"\}" %) (map :message (jwt-log-messages))))
            (is (some #(re-find #"Dropping attribute 'null_attr' with non-stringable value: null" %) (map :message (jwt-log-messages)))))
          (testing "warning messages are logged for `@`-prefixed keys"
            (is (some #(re-find #"Dropping attribute '@attribute', keys beginning with `@` are reserved" %) (map :message (jwt-log-messages)))))

          (testing "no warning for valid string attribute"
            (is (not (some #(re-find #"string_attr" %) (map :message (jwt-log-messages)))))))))))

(deftest jwt-token-sdk-idp-url-test
  (testing "should return IdP URL when embedding SDK header is present but no JWT token is provided"
    (with-jwt-default-setup!
      (mt/with-temporary-setting-values [enable-embedding-sdk true]
        (let [result (client/client-real-response
                      :get 200 "/auth/sso"
                      {:request-options {:headers {"x-metabase-client" "embedding-sdk-react"}}})]
          (is (partial= {:url (sso-settings/jwt-identity-provider-uri)
                         :method "jwt"}
                        (:body result))))))))

(deftest jwt-token-sdk-session-token-test
  (testing "should return a session token when a JWT token and sdk headers are passed"
    (with-jwt-default-setup!
      (mt/with-temporary-setting-values [enable-embedding-sdk true]
        (let [jwt-iat-time (buddy-util/now)
              jwt-exp-time (+ (buddy-util/now) 3600)
              jwt-payload  (jwt/sign
                            {:email      "rasta@metabase.com"
                             :first_name "Rasta"
                             :last_name  "Toucan"
                             :extra      "keypairs"
                             :are        "also present"
                             :iat        jwt-iat-time
                             :exp        jwt-exp-time}
                            default-jwt-secret)
              do-request (fn [headers]
                           (client/client-real-response :get 200 "/auth/sso"
                                                        {:request-options {:headers headers}}
                                                        :jwt jwt-payload))
              expected-body {:id  (mt/malli=? ms/UUIDString)
                             :iat jwt-iat-time
                             :exp jwt-exp-time}]
          (testing "without hash header"
            (is (=? expected-body
                    (:body (do-request {"x-metabase-client" "embedding-sdk-react"})))))
          (testing "with hash header (legacy usage)"
            (is (=? expected-body
                    (:body (do-request {"x-metabase-client" "embedding-sdk-react"
                                        "x-metabase-sdk-jwt-hash" (token-utils/generate-token)}))))))))))

(deftest jwt-token-not-configured-test
  (testing "should not return a session token when jwt is not configured"
    (mt/with-temporary-setting-values
      [jwt-enabled true
       jwt-identity-provider-uri nil
       jwt-shared-secret nil]
      (mt/with-temporary-setting-values [enable-embedding-sdk true]
        (let [jwt-iat-time (buddy-util/now)
              jwt-exp-time (+ (buddy-util/now) 3600)
              jwt-payload  (jwt/sign
                            {:email      "rasta@metabase.com"
                             :first_name "Rasta"
                             :last_name  "Toucan"
                             :extra      "keypairs"
                             :are        "also present"
                             :iat        jwt-iat-time
                             :exp        jwt-exp-time}
                            default-jwt-secret)
              result       (client/client-real-response :get 400 "/auth/sso"
                                                        {:request-options {:headers {"x-metabase-client" "embedding-sdk-react"}}}
                                                        :jwt   jwt-payload)]
          (is result nil))))))

(deftest jwt-token-embedding-disabled-test
  (testing "should not return a session token when embedding is disabled"
    (with-jwt-default-setup!
      (mt/with-temporary-setting-values [enable-embedding-sdk false]
        (let [jwt-iat-time (buddy-util/now)
              jwt-exp-time (+ (buddy-util/now) 3600)
              jwt-payload  (jwt/sign
                            {:email      "rasta@metabase.com"
                             :first_name "Rasta"
                             :last_name  "Toucan"
                             :extra      "keypairs"
                             :are        "also present"
                             :iat        jwt-iat-time
                             :exp        jwt-exp-time}
                            default-jwt-secret)
              result       (client/client-real-response :get 402 "/auth/sso"
                                                        {:request-options {:headers {"x-metabase-client" "embedding-sdk-react"}}}
                                                        :jwt   jwt-payload)]
          (is result nil))))))

(deftest jwt-token-no-hash-test
  (testing "should not return a session token when token=false"
    (with-jwt-default-setup!
      (mt/with-temporary-setting-values [enable-embedding-sdk true]
        (let [jwt-iat-time (buddy-util/now)
              jwt-exp-time (+ (buddy-util/now) 3600)
              jwt-payload  (jwt/sign
                            {:email      "rasta@metabase.com"
                             :first_name "Rasta"
                             :last_name  "Toucan"
                             :extra      "keypairs"
                             :are        "also present"
                             :iat        jwt-iat-time
                             :exp        jwt-exp-time}
                            default-jwt-secret)
              result       (client/client-real-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt       jwt-payload)]
          (is result nil))))))

(deftest tenant-user-assigned-to-tenant-group-via-mapping-test
  (testing "JWT user with tenant claim can be assigned to tenant user groups via group mapping"
    (with-jwt-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "test-tenant"
                                                        :name "Test Tenant"}
                         :model/PermissionsGroup {tenant-group-id :id} {:name "Tenant Engineers"
                                                                        :is_tenant_group true}]
            (mt/with-temporary-setting-values
              [jwt-group-sync true
               jwt-group-mappings {"engineers" [tenant-group-id]}
               jwt-attribute-groups "groups"]
              (mt/with-model-cleanup [:model/User]
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email "tenant-user@metabase.com"
                                                              :first_name "Tenant"
                                                              :last_name "User"
                                                              "@tenant" "test-tenant"
                                                              :groups ["engineers"]}
                                                             default-jwt-secret))]
                  (is (sso.test-setup/successful-login? response))
                  (let [user (t2/select-one :model/User :email "tenant-user@metabase.com")]
                    (testing "user is assigned to the correct tenant"
                      (is (= tenant-id (:tenant_id user))))
                    (testing "user is assigned to the mapped tenant group"
                      (is (contains? (group-memberships (u/the-id user)) "Tenant Engineers")))
                    (testing "user is assigned to All tenant users (magic group for tenant users)"
                      (is (contains? (group-memberships (u/the-id user)) "All tenant users")))))))))))))

(deftest tenant-user-assigned-to-tenant-group-via-name-matching-test
  (testing "JWT user with tenant claim can be assigned to tenant user groups via group name matching (no explicit mappings)"
    (with-jwt-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "test-tenant"
                                                        :name "Test Tenant"}
                         :model/PermissionsGroup _ {:name "tenant-developers"
                                                    :is_tenant_group true}
                         :model/PermissionsGroup _ {:name "tenant-analysts"
                                                    :is_tenant_group true}
                         :model/PermissionsGroup _ {:name "tenant-admins"
                                                    :is_tenant_group true}]
            (mt/with-temporary-setting-values
              [jwt-group-sync true
               jwt-group-mappings nil
               jwt-attribute-groups "groups"]
              (mt/with-model-cleanup [:model/User]
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email "tenant-user@metabase.com"
                                                              :first_name "Tenant"
                                                              :last_name "User"
                                                              "@tenant" "test-tenant"
                                                              :groups ["tenant-developers" "tenant-analysts"]}
                                                             default-jwt-secret))]
                  (is (sso.test-setup/successful-login? response))
                  (let [user (t2/select-one :model/User :email "tenant-user@metabase.com")]
                    (testing "user is assigned to the correct tenant"
                      (is (= tenant-id (:tenant_id user))))
                    (testing "user is assigned to groups matching the names from JWT claims"
                      (is (= #{"All tenant users" "tenant-developers" "tenant-analysts"}
                             (group-memberships (u/the-id user)))))
                    (testing "user is not assigned to groups not mentioned in JWT claims"
                      (is (not (contains? (group-memberships (u/the-id user)) "tenant-admins"))))))))))))))

(deftest non-string-tenant-slugs-are-handled-correctly
  (with-jwt-default-setup!
    (mt/with-additional-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-model-cleanup [:model/User :model/Tenant]
          (testing "Integers are allowed, converted to strings"
            (let [response (client/client-real-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email "tenant-user@metabase.com"
                                                          :first_name "Tenant"
                                                          :last_name "User"
                                                          "@tenant" 123}
                                                         default-jwt-secret))]
              (is (sso.test-setup/successful-login? response))
              (is (t2/exists? :model/Tenant :slug "123"))))
          (testing "Other non-string values are rejected"
            (let [response (client/client-real-response :get 401 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email "tenant-user@metabase.com"
                                                          :first_name "Tenant"
                                                          :last_name "User"
                                                          "@tenant" false}
                                                         default-jwt-secret))]
              (is (= "Value of `@tenant` must be a string" (:body response)))
              (is (not (sso.test-setup/successful-login? response)))))
          (testing "Other non-string values are rejected"
            (let [response (client/client-real-response :get 401 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :return_to default-redirect-uri
                                                        :jwt
                                                        (jwt/sign
                                                         {:email "tenant-user@metabase.com"
                                                          :first_name "Tenant"
                                                          :last_name "User"
                                                          "@tenant" {"foo" "bar"}}
                                                         default-jwt-secret))]
              (is (= "Value of `@tenant` must be a string" (:body response)))
              (is (not (sso.test-setup/successful-login? response))))))))))

(deftest tenant-user-group-sync-on-subsequent-login-test
  (testing "JWT tenant user group memberships are synced correctly on subsequent logins"
    (with-jwt-default-setup!
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "test-tenant"
                                                        :name "Test Tenant"}
                         :model/PermissionsGroup _ {:name "Group A"
                                                    :is_tenant_group true}
                         :model/PermissionsGroup _ {:name "Group B"
                                                    :is_tenant_group true}]
            (mt/with-temporary-setting-values
              [jwt-group-sync true
               jwt-group-mappings nil
               jwt-attribute-groups "groups"]
              (mt/with-model-cleanup [:model/User]
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email "tenant-user@metabase.com"
                                                              :first_name "Tenant"
                                                              :last_name "User"
                                                              "@tenant" "test-tenant"
                                                              :groups ["Group A"]}
                                                             default-jwt-secret))]
                  (is (sso.test-setup/successful-login? response))
                  (let [user (t2/select-one :model/User :email "tenant-user@metabase.com")]
                    (is (= tenant-id (:tenant_id user)))
                    (is (= #{"All tenant users" "Group A"}
                           (group-memberships (u/the-id user))))))
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email "tenant-user@metabase.com"
                                                              :first_name "Tenant"
                                                              :last_name "User"
                                                              "@tenant" "test-tenant"
                                                              :groups ["Group B"]}
                                                             default-jwt-secret))]
                  (is (sso.test-setup/successful-login? response))
                  (let [user (t2/select-one :model/User :email "tenant-user@metabase.com")]
                    (testing "user remains assigned to the same tenant"
                      (is (= tenant-id (:tenant_id user))))
                    (testing "user group memberships are updated to reflect JWT claims"
                      (is (= #{"All tenant users" "Group B"}
                             (group-memberships (u/the-id user)))))
                    (testing "user is no longer in Group A"
                      (is (not (contains? (group-memberships (u/the-id user)) "Group A"))))))))))))))

(deftest tenant-attributes-from-jwt-test
  (testing "Tenant attributes can be set via JWT"
    (testing "New tenant gets attributes from JWT"
      (mt/with-model-cleanup [:model/Tenant]
        (with-jwt-default-setup!
          (mt/with-additional-premium-features #{:tenants}
            (mt/with-temporary-setting-values [use-tenants true]
              (mt/with-model-cleanup [:model/User :model/Collection :model/Tenant]
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email "newuser@metabase.com"
                                                              "@tenant" "new-tenant-with-attrs"
                                                              "@tenant.attributes" {"plan" "enterprise"
                                                                                    "region" "us-west"}
                                                              :first_name "New"
                                                              :last_name "User"}
                                                             default-jwt-secret))]
                  (is (sso.test-setup/successful-login? response))
                  (let [tenant (t2/select-one :model/Tenant :slug "new-tenant-with-attrs")]
                    (is (some? tenant))
                    (is (= {"plan" "enterprise" "region" "us-west"}
                           (:attributes tenant)))))))))))

    (testing "Existing tenant - new attributes added, existing preserved"
      (with-jwt-default-setup!
        (mt/with-additional-premium-features #{:tenants}
          (mt/with-temporary-setting-values [use-tenants true]
            (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "existing-tenant"
                                                          :name "Existing Tenant"
                                                          :attributes {"plan" "enterprise"}}]
              (mt/with-model-cleanup [:model/User]
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email "newuser@metabase.com"
                                                              "@tenant" "existing-tenant"
                                                              "@tenant.attributes" {"plan" "basic"
                                                                                    "region" "us-east"}
                                                              :first_name "New"
                                                              :last_name "User"}
                                                             default-jwt-secret))]
                  (is (sso.test-setup/successful-login? response))
                  (let [tenant (t2/select-one :model/Tenant tenant-id)]
                    (testing "existing 'plan' attribute is preserved, not overwritten"
                      (is (= "enterprise" (get (:attributes tenant) "plan"))))
                    (testing "new 'region' attribute is added"
                      (is (= "us-east" (get (:attributes tenant) "region"))))))))))))

    (testing "Invalid @tenant.attributes is ignored"
      (mt/with-model-cleanup [:model/Tenant]
        (with-jwt-default-setup!
          (mt/with-additional-premium-features #{:tenants}
            (mt/with-temporary-setting-values [use-tenants true]
              (mt/with-model-cleanup [:model/User :model/Collection :model/Tenant]
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :return_to default-redirect-uri
                                                            :jwt
                                                            (jwt/sign
                                                             {:email "newuser2@metabase.com"
                                                              "@tenant" "tenant-invalid-attrs"
                                                              "@tenant.attributes" "not-a-map"
                                                              :first_name "New"
                                                              :last_name "User"}
                                                             default-jwt-secret))]
                  (is (sso.test-setup/successful-login? response))
                  (let [tenant (t2/select-one :model/Tenant :slug "tenant-invalid-attrs")]
                    (is (some? tenant))
                    (testing "tenant created but with no attributes since the value wasn't a map"
                      (is (nil? (:attributes tenant))))))))))))))
