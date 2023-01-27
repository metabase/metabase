(ns metabase.models.view-log
  "The ViewLog is used to log an event where a given User views a given object such as a Table or Card (Question)."
  (:require
   [metabase.models.activity-log :as activity-log :refer [ActivityLog]]
   [metabase.models.interface :as mi]
   [toucan.db :as db]
   [toucan.models :as models]))

(models/defmodel ViewLog :view_log)

(doto ViewLog
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.always-allow))

(defn- pre-insert [log-entry]
  (let [defaults {:timestamp :%now}]
    (merge defaults log-entry)))

(defn- write-to-activity-log
  "Temporary fn for writing view_log entries to activity_log. Will be removed when activity-log impl. is complete."
  [{:keys [metadata model] :as activity}]
  (let [log-entry (merge
                   (dissoc activity :id :custom_id :metadata)
                   {:details metadata
                    :topic (str (name model) "-view")})]
    (db/insert! ActivityLog log-entry)
    activity))

(mi/define-methods
 ViewLog
 {:pre-insert  pre-insert
  :post-insert write-to-activity-log
  :types       (constantly {:metadata :json})})
