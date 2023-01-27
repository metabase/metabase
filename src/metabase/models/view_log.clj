(ns metabase.models.view-log
  "The ViewLog is used to log an event where a given User views a given object such as a Table or Card (Question)."
  (:require
   [metabase.models.activity-log :as activity-log]
   [metabase.models.interface :as mi]
   [toucan.models :as models]))

(models/defmodel ViewLog :view_log)

(doto ViewLog
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.always-allow))

(defn- pre-insert [log-entry]
  (let [defaults {:timestamp :%now}]
    (merge defaults log-entry)))

(mi/define-methods
 ViewLog
 {:pre-insert pre-insert
  :post-insert activity-log/write-to-activity-log
  :types      (constantly {:metadata :json})})
