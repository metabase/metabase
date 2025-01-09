(ns metabase.events.last-login-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest user-login-test
  (testing "`:user-login` event"
    (mt/with-temp [:model/User {user-id :id, last-login :last_login}]
      (is (= nil
             last-login))
      (events/publish-event! :event/user-login {:user-id user-id})
      (is (some? (t2/select-one-fn :last_login :model/User :id user-id))))))
