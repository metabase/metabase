(ns metabase.task.send-pulses
  "Tasks related to running `Pulses`."
  (:require [clojure.tools.logging :as log]
            [cheshire.core :as json]
            (clojurewerkz.quartzite [jobs :as jobs]
                                    [triggers :as triggers])
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clj-time.core :as time]
            [clj-time.predicates :as timepr]
            [metabase.api.common :refer [let-404]]
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
            [metabase.util.urls :as urls]
            [metabase.pulse :as p]))


(declare send-pulses!)

(def ^:private ^:const send-pulses-job-key     "metabase.task.send-pulses.job")
(def ^:private ^:const send-pulses-trigger-key "metabase.task.send-pulses.trigger")

(defonce ^:private send-pulses-job (atom nil))
(defonce ^:private send-pulses-trigger (atom nil))

(defn- monthday [dt]
  (cond
    (timepr/first-day-of-month? dt) :first
    (timepr/last-day-of-month? dt)  :last
    (= 15 (time/day dt))            :mid
    :else                           :other))

(defn- monthweek [dt]
  (let [curr-day-of-month  (time/day dt)
        last-of-month      (time/day (time/last-day-of-the-month dt))
        start-of-last-week (- last-of-month 7)]
    (cond
      (> 8 curr-day-of-month)                  :first
      (< start-of-last-week curr-day-of-month) :last
      :else                                    :other)))

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
                                :id)
        curr-monthday      (monthday now)
        curr-monthweek     (monthweek now)]
    (send-pulses! curr-hour curr-weekday curr-monthday curr-monthweek)))

(defn task-init
  "Automatically called during startup; start the job for sending pulses."
  []
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
(defn- execute-card
  "Execute the query for a single card."
  [card-id]
  {:pre [(integer? card-id)]}
  (let-404 [card (Card card-id)]
    (let [{:keys [creator_id dataset_query]} card]
      (try
        {:card card :result (driver/dataset-query dataset_query {:executed_by creator_id})}
        (catch Throwable t
          (log/warn (format "Error running card query (%n)" card-id) t))))))

(defn- send-email-pulse!
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

(defn- create-and-upload-slack-attachment!
  "Create an attachment in Slack for a given Card by rendering its result into an image and uploading it."
  [channel-id {{card-id :id, card-name :name, :as card} :card, {:keys [data]} :result}]
  (let [image-byte-array (p/render-pulse-card-to-png card data)
        slack-file-url   (slack/upload-file! image-byte-array "image.png" channel-id)]
    {:title      card-name
     :title_link (urls/card-url card-id)
     :image_url  slack-file-url
     :fallback   card-name}))

(defn send-slack-pulse!
  "Post a `Pulse` to a slack channel given a list of card results to render and details about the slack destination."
  [pulse results channel-id]
  {:pre [(string? channel-id)]}
  (log/debug (u/format-color 'cyan "Sending Pulse (%d: %s) via Slack" (:id pulse) (:name pulse)))
  (when-let [metabase-files-channel (slack/get-or-create-files-channel!)]
    (let [attachments (doall (for [result results]
                               (create-and-upload-slack-attachment! (:id metabase-files-channel) result)))]
      (slack/post-chat-message! channel-id
                                (str "Pulse: " (:name pulse))
                                attachments))))

(defn send-pulse!
  "Execute and Send a `Pulse`, optionally specifying the specific `PulseChannels`.  This includes running each
   `PulseCard`, formatting the results, and sending the results to any specified destination.

   Example:
       (send-pulse! pulse)                       Send to all Channels
       (send-pulse! pulse :channel-ids [312])    Send only to Channel with :id = 312"
  [{:keys [cards] :as pulse} & {:keys [channel-ids]}]
  {:pre [(map? pulse) (every? map? cards) (every? :id cards)]}
  (let [results     (for [card cards]
                      (execute-card (:id card)))
        channel-ids (or channel-ids (mapv :id (:channels pulse)))]
    (doseq [channel-id channel-ids]
      (let [{:keys [channel_type details recipients]} (some #(when (= channel-id (:id %)) %)
                                                            (:channels pulse))]
        (condp = (keyword channel_type)
          :email (send-email-pulse! pulse results recipients)
          :slack (send-slack-pulse! pulse results (:channel details)))))))

(defn- send-pulses!
  "Send any `Pulses` which are scheduled to run in the current day/hour.  We use the current time and determine the
   hour of the day and day of the week according to the defined reporting timezone, or UTC.  We then find all `Pulses`
   that are scheduled to run and send them."
  [hour weekday monthday monthweek]
  [:pre [(integer? hour)
         (and (< 0 hour) (> 23 hour))
         (pulse-channel/day-of-week? weekday)
         (contains? #{:first :last :mid :other} monthday)
         (contains? #{:first :last :other} monthweek)]]
  (let [channels-by-pulse (group-by :pulse_id (pulse-channel/retrieve-scheduled-channels hour weekday monthday monthweek))]
    (doseq [pulse-id (keys channels-by-pulse)]
      (try
        (log/debug (format "Starting Pulse Execution: %d" pulse-id))
        (when-let [pulse (pulse/retrieve-pulse pulse-id)]
          (send-pulse! pulse :channel-ids (mapv :id (get channels-by-pulse pulse-id))))
        (log/debug (format "Finished Pulse Execution: %d" pulse-id))
        (catch Throwable e
          (log/error "Error sending pulse:" pulse-id e))))))
