(ns metabase-enterprise.reports.models.report-run
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ReportRun [_model] :report_run)

(t2/deftransforms :model/ReportRun
  {:status mi/transform-keyword})

(doto :model/ReportRun
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(def RunStatus
  "Enum of possible statuses for the Report Run."
  [:enum :initialized :in-progress :finished :errored])

(methodical/defmethod t2/batched-hydrate [:model/ReportRun :user]
  "Hydrate the user information for report runs based on the user_id field."
  [_model k runs]
  (if (seq runs)
    (let [user-ids (set (keep :user_id runs))
          user-id->user (when (seq user-ids)
                          (t2/select-pk->fn identity
                                            [:model/User :id :first_name :last_name :email]
                                            :id [:in user-ids]))]
      (for [run runs]
        (assoc run k (when-let [user-id (:user_id run)]
                       (user-id->user user-id)))))
    runs))
