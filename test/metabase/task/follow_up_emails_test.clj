(ns metabase.task.follow-up-emails-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.email-test :refer [inbox with-fake-inbox]]
            [metabase.task.follow-up-emails :as follow-up-emails]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest send-follow-up-email-test
  (testing (str "Make sure that `send-follow-up-email!` only sends a single email instead even when triggered multiple "
                "times (#4253) follow-up emails get sent to the oldest admin"))
  (tu/with-temporary-setting-values [anon-tracking-enabled true
                                     follow-up-email-sent  false]
    (with-fake-inbox
      (#'follow-up-emails/send-follow-up-email!)
      (#'follow-up-emails/send-follow-up-email!)
      (is (= 1
             (-> @inbox vals first count))))))

(deftest should-send-abandoment-email-test
  (testing "Conditions where abandonment emails should be sent"
    (doseq [now           [(t/zoned-date-time) (t/offset-date-time) (t/instant)]
            last-user     [0 1 3 nil]
            last-activity [0 1 3 nil]
            last-view     [0 1 3 nil]]
      (testing (format "classes = %s, last-user = %d weeks ago, last-activity = %d weeks ago, last-view = %d weeks ago"
                       (.getName (class now)) last-user last-activity last-view)
        (is (= (every? #(contains? #{nil 3} %) [last-user last-activity last-view])
               (#'follow-up-emails/should-send-abandoment-email?
                (when last-user     (t/minus now (t/weeks last-user)))
                (when last-activity (t/minus now (t/weeks last-activity)))
                (when last-view     (t/minus now (t/weeks last-view))))))))))
