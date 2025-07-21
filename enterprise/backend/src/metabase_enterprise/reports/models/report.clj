(ns metabase-enterprise.reports.models.report
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Report [_model] :report_document)

(doto :model/Report
  (derive :metabase/model)
  (derive :hook/timestamped?))
