(ns metabase.premium-features.task.send-metering
  "Scheduled task that sends metering events for billing purposes."
  (:require
   [clj-http.client :as http]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.config.core :as config]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.premium-features.token-check :as token-check]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- metering-url
  [token base-url]
  (format "%s/api/%s/v2/metering" base-url token))

(defn send-metering-events!
  "Send metering events for billing purposes"
  []
  (when-let [token (premium-features.settings/premium-embedding-token)]
    (when (mr/validate [:re token-check/RemoteCheckedToken] token)
      (let [site-uuid (premium-features.settings/site-uuid-for-premium-features-token-checks)
            stats (token-check/metering-stats)]
        (try
          (http/post (metering-url token token-check/token-check-url)
                     {:body (json/encode (merge stats
                                                {:site-uuid site-uuid
                                                 :mb-version (:tag config/mb-version-info)}))
                      :content-type :json
                      :throw-exceptions false})
          (catch Throwable e
            (log/error e "Error sending metering events")))))))

(task/defjob ^{:doc "Send metering events for billing purposes"}
  SendMeteringEvents
  [_]
  (log/debug "Running metering events task")
  (send-metering-events!))

(def ^:private job-key "metabase.task.send-metering.job")
(def ^:private trigger-key "metabase.task.send-metering.trigger")

(defmethod task/init! ::SendMeteringEvents
  [_]
  (let [job     (jobs/build
                 (jobs/of-type SendMeteringEvents)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  (simple/schedule
                   (simple/with-interval-in-milliseconds (u/hours->ms 12))
                   (simple/repeat-forever))))]
    (task/schedule-task! job trigger)))
