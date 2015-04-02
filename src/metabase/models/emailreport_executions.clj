(ns metabase.models.emailreport-executions
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer [assoc-permissions-sets perms-none]]
                             [emailreport-recipients :refer [EmailReportRecipients]]
                             [org :refer [Org org-can-read org-can-write]]
                             [user :refer [User]])))


(defentity EmailReportExecutions
  (table :report_emailreportexecutions)
  (types {:details :json}))


(defmethod post-select EmailReportExecutions [_ {:keys [organization_id] :as execution}]
  (assoc execution :organization (delay (sel :one Org :id organization_id))))
