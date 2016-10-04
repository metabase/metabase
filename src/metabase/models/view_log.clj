(ns metabase.models.view-log
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]))


(i/defentity ViewLog :view_log)

(defn- pre-insert [log-entry]
  (let [defaults {:timestamp (u/new-sql-timestamp)}]
    (merge defaults log-entry)))

(u/strict-extend (class ViewLog)
  i/IEntity (merge i/IEntityDefaults
                   {:can-read?  (constantly true)
                    :can-write? (constantly true)
                    :pre-insert pre-insert}))
