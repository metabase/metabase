(ns metabase.test.initialize.scheduler
  (:require [metabase.task :as task]))

(defn init! []
  ;; we don't want to actually start the task scheduler (we don't want sync or other stuff happening in the BG
  ;; while running tests), but we still need to make sure it sets itself up properly so tasks can get scheduled
  ;; without throwing Exceptions
  (#'task/set-jdbc-backend-properties!))
