(ns metabase.metabot.instance-test
  (:require [clojure.test :refer :all]
            [metabase.metabot.instance :as metabot.instance]
            [metabase.util.date-2 :as u.date]))

(deftest am-i-the-metabot-test?
  (testing "test that if we're not the MetaBot based on Settings, our function to check is working correctly"
    (#'metabot.instance/metabot-instance-uuid nil)
    (#'metabot.instance/metabot-instance-last-checkin nil)
    (is (= false
           (#'metabot.instance/am-i-the-metabot?)))))

(deftest become-test-metabot-test
  (testing "test that if nobody is currently the MetaBot, we will become the MetaBot"
    (#'metabot.instance/metabot-instance-uuid nil)
    (#'metabot.instance/metabot-instance-last-checkin nil)
    (#'metabot.instance/check-and-update-instance-status!)
    (is (#'metabot.instance/am-i-the-metabot?))))

(deftest become-the-metabot-if-no-checkins-test
  (testing "test that if nobody has checked in as MetaBot for a while, we will become the MetaBot"
    (#'metabot.instance/metabot-instance-uuid (str (java.util.UUID/randomUUID)))
    (#'metabot.instance/metabot-instance-last-checkin
     (u.date/add (#'metabot.instance/current-timestamp-from-db) :minute -10))
    (#'metabot.instance/check-and-update-instance-status!)
    (is (#'metabot.instance/am-i-the-metabot?))))

(deftest another-instance-test
  (testing "check that if another instance has checked in recently, we will *not* become the MetaBot"
    (#'metabot.instance/metabot-instance-uuid (str (java.util.UUID/randomUUID)))
    (#'metabot.instance/metabot-instance-last-checkin (#'metabot.instance/current-timestamp-from-db))
    (#'metabot.instance/check-and-update-instance-status!)
    (is (= false
           (#'metabot.instance/am-i-the-metabot?)))))
