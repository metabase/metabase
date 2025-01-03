(ns metabase.events.last-login-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest user-login-test
  (testing "`:user-login` event"
    (t2.with-temp/with-temp [:model/User {user-id :id, last-login :last_login}]
      (is (= nil
             last-login))
      (events/publish-event! :event/user-login {:user-id user-id})
      (is (some? (t2/select-one-fn :last_login :model/User :id user-id))))))
