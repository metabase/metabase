(ns metabase-enterprise.metabot-v3.tools.invite-user-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.invite-user :as metabot-v3.tools.invite-user]
   [metabase.test :as mt]))

(deftest invite-user-test
  (mt/with-model-cleanup [:model/User]
    (let [invoke-tool #(metabot-v3.tools.invite-user/invite-user {:email %})]
      (testing "The user has to have permission to invite users."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (invoke-tool "user@example.com"))))
      (mt/with-current-user (mt/user->id :crowberto)
        (testing "User can be invited"
          (is (= {:output "user@example.com has been invited to Metabase."}
                 (invoke-tool "user@example.com"))))
        (testing "Return an error message if the user already exists."
          (is (= {:output "Email address already in use."}
                 (invoke-tool "crowberto@metabase.com"))))
        (testing "Return an error message if email is invalid."
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid input: .*"
                                (invoke-tool "total garbage, not an email address"))))))))
