(ns metabase.server.middleware.mfa-enforcement-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- enable-require-mfa!
  "Enable the require-mfa setting for tests. Temporarily gives crowberto MFA so the setter validation passes."
  []
  (mt/with-temp-vals-in-db :model/User (mt/user->id :crowberto) {:totp_enabled true}
    (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value true})))

(defn- disable-require-mfa! []
  (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value false}))

(deftest enforcement-off-by-default-test
  (testing "With require-mfa disabled, non-MFA users can access any endpoint"
    (is (some? (mt/user-http-request :rasta :get 200 "user/current")))))

(deftest enforcement-blocks-non-mfa-users-test
  (enable-require-mfa!)
  (try
    (testing "Non-MFA password user gets 403 on non-allowlisted endpoint"
      (let [response (mt/user-http-request :rasta :get 403 "card")]
        (is (true? (:mfa-setup-required response)))))

    (testing "Non-MFA password user can still access allowlisted endpoints"
      (is (some? (mt/user-http-request :rasta :get 200 "user/current")))
      (is (some? (mt/user-http-request :rasta :get 200 "session/properties"))))

    (testing "User with MFA enabled is unaffected"
      (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled true}
        (is (some? (mt/user-http-request :rasta :get 200 "card")))))

    (testing "SSO user (with sso_source) is exempt"
      (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:sso_source "google"}
        (is (some? (mt/user-http-request :rasta :get 200 "card")))))
    (finally
      (disable-require-mfa!))))

(deftest enforcement-exempts-superusers-with-mfa-test
  (enable-require-mfa!)
  (try
    (testing "Superuser with MFA can access everything (crowberto still has MFA from enable)"
      (mt/with-temp-vals-in-db :model/User (mt/user->id :crowberto) {:totp_enabled true}
        (is (some? (mt/user-http-request :crowberto :get 200 "card")))))
    (finally
      (disable-require-mfa!))))
