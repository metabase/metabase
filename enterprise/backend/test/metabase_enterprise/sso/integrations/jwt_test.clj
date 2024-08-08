(ns metabase-enterprise.sso.integrations.jwt-test
  (:require
   [buddy.sign.jwt :as jwt]
   [buddy.sign.util :as buddy-util]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [crypto.random :as crypto-random]
   [metabase-enterprise.sso.integrations.jwt :as mt.jwt]
   [metabase-enterprise.sso.integrations.saml-test :as saml-test]
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [metabase.config :as config]
   [metabase.models.permissions-group :refer [PermissionsGroup]]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.models.user :refer [User]]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(defn- disable-other-sso-types [thunk]
  (mt/with-temporary-setting-values [ldap-enabled false
                                     saml-enabled false]
    (thunk)))

(use-fixtures :each disable-other-sso-types)

(def ^:private default-idp-uri      "http://test.idp.metabase.com")
(def ^:private default-redirect-uri "/")
(def ^:private default-jwt-secret   (crypto-random/hex 32))

(defmacro with-sso-jwt-token
  "Stubs the [[premium-features/*token-features*]] function to simulate a premium token with the `:sso-jwt` feature.
   This needs to be included to test any of the JWT features."
  [& body]
  `(mt/with-additional-premium-features #{:sso-jwt}
     ~@body))

(defn- call-with-default-jwt-config [f]
  (let [current-features (premium-features/*token-features*)]
    (mt/with-additional-premium-features #{:sso-jwt}
      (mt/with-temporary-setting-values [jwt-enabled               true
                                         jwt-identity-provider-uri default-idp-uri
                                         jwt-shared-secret         default-jwt-secret
                                         site-url                  (format "http://localhost:%s" (config/config-str :mb-jetty-port))]
        (mt/with-premium-features current-features
          (f))))))

(defmacro with-default-jwt-config [& body]
  `(call-with-default-jwt-config
    (fn []
      ~@body)))

(defmacro ^:private with-jwt-default-setup [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-premium-features #{:audit-app}
       (disable-other-sso-types
        (fn []
          (with-sso-jwt-token
            (saml-test/call-with-login-attributes-cleared!
             (fn []
               (call-with-default-jwt-config
                (fn []
                  ~@body))))))))))

(deftest sso-prereqs-test
  (with-sso-jwt-token
    (testing "SSO requests fail if JWT hasn't been configured or enabled"
      (mt/with-temporary-setting-values [jwt-enabled               false
                                         jwt-identity-provider-uri nil
                                         jwt-shared-secret         nil]
        (is (= "SSO has not been enabled and/or configured"
               (saml-test/client :get 400 "/auth/sso")))

        (testing "SSO requests fail if they don't have a valid premium-features token"
          (with-default-jwt-config
            (mt/with-premium-features #{}
              (is (= "SSO has not been enabled and/or configured"
                     (saml-test/client :get 400 "/auth/sso"))))))))

    (testing "SSO requests fail if JWT is enabled but hasn't been configured"
      (mt/with-temporary-setting-values [jwt-enabled               true
                                         jwt-identity-provider-uri nil]
        (is (= "SSO has not been enabled and/or configured"
               (saml-test/client :get 400 "/auth/sso")))))

    (testing "SSO requests fail if JWT is configured but hasn't been enabled"
      (mt/with-temporary-setting-values [jwt-enabled               false
                                         jwt-identity-provider-uri default-idp-uri
                                         jwt-shared-secret         default-jwt-secret]
        (is (= "SSO has not been enabled and/or configured"
               (saml-test/client :get 400 "/auth/sso")))))

    (testing "The JWT Shared Secret must also be included for SSO to be configured"
      (mt/with-temporary-setting-values [jwt-enabled               true
                                         jwt-identity-provider-uri default-idp-uri
                                         jwt-shared-secret         nil]
        (is (= "SSO has not been enabled and/or configured"
               (saml-test/client :get 400 "/auth/sso")))))))

(deftest redirect-test
  (testing "with JWT configured, a GET request should result in a redirect to the IdP"
    (with-jwt-default-setup
      (let [result       (saml-test/client-full-response :get 302 "/auth/sso"
                                                         {:request-options {:redirect-strategy :none}}
                                                         :redirect default-redirect-uri)
            redirect-url (get-in result [:headers "Location"])]
        (is (str/starts-with? redirect-url default-idp-uri)))))
  (testing (str "JWT configured with a redirect-uri containing query params, "
                "a GET request should result in a redirect to the IdP as a correctly formatted URL (#13078)")
    (with-jwt-default-setup
      (mt/with-temporary-setting-values [jwt-identity-provider-uri "http://test.idp.metabase.com/login?some_param=yes"]
        (let [result       (saml-test/client-full-response :get 302 "/auth/sso"
                                                           {:request-options {:redirect-strategy :none}}
                                                           :redirect default-redirect-uri)
              redirect-url (get-in result [:headers "Location"])]
          (is (str/includes? redirect-url "&return_to=")))))))

(deftest jwt-saml-both-enabled-test
  (with-jwt-default-setup
    (saml-test/with-saml-default-setup
      (testing "with SAML and JWT configured, a GET request with JWT params should sign in correctly"
        (let [response (saml-test/client-full-response :get 302 "/auth/sso"
                                                       {:request-options {:redirect-strategy :none}}
                                                       :return_to default-redirect-uri
                                                       :jwt (jwt/sign {:email      "rasta@metabase.com"
                                                                       :first_name "Rasta"
                                                                       :last_name  "Toucan"
                                                                       :extra      "keypairs"
                                                                       :are        "also present"}
                                                                      default-jwt-secret))]
          (is (saml-test/successful-login? response))
          (testing "redirect URI"
            (is (= default-redirect-uri
                   (get-in response [:headers "Location"]))))
          (testing "login attributes"
            (is (= {"extra" "keypairs", "are" "also present"}
                   (t2/select-one-fn :login_attributes User :email "rasta@metabase.com"))))))

      (testing "with SAML and JWT configured, a GET request without JWT params should redirect to SAML IdP"
        (let [response (saml-test/client-full-response :get 302 "/auth/sso"
                                                       {:request-options {:redirect-strategy :none}}
                                                       :return_to default-redirect-uri)]
          (is (not (saml-test/successful-login? response))))))))

(deftest happy-path-test
  (testing (str "Happy path login, valid JWT, checks to ensure the user was logged in successfully and the redirect to "
                "the right location")
    (with-jwt-default-setup
      (let [response (saml-test/client-full-response :get 302 "/auth/sso" {:request-options {:redirect-strategy :none}}
                                                     :return_to default-redirect-uri
                                                     :jwt (jwt/sign {:email      "rasta@metabase.com"
                                                                     :first_name "Rasta"
                                                                     :last_name  "Toucan"
                                                                     :extra      "keypairs"
                                                                     :are        "also present"
                                                                     ;; registerd claims should not be synced as login attributes
                                                                     :iss        "issuer"
                                                                     :exp        (+ (buddy-util/now) 3600)
                                                                     :iat        (buddy-util/now)}
                                                                    default-jwt-secret))]
        (is (saml-test/successful-login? response))
        (testing "redirect URI"
          (is (= default-redirect-uri
                 (get-in response [:headers "Location"]))))
        (testing "login attributes"
          (is (= {"extra" "keypairs", "are" "also present"}
                 (t2/select-one-fn :login_attributes User :email "rasta@metabase.com"))))))))

(deftest no-open-redirect-test
  (testing "Check that we prevent open redirects to untrusted sites"
    (with-jwt-default-setup
      (doseq [redirect-uri ["https://badsite.com"
                            "//badsite.com"
                            "https:///badsite.com"]]
        (is (= "Invalid redirect URL"
               (-> (saml-test/client
                    :get 400 "/auth/sso" {:request-options {:redirect-strategy :none}}
                    :return_to redirect-uri
                    :jwt (jwt/sign {:email      "rasta@metabase.com"
                                    :first_name "Rasta"
                                    :last_name  "Toucan"
                                    :extra      "keypairs"
                                    :are        "also present"}
                                   default-jwt-secret))
                   :message)))))))

(deftest expired-jwt-test
  (testing "Check an expired JWT"
    (with-jwt-default-setup
      (is (= "Token is older than max-age (180)"
             (:message (saml-test/client :get 401 "/auth/sso" {:request-options {:redirect-strategy :none}}
                                         :return_to default-redirect-uri
                                         :jwt (jwt/sign {:email "test@metabase.com", :first_name "Test" :last_name "User"
                                                         :iat   (- (buddy-util/now) (u/minutes->seconds 5))}
                                                        default-jwt-secret))))))))

(defmacro with-users-with-email-deleted {:style/indent 1} [user-email & body]
  `(try
     ~@body
     (finally
       (t2/delete! User :%lower.email (u/lower-case-en ~user-email)))))

(deftest create-new-account-test
  (testing "A new account will be created for a JWT user we haven't seen before"
    (with-jwt-default-setup
      (with-users-with-email-deleted "newuser@metabase.com"
        (letfn [(new-user-exists? []
                  (boolean (seq (t2/select User :%lower.email "newuser@metabase.com"))))]
          (is (false? (new-user-exists?)))
          (let [response (saml-test/client-full-response :get 302 "/auth/sso"
                                                         {:request-options {:redirect-strategy :none}}
                                                         :return_to default-redirect-uri
                                                         :jwt (jwt/sign {:email      "newuser@metabase.com"
                                                                         :first_name "New"
                                                                         :last_name  "User"
                                                                         :more       "stuff"
                                                                         :for        "the new user"}
                                                                        default-jwt-secret))]
            (is (saml-test/successful-login? response))
            (let [new-user (t2/select-one User :email "newuser@metabase.com")]
              (testing "new user"
                (is (= {:email        "newuser@metabase.com"
                        :first_name   "New"
                        :is_qbnewb    true
                        :is_superuser false
                        :id           true
                        :last_name    "User"
                        :date_joined  true
                        :common_name  "New User"}
                       (-> (mt/boolean-ids-and-timestamps [new-user])
                           first
                           (dissoc :last_login)))))
              (testing "User Invite Event is logged."
                (is (= "newuser@metabase.com"
                       (get-in (mt/latest-audit-log-entry :user-invited (:id new-user))
                               [:details :email]))))
              (testing "attributes"
                (is (= {"more" "stuff"
                        "for"  "the new user"}
                       (t2/select-one-fn :login_attributes User :email "newuser@metabase.com")))))))))))

(deftest update-account-test
  (testing "A new account with 'Unknown' name will be created for a new JWT user without a first or last name."
    (with-jwt-default-setup
      (with-users-with-email-deleted "newuser@metabase.com"
        (letfn [(new-user-exists? []
                  (boolean (seq (t2/select User :%lower.email "newuser@metabase.com"))))]
          (is (= false
                 (new-user-exists?)))
          (let [response (saml-test/client-full-response :get 302 "/auth/sso"
                                                         {:request-options {:redirect-strategy :none}}
                                                         :return_to default-redirect-uri
                                                         :jwt (jwt/sign {:email      "newuser@metabase.com"}
                                                                        default-jwt-secret))]
            (is (saml-test/successful-login? response))
            (testing "new user with no first or last name"
              (is (= [{:email        "newuser@metabase.com"
                       :first_name   nil
                       :is_qbnewb    true
                       :is_superuser false
                       :id           true
                       :last_name    nil
                       :date_joined  true
                       :common_name  "newuser@metabase.com"}]
                     (->> (mt/boolean-ids-and-timestamps (t2/select User :email "newuser@metabase.com"))
                          (map #(dissoc % :last_login)))))))
          (let [response (saml-test/client-full-response :get 302 "/auth/sso"
                                                           {:request-options {:redirect-strategy :none}}
                                                           :return_to default-redirect-uri
                                                           :jwt (jwt/sign {:email      "newuser@metabase.com"
                                                                           :first_name "New"
                                                                           :last_name  "User"}
                                                                          default-jwt-secret))]
            (is (saml-test/successful-login? response))
            (testing "update user first and last name"
              (is (= [{:email        "newuser@metabase.com"
                       :first_name   "New"
                       :is_qbnewb    true
                       :is_superuser false
                       :id           true
                       :last_name    "User"
                       :date_joined  true
                       :common_name  "New User"}]
                     (->> (mt/boolean-ids-and-timestamps (t2/select User :email "newuser@metabase.com"))
                          (map #(dissoc % :last_login))))))))))))

(deftest group-mappings-test
  (testing "make sure our setting for mapping group names -> IDs works"
    (with-sso-jwt-token
      (mt/with-temporary-setting-values [jwt-group-mappings {"group_1" [1 2 3]
                                                             "group_2" [3 4]
                                                             "group_3" [5]}]
        (testing "keyword group names"
          (is (= #{1 2 3 4}
                 (#'mt.jwt/group-names->ids [:group_1 :group_2]))))
        (testing "string group names"
          (is (= #{3 4 5}
                 (#'mt.jwt/group-names->ids ["group_2" "group_3"]))))))))

(defn- group-memberships [user-or-id]
  (when-let [group-ids (seq (t2/select-fn-set :group_id PermissionsGroupMembership :user_id (u/the-id user-or-id)))]
    (t2/select-fn-set :name PermissionsGroup :id [:in group-ids])))

(deftest login-sync-group-memberships-test
  (testing "login should sync group memberships if enabled"
    (with-jwt-default-setup
      (mt/with-temp [PermissionsGroup my-group {:name (str ::my-group)}]
        (mt/with-temporary-setting-values [jwt-group-sync       true
                                           jwt-group-mappings   {"my_group" [(u/the-id my-group)]}
                                           jwt-attribute-groups "GrOuPs"]
          (with-users-with-email-deleted "newuser@metabase.com"
            (let [response    (saml-test/client-full-response :get 302 "/auth/sso"
                                                              {:request-options {:redirect-strategy :none}}
                                                              :return_to default-redirect-uri
                                                              :jwt (jwt/sign {:email      "newuser@metabase.com"
                                                                              :first_name "New"
                                                                              :last_name  "User"
                                                                              :more       "stuff"
                                                                              :GrOuPs     ["my_group"]
                                                                              :for        "the new user"}
                                                                             default-jwt-secret))]
              (is (saml-test/successful-login? response))
              (is (= #{"All Users"
                       ":metabase-enterprise.sso.integrations.jwt-test/my-group"}
                     (group-memberships (u/the-id (t2/select-one-pk User :email "newuser@metabase.com"))))))))))))

(deftest create-new-jwt-user-no-user-provisioning-test
  (testing "When user provisioning is disabled, throw an error if we attempt to create a new user."
    (with-jwt-default-setup
      (with-redefs [sso-settings/jwt-user-provisioning-enabled? (constantly false)
                    public-settings/site-name (constantly "test")]
        (is
         (thrown-with-msg?
          clojure.lang.ExceptionInfo
          #"Sorry, but you'll need a test account to view this page. Please contact your administrator."
          (#'mt.jwt/fetch-or-create-user! "Test" "User" "test1234@metabase.com" nil)))))))

(deftest jwt-token-test
  (testing "should return a session token when token=true"
    (with-jwt-default-setup
      (mt/with-temporary-setting-values [enable-embedding true]
        (let [jwt-iat-time (buddy-util/now)
              jwt-exp-time (+ (buddy-util/now) 3600)
              jwt-payload  (jwt/sign {:email      "rasta@metabase.com"
                                      :first_name "Rasta"
                                      :last_name  "Toucan"
                                      :extra      "keypairs"
                                      :are        "also present"
                                      :iat        jwt-iat-time
                                      :exp        jwt-exp-time}
                                     default-jwt-secret)
              result       (saml-test/client-full-response :get 200 "/auth/sso"
                                                           :token true
                                                           :jwt jwt-payload)]
          (is (=? {:id  (mt/malli=? ms/NonBlankString)
                   :iat jwt-iat-time
                   :exp jwt-exp-time}
                  (:body result)))))))

  (testing "should not return a session token when embedding is disabled"
    (with-jwt-default-setup
      (mt/with-temporary-setting-values [enable-embedding false]
        (let [jwt-iat-time (buddy-util/now)
              jwt-exp-time (+ (buddy-util/now) 3600)
              jwt-payload  (jwt/sign {:email      "rasta@metabase.com"
                                      :first_name "Rasta"
                                      :last_name  "Toucan"
                                      :extra      "keypairs"
                                      :are        "also present"
                                      :iat        jwt-iat-time
                                      :exp        jwt-exp-time}
                                     default-jwt-secret)
              result       (saml-test/client-full-response :get 400 "/auth/sso"
                                                           :token true
                                                           :jwt jwt-payload)]
          (is result nil)))))

  (testing "should not return a session token when token=false"
    (with-jwt-default-setup
      (mt/with-temporary-setting-values [enable-embedding true]
        (let [jwt-iat-time (buddy-util/now)
              jwt-exp-time (+ (buddy-util/now) 3600)
              jwt-payload  (jwt/sign {:email      "rasta@metabase.com"
                                      :first_name "Rasta"
                                      :last_name  "Toucan"
                                      :extra      "keypairs"
                                      :are        "also present"
                                      :iat        jwt-iat-time
                                      :exp        jwt-exp-time}
                                     default-jwt-secret)
              result       (saml-test/client-full-response :get 302 "/auth/sso"
                                                           {:request-options {:redirect-strategy :none}}
                                                           :return_to default-redirect-uri
                                                           :jwt jwt-payload)]
          (is result nil))))))
