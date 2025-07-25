(ns metabase-enterprise.reports.models.report-run-card-data
  "Model for the report_run_card_data table, which stores the data for each card in a report run."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ReportRunCardData [_model] :report_run_card_data)

(doto :model/ReportRunCardData
  (derive :metabase/model))
