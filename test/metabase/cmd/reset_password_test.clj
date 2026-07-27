(ns metabase.cmd.reset-password-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.reset-password :as reset-password]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest reset-password-test
  (testing "set reset token throws exception on unknown email"
    (is (thrown? Exception
                 (#'reset-password/set-reset-token! "some.random.email.to.reset@metabase.com"))))
  (testing "reset token generated for known email in differing case"
    (let [email "some.valid.user.to.reset@metabase.com"]
      (mt/with-temp [:model/User _ {:email (u/upper-case-en email)}]
        (is (instance?
             String
             (#'reset-password/set-reset-token! email)))))))

(deftest reset-password-deactivated-user-test
  (testing "set reset token throws exception for a deactivated user"
    (let [email "some.deactivated.user.to.reset@metabase.com"]
      (mt/with-temp [:model/User {user-id :id} {:email email, :is_active false}]
        (is (thrown-with-msg?
             Exception
             #"deactivated"
             (#'reset-password/set-reset-token! email)))
        (testing "and leaves no reset token behind"
          (is (not (t2/exists? :model/AuthIdentity
                               :user_id  user-id
                               :provider "emailed-secret-password-reset")))
          (is (nil? (t2/select-one-fn :reset_token :model/User :id user-id))))))))
