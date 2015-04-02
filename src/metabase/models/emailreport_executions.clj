(ns metabase.models.emailreport-executions
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [emailreport-recipients :refer [EmailReportRecipients]]
                             [org :refer [Org]])))


(defentity EmailReportExecutions
  (table :report_emailreportexecutions)
  (types {:details :json}))


(defmethod post-select EmailReportExecutions [_ {:keys [organization_id] :as execution}]
  (assoc execution :organization (delay (sel :one Org :id organization_id))))
