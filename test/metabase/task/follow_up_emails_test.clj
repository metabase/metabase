(ns ^:mb/once metabase.task.follow-up-emails-test
  (:require
   [clojure.test :refer :all]
   [metabase.email-test :refer [inbox with-fake-inbox]]
   [metabase.task.follow-up-emails :as follow-up-emails]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as mt]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest send-follow-up-email-test
  (testing (str "Make sure that `send-follow-up-email!` only sends a single email instead even when triggered multiple "
                "times (#4253) follow-up emails get sent to the oldest admin"))
  (mt/with-temporary-setting-values [anon-tracking-enabled true
                                     follow-up-email-sent  false]
    (with-fake-inbox
      (#'follow-up-emails/send-follow-up-email!)
      (#'follow-up-emails/send-follow-up-email!)
      (is (= 1
             (-> @inbox vals first count))))))

(deftest send-follow-up-email-no-survey-test
  (testing "Make sure we don't send an email when no-surveys is true."
   (mt/with-temporary-setting-values [anon-tracking-enabled true
                                      follow-up-email-sent  false
                                      no-surveys true]
     (with-fake-inbox
       (#'follow-up-emails/send-follow-up-email!)
       (is (= 0
              (-> @inbox vals first count)))))))
