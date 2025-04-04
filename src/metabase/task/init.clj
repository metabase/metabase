(ns metabase.task.init
  "Load Quartz job/trigger definitions that need to be loaded on system startup for side effects. Most of these
  namespaces should actually get moved to appropriate modules instead of having all the jobs and triggers live in
  `metabase.task` -- see
  https://www.notion.so/metabase/Backend-Modularization-2025-Plan-17669354c90180b98bd4eb9c8ccf2395.

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.task.cache]
   [metabase.task.creator-sentiment-emails]
   [metabase.task.follow-up-emails]
   [metabase.task.refresh-slack-channel-user-cache]
   [metabase.task.send-anonymous-stats]
   [metabase.task.task-history-cleanup]
   [metabase.task.truncate-audit-tables]
   [metabase.task.upgrade-checks]))

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !!                                                                                                !!
;;; !!                       DO NOT ADD ANY MORE TASKS UNDER `metabase.task.*`                        !!
;;; !!                                                                                                !!
;;; !!   Please read https://metaboat.slack.com/archives/CKZEMT1MJ/p1738972144181069 for more info    !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
