(ns metabase.tasks.email-report
  "Tasks related to running `EmailReports`."
  (:require [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.email.messages :refer [send-email-report]]
            (metabase.models [emailreport :refer [EmailReport execution-details-fields]]
                             [emailreport-executions :refer [EmailReportExecutions]]
                             [emailreport-recipients :refer [EmailReportRecipients]]
                             [hydrate :refer :all])
            [metabase.util :as u]))


(declare execute report-fail report-complete)

(defn execute-and-send
  "Execute and Send an `EmailReport`.  This includes running the data query behind the report, formatting the email,
   and sending the email to any specified recipients."
  [report-id]
  {:pre [(integer? report-id)]}
  (let [email-report (-> (sel :one :fields execution-details-fields :id report-id)
                         ;; TODO - this feels heavy handed.  need to check `sel` macro about clob handling
                         (u/assoc* :description (u/jdbc-clob->str (:description <>))
                                   :email_addresses (u/jdbc-clob->str (:email_addresses <>))
                                   :recipients (sel :many :fields ['metabase.models.user/User :id :email]
                                                 (where {:id [in (subselect EmailReportRecipients
                                                                   (fields :user_id)
                                                                   (where {:emailreport_id report-id}))]}))))
        report-execution (ins EmailReportExecutions
                           :report_id report-id
                           :organization_id (:organization_id email-report)
                           :details email-report
                           :status "running"
                           :created_at (u/new-sql-timestamp)
                           :started_at (u/new-sql-timestamp)
                           :error ""
                           :sent_email "")]
    (log/debug (format "Starting EmailReport Execution: %d" (:id report-execution)))
    (execute report-execution)
    (log/debug (format "Finished EmailReport Execution: %d" (:id report-execution)))
    ;; return the id of the report-execution
    (:id report-execution)))


(defn- execute
  "Internal handling of EmailReport sending."
  [{execution-id :id {:keys [name creator_id dataset_query recipients email_addresses]} :details}]
  (let [email-subject (str (or name "Your Email Report") " - " (u/now-with-format "MMMM dd, YYYY"))
        email-recipients (->> (filter identity (map (fn [recip] (:email recip)) recipients))
                              (into (clojure.string/split email_addresses #","))
                              (filter u/is-email?)
                              (into []))
        email-data (driver/dataset-query dataset_query {:executed_by creator_id
                                                        :synchronously true})]
    (if (= :completed (:status email-data))
      (->> (send-email-report email-subject email-recipients email-data)
           (report-complete execution-id))
      (report-fail execution-id (format "dataset_query() failed for email report (%d): %s" execution-id (:error email-data))))))

(defn- report-fail
  "Record report failure"
  [execution-id msg]
  (upd EmailReportExecutions execution-id
    :status "failed"
    :error msg
    :finished_at (u/new-sql-timestamp)))

(defn- report-complete
  "Record report completion"
  [execution-id sent-email]
  (upd EmailReportExecutions execution-id
    :status "completed"
    :finished_at (u/new-sql-timestamp)
    :sent_email (or sent-email "")))
