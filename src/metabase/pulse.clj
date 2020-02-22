(ns metabase.pulse
  "Public API for sending Pulses."
  (:require [clojure.tools.logging :as log]
            [metabase
             [email :as email]
             [query-processor :as qp]
             [util :as u]]
            [metabase.email.messages :as messages]
            [metabase.integrations.slack :as slack]
            [metabase.middleware.session :as session]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [pulse :as pulse :refer [Pulse]]]
            [metabase.pulse.render :as render]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util
             [i18n :refer [deferred-tru trs tru]]
             [ui-logic :as ui]
             [urls :as urls]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import metabase.models.card.CardInstance))

;;; ------------------------------------------------- PULSE SENDING --------------------------------------------------


;; TODO - this is probably something that could live somewhere else and just be reused
;; TODO - this should be done async
(defn execute-card
  "Execute the query for a single Card. `options` are passed along to the Query Processor."
  [{pulse-creator-id :creator_id} card-or-id & {:as options}]
  (let [card-id (u/get-id card-or-id)]
    (try
      (when-let [{query :dataset_query, :as card} (Card :id card-id, :archived false)]
        (let [query (assoc query :async? false)]
          (session/with-current-user pulse-creator-id
            {:card   card
             :result (qp/process-query-and-save-with-max-results-constraints!
                      query
                      (merge {:executed-by pulse-creator-id
                              :context     :pulse
                              :card-id     card-id}
                             options))})))
      (catch Throwable e
        (log/warn e (trs "Error running query for Card {0}" card-id))))))

(defn- database-id [card]
  (or (:database_id card)
      (get-in card [:dataset_query :database])))

(s/defn defaulted-timezone :- s/Str
  "Returns the timezone ID for the given `card`. Either the report timezone (if applicable) or the JVM timezone."
  [card :- CardInstance]
  (or (some-> card database-id Database qp.timezone/results-timezone-id)
      (qp.timezone/system-timezone-id)))

(defn- first-question-name [pulse]
  (-> pulse :cards first :name))

(defn- alert-condition-type->description [condition-type]
  (case (keyword condition-type)
    :meets (trs "reached its goal")
    :below (trs "gone below its goal")
    :rows  (trs "results")))

(defn create-slack-attachment-data
  "Returns a seq of slack attachment data structures, used in `create-and-upload-slack-attachments!`"
  [card-results]
  (let [{channel-id :id} (slack/files-channel)]
    (for [{{card-id :id, card-name :name, :as card} :card, result :result} card-results]
      {:title                  card-name
       :attachment-bytes-thunk (fn [] (render/render-pulse-card-to-png (defaulted-timezone card) card result))
       :title_link             (urls/card-url card-id)
       :attachment-name        "image.png"
       :channel-id             channel-id
       :fallback               card-name})))

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
      (throw (Exception. (str (deferred-tru "Unable to compare results to goal for alert.")
                              " "
                              (deferred-tru "Question ID is ''{0}'' with visualization settings ''{1}''"
                                        (get-in results [:card :id])
                                        (pr-str (get-in results [:card :visualization_settings])))))))
    (some (fn [row]
            (goal-comparison goal-val (comparison-col-rowfn row)))
          (get-in first-result [:result :data :rows]))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Creating Notifications To Send                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

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
    (let [^String error-text (tru "Unrecognized alert with condition ''{0}''" alert_condition)]
      (throw (IllegalArgumentException. error-text)))))

(defmethod should-send-notification? :pulse
  [{:keys [alert_condition] :as pulse} results]
  (if (:skip_if_empty pulse)
    (not (are-all-cards-empty? results))
    true))

(defmulti ^:private notification
  "Polymorphoic function for creating notifications. This logic is different for pulse type (i.e. alert vs. pulse) and
  channel_type (i.e. email vs. slack)"
  {:arglists '([alert-or-pulse results channel])}
  (fn [pulse _ {:keys [channel_type] :as channel}]
    [(alert-or-pulse pulse) (keyword channel_type)]))

(defmethod notification [:pulse :email]
  [{pulse-id :id, pulse-name :name, :as pulse} results {:keys [recipients] :as channel}]
  (log/debug (u/format-color 'cyan (trs "Sending Pulse ({0}: {1}) with {2} Cards via email"
                                        pulse-id (pr-str pulse-name) (count results))))
  (let [email-subject    (trs "Pulse: {0}" pulse-name)
        email-recipients (filterv u/email? (map :email recipients))
        timezone         (-> results first :card defaulted-timezone)]
    {:subject      email-subject
     :recipients   email-recipients
     :message-type :attachments
     :message      (messages/render-pulse-email timezone pulse results)}))

(defmethod notification [:pulse :slack]
  [{pulse-id :id, pulse-name :name, :as pulse} results {{channel-id :channel} :details :as channel}]
  (log/debug (u/format-color 'cyan (trs "Sending Pulse ({0}: {1}) with {2} Cards via Slack"
                                        pulse-id (pr-str pulse-name) (count results))))
  {:channel-id  channel-id
   :message     (str "Pulse: " pulse-name)
   :attachments (create-slack-attachment-data results)})

(defmethod notification [:alert :email]
  [{:keys [id] :as pulse} results {:keys [recipients]}]
  (log/debug (trs "Sending Alert ({0}: {1}) via email" id name))
  (let [condition-kwd    (messages/pulse->alert-condition-kwd pulse)
        email-subject    (trs "Metabase alert: {0} has {1}"
                              (first-question-name pulse)
                              (alert-condition-type->description condition-kwd))
        email-recipients (filterv u/email? (map :email recipients))
        first-result     (first results)
        timezone         (-> first-result :card defaulted-timezone)]
    {:subject      email-subject
     :recipients   email-recipients
     :message-type :attachments
     :message      (messages/render-alert-email timezone pulse results (ui/find-goal-value first-result))}))

(defmethod notification [:alert :slack]
  [pulse results {{channel-id :channel} :details}]
  (log/debug (u/format-color 'cyan (trs "Sending Alert ({0}: {1}) via Slack" (:id pulse) (:name pulse))))
  {:channel-id  channel-id
   :message     (trs "Alert: {0}" (first-question-name pulse))
   :attachments (create-slack-attachment-data results)})

(defmethod notification :default
  [_ _ {:keys [channel_type]}]
  (throw (UnsupportedOperationException. (tru "Unrecognized channel type {0}" (pr-str channel_type)))))

(defn- results->notifications [{:keys [channels channel-ids], pulse-id :id, :as pulse} results]
  (let [channel-ids (or channel-ids (mapv :id channels))]
    (when (should-send-notification? pulse results)
      (when (:alert_first_only pulse)
        (db/delete! Pulse :id pulse-id))
      ;; `channel-ids` is the set of channels to send to now, so only send to those. Note the whole set of channels
      (for [channel channels
            :when   (contains? (set channel-ids) (:id channel))]
        (notification pulse results channel)))))

(defn- pulse->notifications [{:keys [cards], pulse-id :id, :as pulse}]
  (let [results (for [card  cards
                      ;; Pulse ID may be `nil` if the Pulse isn't saved yet
                      :let  [result (execute-card pulse (u/get-id card), :pulse-id pulse-id)]
                      ;; some cards may return empty results, e.g. if the card has been archived
                      :when result]
                  result)]
    (results->notifications pulse results)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Sending Notifications                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ^:private send-notification!
  "Invokes the side-affecty function for sending emails/slacks depending on the notification type"
  {:arglists '([pulse-or-alert])}
  (fn [{:keys [channel-id]}]
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

(defn send-pulse!
  "Execute and Send a `Pulse`, optionally specifying the specific `PulseChannels`.  This includes running each
   `PulseCard`, formatting the results, and sending the results to any specified destination.

  `channel-ids` is the set of channel IDs to send to *now* -- this may be a subset of the full set of channels for
  the Pulse.

   Example:
       (send-pulse! pulse)                       Send to all Channels
       (send-pulse! pulse :channel-ids [312])    Send only to Channel with :id = 312"
  [{:keys [cards], :as pulse} & {:keys [channel-ids]}]
  {:pre [(map? pulse)]}
  (let [pulse (-> pulse
                  pulse/map->PulseInstance
                  ;; This is usually already done by this step, in the `send-pulses` task which uses `retrieve-pulse`
                  ;; to fetch the Pulse.
                  pulse/hydrate-notification
                  (merge (when channel-ids {:channel-ids channel-ids})))]
    (send-notifications! (pulse->notifications pulse))))
