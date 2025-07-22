(ns metabase-enterprise.reports.models.report-run
  (:require
   [metabase.model.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ReportRun [_model] :report_run)

(t2/deftransforms :model/Card
  {:status mi/transform-keyword})

(doto :model/ReportRun
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(def RunStatus
  "Enum of possible statuses for the Report Run."
  [:enum :initialized :in-progress :finished :errored])
