(ns metabase.task.send-pulses
  "Tasks related to running `Pulses`."
  (:require [clojure.tools.logging :as log]
            [clj-time.core :as time]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            ;[metabase.email.messages :refer [send-email-report]]
            ;(metabase.models [pulse :refer [EmailReport
            ;                                      days-of-week
            ;                                      execution-details-fields
            ;                                      mode->id
            ;                                      time-of-day->realhour]]
            ;                 [emailreport-executions :refer [EmailReportExecutions]]
            ;                 [pulse-channel-recipient :refer [EmailReportRecipients]]
            ;                 [hydrate :refer :all])
            [metabase.task :as task]
            [metabase.util :as u]))


;(declare execute-scheduled-reports
;         execute-if-scheduled
;         execute-and-send
;         execute
;         report-fail
;         report-complete)
;
;(defn execute-reports-hourly-job
;  "Simple wrapper for `execute-scheduled-reports` function which we can place on a `task/hourly-tasks-hook`"
;  [_]
;  (log/debug "Executing EmailReports hourly job")
;  (execute-scheduled-reports))
;
;;; this adds our email report executions to our hourly task runner
;(task/add-hook! #'task/hourly-tasks-hook execute-reports-hourly-job)
;
;(defn execute-scheduled-reports
;  "Execute and Send all `EmailReports` in the system.
;   This function checks the schedule on all :active email reports and runs them if appropriate."
;  []
;  (log/debug "Executing ALL scheduled EmailReports")
;  (->> (sel :many :fields [EmailReport :id :schedule] :mode (mode->id :active))
;       (map execute-if-scheduled)
;       dorun))
;
;(defn- execute-if-scheduled
;  "Test if a given report is scheduled to run at the current time and if so execute it."
;  [{{:keys [days_of_week time_of_day timezone]} :schedule id :id}]
;  (log/debug "Processing: " id days_of_week time_of_day timezone)
;  (let [now (time/to-time-zone (time/now) (time/time-zone-for-id (or timezone "UTC"))) ; NOTE this is in LOCAL timezone
;        curr-hour (time/hour now)
;        curr-weekday (:id (get days-of-week (time/day-of-week now)))]
;    ;; report schedule should look like:
;    ;;   `{:days_of_week {:mon true :tue true :wed false ...} :time_of_day "morning" :timezone "US/Pacific"}`
;    (when (and (get days_of_week (keyword curr-weekday))   ; scheduled weekdays include curr-weekday
;               (= curr-hour (time-of-day->realhour time_of_day)))  ; scheduled hour matches curr-hour
;      (try
;        (execute-and-send id)
;        (catch Throwable t
;          (log/error (format "Error executing email report: %d" id) t))))))
;
;(defn execute-and-send
;  "Execute and Send an `EmailReport`.  This includes running the data query behind the report, formatting the email,
;   and sending the email to any specified recipients."
;  [report-id]
;  {:pre [(integer? report-id)]}
;  (let [email-report (-> (sel :one :fields execution-details-fields :id report-id)
;                         ;; TODO - this feels heavy handed.  need to check `sel` macro about clob handling
;                         (u/assoc* :description (u/jdbc-clob->str (:description <>))
;                                   :email_addresses (u/jdbc-clob->str (:email_addresses <>))
;                                   :recipients (sel :many :fields ['metabase.models.user/User :id :email]
;                                                 (where {:id [in (subselect EmailReportRecipients
;                                                                   (fields :user_id)
;                                                                   (where {:emailreport_id report-id}))]}))))
;        report-execution (ins EmailReportExecutions
;                           :report_id report-id
;                           :organization_id (:organization_id email-report)
;                           :details email-report
;                           :status "running"
;                           :created_at (u/new-sql-timestamp)
;                           :started_at (u/new-sql-timestamp)
;                           :error ""
;                           :sent_email "")]
;    (log/debug (format "Starting EmailReport Execution: %d" (:id report-execution)))
;    (execute report-execution)
;    (log/debug (format "Finished EmailReport Execution: %d" (:id report-execution)))
;    ;; return the id of the report-execution
;    (:id report-execution)))
;
;
;(defn- execute
;  "Internal handling of EmailReport sending."
;  [{execution-id :id {:keys [name creator_id dataset_query recipients email_addresses]} :details}]
;  (let [email-subject (str (or name "Your Email Report") " - " (u/now-with-format "MMMM dd, YYYY"))
;        email-recipients (->> (filter identity (map (fn [recip] (:email recip)) recipients))
;                              (into (clojure.string/split email_addresses #","))
;                              (filter u/is-email?)
;                              (into []))
;        email-data (driver/dataset-query dataset_query {:executed_by creator_id
;                                                        :synchronously true})]
;    (if (= :completed (:status email-data))
;      (->> (send-email-report email-subject email-recipients email-data)
;           (report-complete execution-id))
;      (report-fail execution-id (format "dataset_query() failed for email report (%d): %s" execution-id (:error email-data))))))
;
;(defn- report-fail
;  "Record report failure"
;  [execution-id msg]
;  (upd EmailReportExecutions execution-id
;    :status "failed"
;    :error msg
;    :finished_at (u/new-sql-timestamp)))
;
;(defn- report-complete
;  "Record report completion"
;  [execution-id sent-email]
;  (upd EmailReportExecutions execution-id
;    :status "completed"
;    :finished_at (u/new-sql-timestamp)
;    :sent_email (or sent-email "")))
