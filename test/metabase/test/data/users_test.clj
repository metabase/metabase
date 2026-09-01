(ns metabase.test.data.users-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest user-http-request-does-not-log-the-user-in-test
  (testing "the session a request borrows is not a login"
    (mt/with-temp [:model/User {user-id :id} {:last_login nil}]
      (mt/user-http-request {:id user-id} :get 200 "user/current")
      (is (nil? (t2/select-one-fn :last_login :model/User 'id user-id))
          "last_login stays empty, so :event/user-login never fired")
      (is (false? (t2/exists? :core_session 'user_id user-id))
          "and the borrowed session is deleted"))))
