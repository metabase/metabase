(ns metabase.metabot-test
  (:require [expectations :refer :all]
            [metabase.metabot :as metabot]
            [metabase.util.date :as du]))

;; test that if we're not the MetaBot based on Settings, our function to check is working correctly
(expect
  false
  (do
    (#'metabot/metabot-instance-uuid nil)
    (#'metabot/metabot-instance-last-checkin nil)
    (#'metabot/am-i-the-metabot?)))

;; test that if nobody is currently the MetaBot, we will become the MetaBot
(expect
  (do
    (#'metabot/metabot-instance-uuid nil)
    (#'metabot/metabot-instance-last-checkin nil)
    (#'metabot/check-and-update-instance-status!)
    (#'metabot/am-i-the-metabot?)))

;; test that if nobody has checked in as MetaBot for a while, we will become the MetaBot
(expect
  (do
    (#'metabot/metabot-instance-uuid (str (java.util.UUID/randomUUID)))
    (#'metabot/metabot-instance-last-checkin (du/relative-date :minute -10 (#'metabot/current-timestamp-from-db)))
    (#'metabot/check-and-update-instance-status!)
    (#'metabot/am-i-the-metabot?)))

;; check that if another instance has checked in recently, we will *not* become the MetaBot
(expect
  false
  (do
    (#'metabot/metabot-instance-uuid (str (java.util.UUID/randomUUID)))
    (#'metabot/metabot-instance-last-checkin (#'metabot/current-timestamp-from-db))
    (#'metabot/check-and-update-instance-status!)
    (#'metabot/am-i-the-metabot?)))
