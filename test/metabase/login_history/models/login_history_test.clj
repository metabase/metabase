(ns metabase.login-history.models.login-history-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.login-history.models.login-history :as login-history]
   [metabase.login-history.settings :as login-history.settings]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest first-login-on-this-device?-test
  (let [device-1 (str (random-uuid))
        device-2 (str (random-uuid))]
    (mt/with-temp [:model/User         {user-id :id} {}
                   :model/LoginHistory history-1 {:user_id user-id, :device_id device-1}]
      (testing "one login to device 1 -- should be the first login with this device"
        (is (true?
             (#'login-history/first-login-on-this-device? history-1)))
        (is (true?
             (#'login-history/first-login-ever? history-1))))
      (testing "add a history item for a *different* device -- should be the first login with this device"
        (mt/with-temp [:model/LoginHistory _ {:user_id user-id, :device_id device-2}]
          (is (true?
               (#'login-history/first-login-on-this-device? history-1)))
          (is (= false
                 (#'login-history/first-login-ever? history-1)))
          (testing "add a second history item for device 1 -- should *not* be the first login with this device"
            (mt/with-temp [:model/LoginHistory _ {:user_id user-id, :device_id device-1}]
              (is (= false
                     (#'login-history/first-login-on-this-device? history-1)))
              (is (= false
                     (#'login-history/first-login-ever? history-1))))))))))

(defn- insert-login-histories! [rows]
  (t2/insert! :model/LoginHistory
              (map #(merge {:device_description "test-agent"
                            :ip_address         "127.0.0.1"} %)
                   rows)))

(defn- new-devices [user-id n]
  (for [_ (range n)]
    {:user_id user-id :device_id (str (random-uuid))}))

(deftest too-many-new-device-emails-recently?-test
  (mt/with-model-cleanup [:model/LoginHistory]
    (testing "per-user circuit breaker for new-device emails"
      (let [cap (login-history.settings/new-device-email-rate-limit-cap)]
        (mt/with-temp [:model/User {user-id :id}       {}
                       :model/User {other-user-id :id} {}]
          (testing "false when the user has no prior first-device events"
            (is (false? (#'login-history/too-many-new-device-emails-recently? user-id))))

          (testing "false at the cap (comparison is strict greater-than)"
            (insert-login-histories! (new-devices user-id cap))
            (is (false? (#'login-history/too-many-new-device-emails-recently? user-id))))

          (testing "true when the user is past the cap"
            (insert-login-histories! (new-devices user-id 1))
            (is (true? (#'login-history/too-many-new-device-emails-recently? user-id))))

          (testing "repeated logins from the same device count as one first-device event"
            (mt/with-temp [:model/User {repeat-user-id :id} {}]
              (insert-login-histories! (repeat 20 {:user_id repeat-user-id :device_id (str (random-uuid))}))
              (is (false? (#'login-history/too-many-new-device-emails-recently? repeat-user-id)))))

          (testing "another user's activity does not count toward this user's limit"
            (insert-login-histories! (new-devices other-user-id 10))
            (mt/with-temp [:model/User {fresh-user-id :id} {}]
              (is (false? (#'login-history/too-many-new-device-emails-recently? fresh-user-id)))))

          (testing "events outside the rate-limit window do not count"
            (mt/with-temp [:model/User {old-user-id :id} {}]
              (let [two-days-ago (t/minus (t/offset-date-time) (t/days 2))]
                (insert-login-histories! (map #(assoc % :timestamp two-days-ago)
                                              (new-devices old-user-id 10))))
              (is (false? (#'login-history/too-many-new-device-emails-recently? old-user-id))))))))))
