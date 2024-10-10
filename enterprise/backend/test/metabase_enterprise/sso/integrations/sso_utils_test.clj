(ns metabase-enterprise.sso.integrations.sso-utils-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase.test :as mt]))

(deftest check-sso-redirect-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (testing "check-sso-redirect properly validates redirect URIs"
      (are [uri] (sso-utils/check-sso-redirect uri)
        "/"
        "/test"
        "localhost"
        "http://localhost:3000"
        "http://localhost:3000/dashboard/1-test-dashboard?currency=British%20Pound"))

    (testing "check-sso-redirect- throws an error for invalid redirect URIs"
      (are [uri] (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid redirect URL" (sso-utils/check-sso-redirect uri))
        "http://example.com"
        "//example.com"
        "not a url"
        "localhost:3000" ; URI thinks `localhost` here is scheme
        "http://localhost:3000?a=not a param"))))

(def default-user-attributes {:first_name       "Test"
                              :last_name        "User"
                              :email            "create-new-sso-user-test@metabase.com"
                              :sso_source       :jwt
                              :login_attributes {:foo "bar"}})

(deftest create-new-sso-user-test
  (mt/with-model-cleanup [:model/User]
    (testing "create-new-sso-user! creates a new user with the given attributes"
      (let [new-user (sso-utils/create-new-sso-user! default-user-attributes)]
        (is (partial=
             {:first_name "Test"
              :last_name "User"
              :email "create-new-sso-user-test@metabase.com"}
             new-user))))
    (testing "If a user with the given email already exists, a generic exception is thrown"
      (is
       (thrown-with-msg?
        clojure.lang.ExceptionInfo
        #"Error creating new SSO user"
        (sso-utils/create-new-sso-user! default-user-attributes))))))

(deftest create-new-sso-user-do-not-send-email-test
  ;; when create a normal user, we send an invite email, but for sso users we don't
  (testing "creating an sso users shouldn't send an invite email"
    (mt/with-model-cleanup [:model/User]
      (mt/with-fake-inbox
        (sso-utils/create-new-sso-user! default-user-attributes)
        (is (empty? (->> @mt/inbox
                         vals
                         (into [] cat)
                         (map :subject)
                         (filter #(str/includes? % "You're invited to join")))))))))
