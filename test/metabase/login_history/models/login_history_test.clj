(ns metabase.login-history.models.login-history-test
  (:require
   [clojure.test :refer :all]
   [metabase.login-history.models.login-history :as login-history]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest first-login-on-this-device?-test
  (let [device-1 (str (random-uuid))
        device-2 (str (random-uuid))]
    (mt/with-temp [:model/User         {user-id :id} {}
                   :model/LoginHistory history-1 {:user_id user-id, :device_id device-1}]
      (testing "one login to device 1 -- should be the first login with this device"
        (is (= true
               (#'login-history/first-login-on-this-device? history-1)))
        (is (= true
               (#'login-history/first-login-ever? history-1))))
      (testing "add a history item for a *different* device -- should be the first login with this device"
        (mt/with-temp [:model/LoginHistory _ {:user_id user-id, :device_id device-2}]
          (is (= true
                 (#'login-history/first-login-on-this-device? history-1)))
          (is (= false
                 (#'login-history/first-login-ever? history-1)))
          (testing "add a second history item for device 1 -- should *not* be the first login with this device"
            (mt/with-temp [:model/LoginHistory _ {:user_id user-id, :device_id device-1}]
              (is (= false
                     (#'login-history/first-login-on-this-device? history-1)))
              (is (= false
                     (#'login-history/first-login-ever? history-1))))))))))
