(ns metabase-enterprise.sso.integrations.jwt-test
  (:require
   [buddy.sign.jwt :as jwt]
   [buddy.sign.util :as buddy-util]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [crypto.random :as crypto-random]
   [metabase-enterprise.sso.integrations.jwt :as mt.jwt]
   [metabase-enterprise.sso.integrations.saml-test :as saml-test]
   [metabase.models.permissions-group :refer [PermissionsGroup]]
   [metabase.models.permissions-group-membership :refer [PermissionsGroupMembership]]
   [metabase.models.user :refer [User]]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :test-users))

(defn- disable-other-sso-types [thunk]
  (mt/with-temporary-setting-values [ldap-enabled false
                                     saml-enabled false]
    (thunk)))

(use-fixtures :each disable-other-sso-types)

(def ^:private default-idp-uri      "http://test.idp.metabase.com")
(def ^:private default-redirect-uri "http://localhost:3000/test")
(def ^:private default-jwt-secret   (crypto-random/hex 32))

(deftest sso-prereqs-test
  (testing "SSO requests fail if JWT hasn't been configured or enabled"
    (mt/with-temporary-setting-values [jwt-enabled               false
                                       jwt-identity-provider-uri nil
                                       jwt-shared-secret         nil]
      (saml-test/with-valid-premium-features-token
        (is (= "SSO has not been enabled and/or configured"
               (saml-test/client :get 400 "/auth/sso"))))

      (testing "SSO requests fail if they don't have a valid premium-features token"
        (premium-features-test/with-premium-features nil
          (is (= "SSO requires a valid token"
                 (saml-test/client :get 403 "/auth/sso")))))))

  (testing "SSO requests fail if JWT is enabled but hasn't been configured"
    (saml-test/with-valid-premium-features-token
      (mt/with-temporary-setting-values [jwt-enabled               true
                                         jwt-identity-provider-uri nil]
        (is (= "SSO has not been enabled and/or configured"
               (saml-test/client :get 400 "/auth/sso"))))))

  (testing "SSO requests fail if JWT is configured but hasn't been enabled"
    (saml-test/with-valid-premium-features-token
      (mt/with-temporary-setting-values [jwt-enabled               false
                                         jwt-identity-provider-uri default-idp-uri
                                         jwt-shared-secret         default-jwt-secret]
        (is (= "SSO has not been enabled and/or configured"
               (saml-test/client :get 400 "/auth/sso"))))))

  (testing "The JWT Shared Secret must also be included for SSO to be configured"
    (saml-test/with-valid-premium-features-token
      (mt/with-temporary-setting-values [jwt-enabled               true
                                         jwt-identity-provider-uri default-idp-uri
                                         jwt-shared-secret         nil]
        (is (= "SSO has not been enabled and/or configured"
               (saml-test/client :get 400 "/auth/sso")))))))

(defn- call-with-default-jwt-config [f]
  (mt/with-temporary-setting-values [jwt-enabled               true
                                     jwt-identity-provider-uri default-idp-uri
                                     jwt-shared-secret         default-jwt-secret
                                     site-url                  "http://localhost"]
    (f)))

(defmacro ^:private with-jwt-default-setup [& body]
  `(disable-other-sso-types
    (fn []
      (saml-test/with-valid-premium-features-token
        (saml-test/call-with-login-attributes-cleared!
         (fn []
           (call-with-default-jwt-config
            (fn []
              ~@body))))))))

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
                                                                     :are        "also present"}
                                                                    default-jwt-secret))]
        (is (saml-test/successful-login? response))
        (testing "redirect URI"
          (is (= default-redirect-uri
                 (get-in response [:headers "Location"]))))
        (testing "login attributes"
          (is (= {"extra" "keypairs", "are" "also present"}
                 (t2/select-one-fn :login_attributes User :email "rasta@metabase.com"))))))))

(deftest no-open-redirect-test
  (testing "Check a JWT with bad (open redirect)"
    (with-jwt-default-setup
      (is (= "SSO is trying to do an open redirect to an untrusted site"
             (saml-test/client
               :get 400 "/auth/sso" {:request-options {:redirect-strategy :none}}
               :return_to "https://evilsite.com"
               :jwt (jwt/sign {:email      "rasta@metabase.com"
                               :first_name "Rasta"
                               :last_name  "Toucan"
                               :extra      "keypairs"
                               :are        "also present"}
                              default-jwt-secret)))))))

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
          (is (= false
                 (new-user-exists?)))
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
            (testing "new user"
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
            (testing "attributes"
              (is (= {"more" "stuff"
                      "for"  "the new user"}
                     (t2/select-one-fn :login_attributes User :email "newuser@metabase.com"))))))))))

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
    (mt/with-temporary-setting-values [jwt-group-mappings {"group_1" [1 2 3]
                                                           "group_2" [3 4]
                                                           "group_3" [5]}]
      (testing "keyword group names"
        (is (= #{1 2 3 4}
               (#'mt.jwt/group-names->ids [:group_1 :group_2]))))
      (testing "string group names"
        (is (= #{3 4 5}
               (#'mt.jwt/group-names->ids ["group_2" "group_3"])))))))

(defn- group-memberships [user-or-id]
  (when-let [group-ids (seq (t2/select-fn-set :group_id PermissionsGroupMembership :user_id (u/the-id user-or-id)))]
    (t2/select-fn-set :name PermissionsGroup :id [:in group-ids])))

(deftest login-sync-group-memberships-test
  (testing "login should sync group memberships if enabled"
    (with-jwt-default-setup
      (t2.with-temp/with-temp [PermissionsGroup my-group {:name (str ::my-group)}]
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
