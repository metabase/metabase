(ns metabase.pulse
  "Public API for sending Pulses."
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [email :as email]
             [query-processor :as qp]
             [util :as u]]
            [metabase.email.messages :as messages]
            [metabase.integrations.slack :as slack]
            [metabase.models
             [card :refer [Card]]
             [pulse :refer [Pulse]]]
            [metabase.pulse.render :as render]
            [metabase.util
             [i18n :refer [trs tru]]
             [ui-logic :as ui]
             [urls :as urls]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.util.TimeZone
           metabase.models.card.CardInstance))

;;; ------------------------------------------------- PULSE SENDING --------------------------------------------------


;; TODO: this is probably something that could live somewhere else and just be reused
(defn execute-card
  "Execute the query for a single card with CARD-ID. OPTIONS are passed along to `dataset-query`."
  [card-id & {:as options}]
  {:pre [(integer? card-id)]}
  (when-let [card (Card :id card-id, :archived false)]
    (let [{:keys [creator_id dataset_query]} card]
      (try
        {:card   card
         :result (qp/process-query-and-save-with-max! dataset_query (merge {:executed-by creator_id,
                                                                            :context     :pulse,
                                                                            :card-id     card-id}
                                                                           options))}
        (catch Throwable t
          (log/warn (format "Error running card query (%n)" card-id) t))))))

(defn- database-id [card]
  (or (:database_id card)
      (get-in card [:dataset_query :database])))

(s/defn defaulted-timezone :- TimeZone
  "Returns the timezone for the given `CARD`. Either the report
  timezone (if applicable) or the JVM timezone."
  [card :- CardInstance]
  (let [^String timezone-str (or (some-> card database-id driver/database-id->driver driver/report-timezone-if-supported)
                                 (System/getProperty "user.timezone"))]
    (TimeZone/getTimeZone timezone-str)))

(defn- first-question-name [pulse]
  (-> pulse :cards first :name))

(def ^:private alert-notification-condition-text
  {:meets "reached its goal"
   :below "gone below its goal"
   :rows  "results"})

(defn create-slack-attachment-data
  "Returns a seq of slack attachment data structures, used in `create-and-upload-slack-attachments!`"
  [card-results]
  (let [{channel-id :id} (slack/files-channel)]
    (for [{{card-id :id, card-name :name, :as card} :card, result :result} card-results]
      {:title      card-name
       :attachment-bytes-thunk (fn [] (render/render-pulse-card-to-png (defaulted-timezone card) card result))
       :title_link (urls/card-url card-id)
       :attachment-name "image.png"
       :channel-id channel-id
       :fallback   card-name})))

(defn create-and-upload-slack-attachments!
  "Create an attachment in Slack for a given Card by rendering its result into an image and uploading it."
  [attachments]
  (doall
   (for [{:keys [attachment-bytes-thunk attachment-name channel-id] :as attachment-data} attachments]
     (let [slack-file-url (slack/upload-file! (attachment-bytes-thunk) attachment-name channel-id)]
       (-> attachment-data
           (select-keys [:title :title_link :fallback])
           (assoc :image_url slack-file-url))))))

(defn- is-card-empty?
  "Check if the card is empty"
  [card]
  (let [result (:result card)]
    (or (zero? (-> result :row_count))
        ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
        (= [[nil]]
           (-> result :data :rows)))))

(defn- are-all-cards-empty?
  "Do none of the cards have any results?"
  [results]
  (every? is-card-empty? results))

(defn- goal-met? [{:keys [alert_above_goal] :as pulse} results]
  (let [first-result         (first results)
        goal-comparison      (if alert_above_goal <= >=)
        goal-val             (ui/find-goal-value first-result)
        comparison-col-rowfn (ui/make-goal-comparison-rowfn (:card first-result)
                                                            (get-in first-result [:result :data]))]

    (when-not (and goal-val comparison-col-rowfn)
      (throw (Exception. (str (tru "Unable to compare results to goal for alert.")
                              (tru "Question ID is ''{0}'' with visualization settings ''{1}''"
                                   (get-in results [:card :id])
                                   (pr-str (get-in results [:card :visualization_settings])))))))
    (some (fn [row]
            (goal-comparison goal-val (comparison-col-rowfn row)))
          (get-in first-result [:result :data :rows]))))

(defn- alert-or-pulse [pulse]
  (if (:alert_condition pulse)
    :alert
    :pulse))

(defmulti ^:private should-send-notification?
  "Returns true if given the pulse type and resultset a new notification (pulse or alert) should be sent"
  (fn [pulse _results] (alert-or-pulse pulse)))

(defmethod should-send-notification? :alert
  [{:keys [alert_condition] :as alert} results]
  (cond
    (= "rows" alert_condition)
    (not (are-all-cards-empty? results))

    (= "goal" alert_condition)
    (goal-met? alert results)

    :else
    (let [^String error-text (str (tru "Unrecognized alert with condition ''{0}''" alert_condition))]
      (throw (IllegalArgumentException. error-text)))))

(defmethod should-send-notification? :pulse
  [{:keys [alert_condition] :as pulse} results]
  (if (:skip_if_empty pulse)
    (not (are-all-cards-empty? results))
    true))

(defmulti ^:private create-notification
  "Polymorphoic function for creating notifications. This logic is different for pulse type (i.e. alert vs. pulse) and
  channel_type (i.e. email vs. slack)"
  (fn [pulse _ {:keys [channel_type] :as channel}]
    [(alert-or-pulse pulse) (keyword channel_type)]))

(defmethod create-notification [:pulse :email]
  [{:keys [id name] :as pulse} results {:keys [recipients] :as channel}]
  (log/debug (format "Sending Pulse (%d: %s) via Channel :email" id name))
  (let [email-subject    (str "Pulse: " name)
        email-recipients (filterv u/email? (map :email recipients))
        timezone         (-> results first :card defaulted-timezone)]
    {:subject      email-subject
     :recipients   email-recipients
     :message-type :attachments
     :message      (messages/render-pulse-email timezone pulse results)}))

(defmethod create-notification [:pulse :slack]
  [pulse results {{channel-id :channel} :details :as channel}]
  (log/debug (u/format-color 'cyan "Sending Pulse (%d: %s) via Slack" (:id pulse) (:name pulse)))
  {:channel-id channel-id
   :message (str "Pulse: " (:name pulse))
   :attachments (create-slack-attachment-data results)})

(defmethod create-notification [:alert :email]
  [{:keys [id] :as pulse} results {:keys [recipients] :as channel}]
  (log/debug (format "Sending Pulse (%d: %s) via Channel :email" id name))
  (let [condition-kwd    (messages/pulse->alert-condition-kwd pulse)
        email-subject    (format "Metabase alert: %s has %s"
                                 (first-question-name pulse)
                                 (get alert-notification-condition-text condition-kwd))
        email-recipients (filterv u/email? (map :email recipients))
        first-result     (first results)
        timezone         (-> first-result :card defaulted-timezone)]
    {:subject      email-subject
     :recipients   email-recipients
     :message-type :attachments
     :message      (messages/render-alert-email timezone pulse results (ui/find-goal-value first-result))}))

(defmethod create-notification [:alert :slack]
  [pulse results {{channel-id :channel} :details :as channel}]
  (log/debug (u/format-color 'cyan "Sending Alert (%d: %s) via Slack" (:id pulse) (:name pulse)))
  {:channel-id channel-id
   :message (str "Alert: " (first-question-name pulse))
   :attachments (create-slack-attachment-data results)})

(defmethod create-notification :default
  [_ _ {:keys [channel_type] :as channel}]
  (let [^String ex-msg (str (tru "Unrecognized channel type {0}" (pr-str channel_type)))]
    (throw (UnsupportedOperationException. ex-msg))))

(defmulti ^:private send-notification!
  "Invokes the side-affecty function for sending emails/slacks depending on the notification type"
  (fn [{:keys [channel-id] :as notification}]
    (if channel-id :slack :email)))

(defmethod send-notification! :slack
  [{:keys [channel-id message attachments]}]
  (let [attachments (create-and-upload-slack-attachments! attachments)]
    (slack/post-chat-message! channel-id message attachments)))

(defmethod send-notification! :email
  [{:keys [subject recipients message-type message]}]
  (email/send-message!
    :subject      subject
    :recipients   recipients
    :message-type message-type
    :message      message))

(defn- send-notifications! [notifications]
  (doseq [notification notifications]
    ;; do a try-catch around each notification so if one fails, we'll still send the other ones for example, an Alert
    ;; set up to send over both Slack & email: if Slack fails, we still want to send the email (#7409)
    (try
      (send-notification! notification)
      (catch Throwable e
        (log/error e (trs "Error sending notification!"))))))

(defn- pulse->notifications [{:keys [cards channel-ids], :as pulse}]
  (let [results     (for [card  cards
                          :let  [result (execute-card (:id card), :pulse-id (:id pulse))] ; Pulse ID may be `nil` if the Pulse isn't saved yet
                          :when result] ; some cards may return empty results, e.g. if the card has been archived
                      result)
        channel-ids (or channel-ids (mapv :id (:channels pulse)))]
    (when (should-send-notification? pulse results)

      (when (:alert_first_only pulse)
        (db/delete! Pulse :id (:id pulse)))

      (for [channel-id channel-ids
            :let [channel (some #(when (= channel-id (:id %)) %) (:channels pulse))]]
        (create-notification pulse results channel)))))

(defn send-pulse!
  "Execute and Send a `Pulse`, optionally specifying the specific `PulseChannels`.  This includes running each
   `PulseCard`, formatting the results, and sending the results to any specified destination.

   Example:
       (send-pulse! pulse)                       Send to all Channels
       (send-pulse! pulse :channel-ids [312])    Send only to Channel with :id = 312"
  [{:keys [cards], :as pulse} & {:keys [channel-ids]}]
  {:pre [(map? pulse) (every? map? cards) (every? :id cards)]}
  (send-notifications! (pulse->notifications (merge pulse (when channel-ids {:channel-ids channel-ids})))))
