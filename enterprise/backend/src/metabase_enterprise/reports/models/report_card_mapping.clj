(ns metabase-enterprise.reports.models.report-card-mapping
  "Model for report card mappings."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ReportCardMapping [_model]
  :report_card_mapping)

(doto :model/ReportCardMapping
  (derive :metabase/model))
