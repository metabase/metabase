(ns metabase.task.email-deprecated-pulse
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.email :as email]
   [metabase.pulse]
   [metabase.task :as task]
   [metabase.util.log :as log]
   [metabase.util.urls :as urls]
   [stencil.core :as stencil]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- has-legacy-pulse? []
  (pos? (t2/count :model/Pulse :dashboard_id nil :alert_condition nil)))

(def ^:private template-path (str "metabase/email/warn_deprecate_pulse.mustache"))

(jobs/defjob ^{:doc "Send email to admins and warn about removal of Pulse in 49, This job will only run once."}
  SendEmailWarnDeprecatePulse [_ctx]
  (when (has-legacy-pulse?)
    (log/info "Sending email to admins about deprecation of legacy pulses")
    (let [legacy-pulse (->> (t2/select :model/Pulse :dashboard_id nil :alert_condition nil)
                            (map #(assoc % :url (urls/legacy-pulse-url (:id %)))))]
      (doseq [admin (t2/select :model/User :is_superuser true)]
        (email/send-message-or-throw!
         {:recipients   [(:email admin)]
          :message-type :html
          :subject      "Removal of Legacy Pulses in Upcoming Metabase Release"
          :message      (stencil/render-file template-path {:userName    (:common_name admin)
                                                            :pulses      legacy-pulse
                                                            :instanceURL (urls/site-url)})})))))

(defmethod task/init! ::SendWarnPulseRemovalEmail [_job-name]
  (let [job     (jobs/build
                 (jobs/of-type SendEmailWarnDeprecatePulse)
                 (jobs/with-identity (jobs/key "metabase.task.email-deprecated-pulse.job"))
                 (jobs/store-durably))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key "metabase.task.email-deprecated-pulse.trigger"))
                 (triggers/start-now))]
    (task/schedule-task! job trigger)))
