(ns metabase.session.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.session.settings :as session.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest require-mfa-setting-test
  (testing "require-mfa defaults to false"
    (is (false? (session.settings/require-mfa))))

  (testing "require-mfa is readable via session properties (public visibility)"
    (let [props (mt/client :get 200 "session/properties")]
      (is (contains? props :require-mfa))
      (is (false? (:require-mfa props))))))

(deftest require-mfa-admin-only-write-test
  (testing "non-admin cannot update require-mfa"
    (mt/user-http-request :rasta :put 403 "setting/require-mfa" {:value true})))

(deftest require-mfa-admin-must-have-mfa-test
  (testing "admin without MFA cannot enable require-mfa"
    (mt/user-http-request :crowberto :put 400 "setting/require-mfa" {:value true}))

  (testing "admin with MFA can enable require-mfa"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :crowberto) {:totp_enabled true}
      (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value true})
      (is (true? (session.settings/require-mfa)))
      ;; cleanup: disable the setting while admin still has MFA
      (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value false}))))

(deftest require-mfa-disable-test
  (testing "admin can disable require-mfa without needing MFA themselves"
    ;; first enable it while admin has MFA
    (mt/with-temp-vals-in-db :model/User (mt/user->id :crowberto) {:totp_enabled true}
      (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value true}))
    ;; now disable it without MFA (should work — only enabling requires MFA)
    (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value false})
    (is (false? (session.settings/require-mfa)))))
