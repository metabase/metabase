(ns metabase.events.view-log
  (:require
   [java-time :as t]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.view-log :refer [ViewLog]]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

(derive :event/card-read ::event)
(derive :event/card-query ::event)
(derive :event/dashboard-read ::event)
(derive :event/table-read ::event)

(defsetting user-recent-views
  (deferred-tru "List of the 10 most recently viewed items for the user.")
  :user-local :only
  :type :json)

(defsetting dismissed-custom-dashboard-toast
  (deferred-tru "Toggle which is true after a user has dismissed the custom dashboard toast.")
  :user-local :only
  :visibility :authenticated
  :type :boolean
  :default false)

;; TODO: remove this setting as part of Audit V2 project.
(defsetting most-recently-viewed-dashboard
  (deferred-tru "The Dashboard that the user has most recently viewed within the last 24 hours.")
  :user-local :only
  :type :json
  :getter (fn []
            {:post [((some-fn nil? pos-int?) %)]}
            (let [{:keys [id timestamp] :as value} (setting/get-value-of-type :json :most-recently-viewed-dashboard)
                  yesterday                        (t/minus (t/zoned-date-time) (t/hours 24))]
              ;; If the latest view is older than 24 hours, return 'nil'
              (when (and value (t/after? (t/zoned-date-time timestamp) yesterday))
                id)))
  :setter (fn [id]
            {:pre [((some-fn nil? pos-int?) id)]}
            (setting/set-value-of-type!
             :json
             :most-recently-viewed-dashboard
             ;; given a dashboard's ID, save it with a timestamp of 'now', for comparing later in the getter
             (when id
               {:id id, :timestamp (t/zoned-date-time)}))))

(defn record-view!
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [model model-id user-id metadata]
  ;; TODO - we probably want a little code that prunes old entries so that this doesn't get too big
  (t2/insert! ViewLog
              :user_id  user-id
              :model    (u/lower-case-en model)
              :model_id model-id
              :metadata metadata))
