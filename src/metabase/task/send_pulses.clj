(ns metabase.task.send-pulses
  "Tasks related to running `Pulses`."
  (:require [clojure.tools.logging :as log]
            [cheshire.core :as cheshire]
            (clojurewerkz.quartzite [jobs :as jobs]
                                    [triggers :as triggers])
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clj-http.client :as client]
            [clj-time.core :as time]
            [hiccup.core :refer [html]]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.email :as email]
            (metabase.models [card :refer [Card]]
                             [hydrate :refer :all]
                             [pulse :refer [Pulse] :as pulse]
                             [pulse-channel :as pulse-channel]
                             [setting :as setting])
            [metabase.task :as task]
            [metabase.util :as u]
            [metabase.pulse :as p]))


(declare send-pulses)

(def send-pulses-job-key "metabase.task.send-pulses.job")
(def send-pulses-trigger-key "metabase.task.send-pulses.trigger")

(defonce ^:private send-pulses-job (atom nil))
(defonce ^:private send-pulses-trigger (atom nil))

;; simple job which looks up all databases and runs a sync on them
(jobs/defjob SendPulses
             [ctx]
             (send-pulses))

(defn task-init []
  (log/info "Submitting sync-database task to scheduler")
  ;; build our job
  (reset! send-pulses-job (jobs/build
                               (jobs/of-type SendPulses)
                               (jobs/with-identity (jobs/key send-pulses-job-key))))
  ;; build our trigger
  (reset! send-pulses-trigger (triggers/build
                                   (triggers/with-identity (triggers/key send-pulses-trigger-key))
                                   (triggers/start-now)
                                   (triggers/with-schedule
                                     ;; run at the top of every hour
                                     (cron/schedule (cron/cron-schedule "0 0 * * * ? *")))))
  ;; submit ourselves to the scheduler
  (task/schedule-task! @send-pulses-job @send-pulses-trigger))


;;; ## ---------------------------------------- PULSE SENDING ----------------------------------------


(defn- ^:private execute-card
  "Execute the query for a single card."
  [card-id]
  {:pre [(integer? card-id)]}
  (let [card (db/sel :one Card :id card-id)
        {:keys [creator_id dataset_query]} card]
    (try
      {:card card :result (driver/dataset-query dataset_query {:executed_by creator_id})}
      (catch Throwable t
        (log/warn (format "Error running card query (%n)" card-id) t)))))

(defn send-pulse-email
  ""
  [{:keys [id name] :as pulse} results recipients]
  (log/debug (format "Sending Pulse (%d) via Channel :email" id))
  (let [email-subject (str "Pulse Email: " name)
        email-recipients (filterv u/is-email? (map :email recipients))]
    (email/send-message
      :subject      email-subject
      :recipients   email-recipients
      :message-type :html
      :message      (html [:html [:body (p/render-pulse pulse results)]]))))

(defn- create-slack-attachment
  ""
  [{:keys [card result]}]
  (log/debug (str "Sending Pulse Card " card result))
  (let [ba (p/render-pulse-card-to-png card (:data result) false)
        upload-result (client/post "https://slack.com/api/files.upload"
                                   {:multipart [["token" (setting/get :slack-token)]
                                                ["file" ba]]
                                    :as :json})]
    {:title (:name card)
     :title_link (str (setting/get :-site-url) "/card/" (:id card) "?clone")
     :image_url (-> upload-result :body :file :url)
     :fallback (:name card)}))

(defn send-pulse-slack
  ""
  [{:keys [id name] :as pulse} results details]
  (log/debug (format "Sending Pulse (%d) via Channel :slack" id))
  (client/post "https://slack.com/api/chat.postMessage"
               {:form-params {:token (setting/get :slack-token)
                              :channel "@tom";(:channel details)
                              :username "MetaBot"
                              :text (str "Pulse: " name)
                              :attachments (cheshire/generate-string (mapv create-slack-attachment results))}}))

(defn send-pulse
  "Execute and Send a `Pulse`, optionally specifying the specific `PulseChannels`.  This includes running each
   `PulseCard`, formatting the results, and sending the results to any specified destination.

   Example:
       (send-pulse pulse)                       Send to all Channels
       (send-pulse pulse :channel-ids [312])    Send only to Channel with :id = 312"
  [{:keys [cards] :as pulse} & {:keys [channel-ids]}]
  {:pre [(map? pulse)]}
  (let [results  (map execute-card (mapv :id cards))
        channels (or channel-ids (mapv :id (:channels pulse)))]
    (doseq [channel-id channels]
      (let [{:keys [channel_type details recipients]} (first (filter #(= channel-id (:id %)) (:channels pulse)))]
        (cond
          (= :email channel_type) (send-pulse-email pulse results recipients)
          (= :slack channel_type) (send-pulse-slack pulse results details))))))

(defn send-pulses
  "Send any `Pulses` which are scheduled to run in the current day/hour."
  []
  ;; determine what time it is right now (hour-of-day & day-of-week) in local timezone
  (let [now               (time/to-time-zone (time/now) (time/time-zone-for-id (or (setting/get :report_timezone) "UTC")))
        curr-hour         (time/hour now)
        curr-weekday      (:id (get pulse-channel/days-of-week (time/day-of-week now)))
        channels-by-pulse (group-by :pulse_id (pulse-channel/retrieve-scheduled-channels curr-hour curr-weekday))]
    (doseq [pulse-id (keys channels-by-pulse)]
      (try
        (log/debug (format "Starting Pulse Execution: %d" pulse-id))
        (when-let [pulse (pulse/retrieve-pulse pulse-id)]
          (send-pulse pulse (mapv :id (get channels-by-pulse pulse-id))))
        (log/debug (format "Finished Pulse Execution: %d" pulse-id))
        (catch Exception e
          (log/error "Error sending pulse: " pulse-id e))))))
