(ns metabase.task.follow-up-emails-test
  (:require [expectations :refer :all]
            [metabase.email-test :refer [inbox with-fake-inbox]]
            [metabase.task.follow-up-emails :as follow-up-emails]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]))

;; Make sure that `send-follow-up-email!` only sends a single email instead even when triggered multiple times (#4253)
;; follow-up emails get sent to the oldest admin
(expect
  1
  (tu/with-temporary-setting-values [anon-tracking-enabled true
                                     follow-up-email-sent  false]
    (test-users/create-users-if-needed!)
    (with-fake-inbox
      (#'follow-up-emails/send-follow-up-email!)
      (#'follow-up-emails/send-follow-up-email!)
      (-> @inbox vals first count))))
