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
                                        :credentials {:secret       (totp/generate-secret)
                                                      :confirmed_at (t/instant)}}]
    (testing "requires superuser"
      (mt/user-http-request :rasta :post 403 "ee/mfa/admin/remove" {:user_id user-id}))
    (testing "removes the enrollment, even with zero premium features (lockout escape hatch)"
      (mt/with-premium-features #{}
        (mt/user-http-request :crowberto :post 204 "ee/mfa/admin/remove" {:user_id user-id})
        (is (nil? (enrollment/enrolled-method user-id)))))))

(deftest admin-overview-test
  (mt/with-temp [:model/User {enrolled-id :id} {}
                 :model/AuthIdentity _ {:user_id     enrolled-id
                                        :provider    "totp"
                                        :credentials {:secret       (totp/generate-secret)
                                                      :confirmed_at (t/instant)}}
                 :model/User _unenrolled {}]
    (testing "requires superuser"
      (mt/user-http-request :rasta :get 403 "ee/mfa/admin/overview"))
    (let [overview (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/overview")]
      (is (boolean? (:encryption_key_set overview)))
      (is (pos? (:enrolled_count overview)))
      (testing "unenrolled count covers active users without a confirmed enrollment"
        ;; both temp users are active + personal; only one is enrolled
        (is (pos? (:unenrolled_count overview)))
        (is (nil? (:unenrolled_users overview)) "the unbounded per-user list is gone")))))
