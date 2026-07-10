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
                 :model/User {unenrolled-id :id, unenrolled-email :email} {}]
    (testing "requires superuser"
      (mt/user-http-request :rasta :get 403 "ee/mfa/admin/overview"))
    (let [overview (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/overview")
          listed?  (fn [user-id users] (boolean (some #(= user-id (:id %)) users)))]
      (is (boolean? (:encryption_key_set overview)))
      (is (pos? (:enrolled_count overview)))
      (testing "unenrolled count covers active users without a confirmed enrollment"
        ;; both temp users are active + personal; only one is enrolled
        (is (pos? (:unenrolled_count overview))))
      (testing "the per-user page is bounded and queryable via the confirmed_at column"
        (is (<= (count (:unenrolled_users overview)) (:limit overview)))
        (is (not (listed? enrolled-id (:unenrolled_users overview))))
        ;; the temp user may fall past page 1 on a big test instance — page to them by offset
        (loop [offset 0]
          (let [{:keys [unenrolled_users limit unenrolled_count]}
                (mt/user-http-request :crowberto :get 200 "ee/mfa/admin/overview" :offset offset)]
            (cond
              (listed? unenrolled-id unenrolled_users)
              (is (some #(= unenrolled-email (:email %)) unenrolled_users))

              (< (+ offset limit) unenrolled_count)
              (recur (+ offset limit))

              :else
              (is false (str "unenrolled user " unenrolled-id " never appeared in any page")))))))))
