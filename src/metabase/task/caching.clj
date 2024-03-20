(ns metabase.task.caching
  (:require [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.task :as task]))

(defenterprise init-caching-task!
  "On OSS, does nothing"
  metabase-enterprise.task.caching
  [])

(defmethod task/init! ::Caching [_]
  (init-caching-task!))
