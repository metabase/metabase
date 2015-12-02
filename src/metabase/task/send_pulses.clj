(ns metabase.task.send-pulses
  "Tasks related to running `Pulses`."
  (:require [clojure.tools.logging :as log]
            [cheshire.core :as cheshire]
            (clojurewerkz.quartzite [jobs :as jobs]
                                    [triggers :as triggers])
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clj-time.core :as time]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.email :as email]
            [metabase.email.messages :as messages]
            [metabase.integrations.slack :as slack]
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

;; triggers the sending of all pulses which are scheduled to run in the current hour
(jobs/defjob SendPulses
  [ctx]
  ;; determine what time it is right now (hour-of-day & day-of-week) in reporting timezone
  (let [reporting-timezone (setting/get :report-timezone)
        now                (if (empty? reporting-timezone)
                             (time/now)
                             (time/to-time-zone (time/now) (time/time-zone-for-id reporting-timezone)))
        curr-hour          (time/hour now)
        curr-weekday       (->> (time/day-of-week now)
                                (get pulse-channel/days-of-week)
                                :id)]
    (send-pulses curr-hour curr-weekday)))

(defn task-init []
  (log/info "Submitting send-pulses task to scheduler")
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


;; TODO: this is probably something that could live somewhere else and just be reused by us
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
  "Send a `Pulse` email given a list of card results to render and a list of recipients to send to."
  [{:keys [id name] :as pulse} results recipients]
  (log/debug (format "Sending Pulse (%d: %s) via Channel :email" id name))
  (let [email-subject    (str "Pulse: " name)
        email-recipients (filterv u/is-email? (map :email recipients))]
    (email/send-message
      :subject      email-subject
      :recipients   email-recipients
      :message-type :attachments
      :message      (messages/render-pulse-email pulse results))))

(defn- create-slack-attachment
  "Create an attachment in Slack for a given Card by rendering its result into an image and uploading it."
  [{{:keys [id name] :as card} :card, {:keys [data]} :result}]
  (let [image-byte-array (p/render-pulse-card-to-png card data false)
        upload-result    (slack/files-upload image-byte-array)]
    {:title      name
     :title_link (format "%s/card/%d?clone" (setting/get :-site-url) id)
     :image_url  (-> upload-result :file :url)
     :fallback   name}))

(defn send-pulse-slack
  "Post a `Pulse` to a slack channel given a list of card results to render and details about the slack destination."
  [{:keys [id name]} results details]
  (log/debug (format "Sending Pulse (%d: %s) via Channel :slack" id name))
  (let [attachments (mapv create-slack-attachment results)]
    (slack/chat-post-message (:channel details)
                             (str "Pulse: " name)
                             (cheshire/generate-string attachments))))

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
          (= :email (keyword channel_type)) (send-pulse-email pulse results recipients)
          (= :slack (keyword channel_type)) (send-pulse-slack pulse results details))))))

(defn send-pulses
  "Send any `Pulses` which are scheduled to run in the current day/hour.  We use the current time and determine the
   hour of the day and day of the week according to the defined reporting timezone, or UTC.  We then find all `Pulses`
   that are scheduled to run and send them."
  [hour day]
  [:pre [(integer? hour)
         (and (< 0 hour) (> 23 hour))
         (pulse-channel/day-of-week? day)]]
  (let [channels-by-pulse (group-by :pulse_id (pulse-channel/retrieve-scheduled-channels hour day))]
    (doseq [pulse-id (keys channels-by-pulse)]
      (try
        (log/debug (format "Starting Pulse Execution: %d" pulse-id))
        (when-let [pulse (pulse/retrieve-pulse pulse-id)]
          (send-pulse pulse :channel-ids (mapv :id (get channels-by-pulse pulse-id))))
        (log/debug (format "Finished Pulse Execution: %d" pulse-id))
        (catch Exception e
          (log/error "Error sending pulse:" pulse-id e))))))
