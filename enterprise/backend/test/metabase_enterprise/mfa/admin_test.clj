(ns metabase-enterprise.mfa.admin-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest admin-remove-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/AuthIdentity _ {:user_id     user-id
                                        :provider    "totp"
                                        :confirmed_at (t/instant)
                                        :credentials  {:secret (totp/generate-secret)}}]
    (testing "requires superuser"
      (mt/user-http-request :rasta :post 403 "ee/mfa/admin/remove" {:user_id user-id}))
    (testing "removes the enrollment, even with zero premium features (lockout escape hatch)"
      (mt/with-premium-features #{}
        (mt/user-http-request :crowberto :post 204 "ee/mfa/admin/remove" {:user_id user-id})
        (is (nil? (enrollment/enrolled-method user-id)))))))

(deftest admin-remove-is-audited-test
  ;; audit rows require the :audit-app feature at event time (premium-features/log-enabled?)
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :confirmed_at (t/instant)
                                          :credentials  {:secret (totp/generate-secret)}}]
      (mt/user-http-request :crowberto :post 204 "ee/mfa/admin/remove" {:user_id user-id})
      (testing "the removal is audited against the affected user"
        (is (=? {:topic :mfa-disabled}
                (mt/latest-audit-log-entry :mfa-disabled user-id)))))))

(deftest admin-overview-test
  (mt/with-temp [:model/User {enrolled-id :id} {}
                 :model/AuthIdentity _ {:user_id      enrolled-id
                                        :provider     "totp"
                                        :confirmed_at (t/instant)
                                        :credentials  {:secret (totp/generate-secret)}}
                 :model/User _ {}]
    (testing "requires superuser"
      (mt/user-http-request :rasta :get 403 "ee/mfa/admin/overview"))
    (let [overview (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/overview")]
      (is (boolean? (:encryption_key_set overview)))
      (is (pos? (:enrolled_count overview)))
      (testing "unenrolled count covers active users without a confirmed enrollment"
        ;; both temp users are active + personal; only one is enrolled
        (is (pos? (:unenrolled_count overview)))))))
