(ns metabase.pulse.task.email-remove-legacy-pulse
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.channel.email :as email]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.template.core :as channel.template]
   [metabase.channel.urls :as urls]
   [metabase.pulse.db :as pulse.db]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- has-legacy-pulse? []
  (pos? (pulse.db/legacy-pulse-count)))

(def ^:private template-name "warn_deprecate_pulse")

(defn- email-remove-legacy-pulse []
  (when (and (channel.settings/email-configured?)
             (has-legacy-pulse?))
    (log/info "Sending email to admins about removal of legacy pulses")
    (let [legacy-pulse (->> (pulse.db/legacy-pulses)
                            (map #(assoc % :url (urls/legacy-pulse-url (:id %)))))]
      (doseq [admin (pulse.db/superusers)]
        (email/send-email-retrying!
         {:recipients   [(:email admin)]
          :message-type :html
          :subject      "[Metabase] Removal of legacy pulses in upcoming Metabase release"
          :message      (channel.template/render template-name {:userName    (:common_name admin)
                                                                :pulses      legacy-pulse
                                                                :instanceURL (urls/site-url)})})))))

(task/defjob ^{:doc "Send email to admins and warn about removal of Pulse in 49, This job will only run once."}
  EmailRemoveLegacyPulse [_ctx]
  (email-remove-legacy-pulse))

(defmethod task/init! ::SendWarnPulseRemovalEmail [_job-name]
  (let [job     (jobs/build
                 (jobs/of-type EmailRemoveLegacyPulse)
                 (jobs/with-identity (jobs/key "metabase.task.email-remove-legacy-pulse.job"))
                 (jobs/store-durably))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key "metabase.task.email-remove-legacy-pulse.trigger"))
                 (triggers/start-now))]
    (task/schedule-task! job trigger)))
