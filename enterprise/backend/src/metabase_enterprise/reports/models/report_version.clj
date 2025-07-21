(ns metabase-enterprise.reports.models.report-version
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ReportVersion [_model] :report_document_version)

(doto :model/ReportVersion
  (derive :metabase/model)
  (derive :hook/timestamped?))
