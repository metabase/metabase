(ns metabase.models.emailreport-executions
  (:require [cheshire.core :as json]
            [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer [assoc-permissions-sets perms-none]]
              [hydrate :refer [realize-json]]
              [emailreport-recipients :refer [EmailReportRecipients]]
              [org :refer [Org org-can-read org-can-write]]
              [user :refer [User]])
            [metabase.util :as util]))


(defentity EmailReportExecutions
  (table :report_emailreportexecutions))


(defmethod post-select EmailReportExecutions [_ {:keys [organization_id] :as execution}]
  (-> execution
    (realize-json :details)
    (util/assoc*
      :organization (delay
                      (sel :one Org :id organization_id)))))

(defmethod pre-insert EmailReportExecutions [_ {:keys [details] :as execution}]
  (assoc execution :details (if (string? details) details
                                                  (json/encode details))))
