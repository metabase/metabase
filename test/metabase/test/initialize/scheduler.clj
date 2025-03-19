(ns metabase.test.initialize.scheduler
  (:require
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn init! []
  (log/info (u/format-color 'blue "Initializing quartz scheduler."))
  (task/init-scheduler!))
