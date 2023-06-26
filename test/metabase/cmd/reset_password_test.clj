(ns metabase.cmd.reset-password-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.reset-password :as reset-password]
   [metabase.models.user :refer [User]]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest reset-password-test
  (testing "set reset token throws exception on unknown email"
    (is (thrown? Exception
                 (#'reset-password/set-reset-token! "some.random.email.to.reset@metabase.com"))))

  (testing "reset token generated for known email in differing case"
    (let [email "some.valid.user.to.reset@metabase.com"]
      (t2.with-temp/with-temp [User _ {:email (u/upper-case-en email)}]
        (is (instance?
             String
             (#'reset-password/set-reset-token! email)))))))
