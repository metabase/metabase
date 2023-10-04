(ns metabase.events.last-login-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.models.user :refer [User]]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest user-login-test
  (testing "`:user-login` event"
    (t2.with-temp/with-temp [User {user-id :id, last-login :last_login}]
      (is (= nil
             last-login))
      (events/publish-event! :event/user-login {:user-id user-id})
      (is (some? (t2/select-one-fn :last_login User :id user-id))))))
