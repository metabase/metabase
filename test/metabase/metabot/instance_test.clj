(ns metabase.metabot.instance-test
  (:require [expectations :refer [expect]]
            [metabase.metabot.instance :as metabot.instance]
            [metabase.util.date-2 :as u.date]))

;; test that if we're not the MetaBot based on Settings, our function to check is working correctly
(expect
  false
  (do
    (#'metabot.instance/metabot-instance-uuid nil)
    (#'metabot.instance/metabot-instance-last-checkin nil)
    (#'metabot.instance/am-i-the-metabot?)))

;; test that if nobody is currently the MetaBot, we will become the MetaBot
(expect
  (do
    (#'metabot.instance/metabot-instance-uuid nil)
    (#'metabot.instance/metabot-instance-last-checkin nil)
    (#'metabot.instance/check-and-update-instance-status!)
    (#'metabot.instance/am-i-the-metabot?)))

;; test that if nobody has checked in as MetaBot for a while, we will become the MetaBot
(expect
  (do
    (#'metabot.instance/metabot-instance-uuid (str (java.util.UUID/randomUUID)))
    (#'metabot.instance/metabot-instance-last-checkin (u.date/add (#'metabot.instance/current-timestamp-from-db) :minute -10))
    (#'metabot.instance/check-and-update-instance-status!)
    (#'metabot.instance/am-i-the-metabot?)))

;; check that if another instance has checked in recently, we will *not* become the MetaBot
(expect
  false
  (do
    (#'metabot.instance/metabot-instance-uuid (str (java.util.UUID/randomUUID)))
    (#'metabot.instance/metabot-instance-last-checkin (#'metabot.instance/current-timestamp-from-db))
    (#'metabot.instance/check-and-update-instance-status!)
    (#'metabot.instance/am-i-the-metabot?)))
