(ns metabase.task.cache
  (:require [metabase.premium-features.core :refer [defenterprise]]
            [metabase.task :as task]))

(defenterprise init-cache-task!
  "In OSS does nothing"
  metabase-enterprise.task.cache
  [])

(defmethod task/init! ::Cache [_]
  (init-cache-task!))
