(ns metabase-enterprise.security-center.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest security-center-enabled?-test
  (testing "enabled when feature flag present, not trial, and self-hosted"
    (mt/with-premium-features #{:admin-security-center}
      (is (true? (premium-features/security-center-enabled?)))))
  (testing "disabled without the feature flag"
    (mt/with-premium-features #{}
      (is (false? (premium-features/security-center-enabled?)))))
  (testing "disabled on cloud (hosted) even with the feature flag"
    (mt/with-premium-features #{:admin-security-center :hosting}
      (is (false? (premium-features/security-center-enabled?)))))
  (testing "disabled on trial even with the feature flag"
    (mt/with-premium-features #{:admin-security-center}
      (mt/with-dynamic-fn-redefs [token-check/is-trial? (constantly true)]
        (is (false? (premium-features/security-center-enabled?)))))))

(deftest security-center-email-recipients-test
  (testing "PUT /api/setting/security-center-email-recipients"
    (mt/with-premium-features #{:admin-security-center}
      (testing "superuser can set email recipients"
        (mt/user-http-request :crowberto :put 204 "setting/security-center-email-recipients"
                              {:value [{:type "notification-recipient/user" :user_id (mt/user->id :crowberto) :details nil}]})
        (is (= [{:type "notification-recipient/user" :user_id (mt/user->id :crowberto) :details nil}]
               (mt/user-http-request :crowberto :get 200 "setting/security-center-email-recipients"))))

      (testing "rejects null"
        (mt/user-http-request :crowberto :put 400 "setting/security-center-email-recipients"
                              {:value nil}))

      (testing "rejects empty list"
        (mt/user-http-request :crowberto :put 400 "setting/security-center-email-recipients"
                              {:value []}))

      (testing "non-superuser gets 403"
        (mt/user-http-request :rasta :put 403 "setting/security-center-email-recipients"
                              {:value [{:type "notification-recipient/user" :user_id (mt/user->id :crowberto) :details nil}]}))))

  (testing "requires premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :put 500 "setting/security-center-email-recipients"
                            {:value [{:type "notification-recipient/user" :user_id (mt/user->id :crowberto) :details nil}]}))))

(deftest security-center-slack-channel-test
  (testing "PUT /api/setting/security-center-slack-channel"
    (mt/with-premium-features #{:admin-security-center}
      (testing "rejects value when Slack is not configured"
        (mt/with-temporary-setting-values [slack-token-valid? false]
          (mt/user-http-request :crowberto :put 400 "setting/security-center-slack-channel"
                                {:value "#security"})))

      (testing "superuser can set channel when Slack is configured"
        (mt/with-temporary-setting-values [slack-token-valid? true]
          (mt/user-http-request :crowberto :put 204 "setting/security-center-slack-channel"
                                {:value "#security"})
          (is (= "#security"
                 (mt/user-http-request :crowberto :get 200 "setting/security-center-slack-channel")))))

      (testing "superuser can set to null (disable Slack)"
        (mt/user-http-request :crowberto :put 204 "setting/security-center-slack-channel"
                              {:value nil})
        (mt/user-http-request :crowberto :get 204 "setting/security-center-slack-channel"))

      (testing "non-superuser gets 403"
        (mt/with-temporary-setting-values [slack-token-valid? true]
          (mt/user-http-request :rasta :put 403 "setting/security-center-slack-channel"
                                {:value "#security"})))))

  (testing "requires premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :put 500 "setting/security-center-slack-channel"
                            {:value "#security"}))))
