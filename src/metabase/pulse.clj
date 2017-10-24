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
            [metabase.models.card :refer [Card]]
            [metabase.pulse.render :as render]
            [metabase.util.urls :as urls]
            [schema.core :as s])
  (:import java.util.TimeZone))

;;; ## ---------------------------------------- PULSE SENDING ----------------------------------------


;; TODO: this is probably something that could live somewhere else and just be reused
(defn execute-card
  "Execute the query for a single card with CARD-ID. OPTIONS are passed along to `dataset-query`."
  [card-id & {:as options}]
  {:pre [(integer? card-id)]}
  (when-let [card (Card :id card-id, :archived false)]
    (let [{:keys [creator_id dataset_query]} card]
      (try
        {:card   card
         :result (qp/process-query-and-save-execution! dataset_query
                   (merge {:executed-by creator_id, :context :pulse, :card-id card-id}
                          options))}
        (catch Throwable t
          (log/warn (format "Error running card query (%n)" card-id) t))))))

(defn- database-id [card]
  (or (:database_id card)
      (get-in card [:dataset_query :database])))

(s/defn defaulted-timezone :- TimeZone
  "Returns the timezone for the given `CARD`. Either the report
  timezone (if applicable) or the JVM timezone."
  [card :- Card]
  (let [^String timezone-str (or (some-> card database-id driver/database-id->driver driver/report-timezone-if-supported)
                                 (System/getProperty "user.timezone"))]
    (TimeZone/getTimeZone timezone-str)))

(defn- create-email-notification [{:keys [id name] :as pulse} results recipients]
  (log/debug (format "Sending Pulse (%d: %s) via Channel :email" id name))
  (let [email-subject    (str "Pulse: " name)
        email-recipients (filterv u/is-email? (map :email recipients))
        timezone         (-> results first :card defaulted-timezone)]
    {:subject      email-subject
     :recipients   email-recipients
     :message-type :attachments
     :message      (messages/render-pulse-email timezone pulse results)}))

(defn- send-email-pulse!
  "Send a `Pulse` email given a list of card results to render and a list of recipients to send to."
  [{:keys [subject recipients message-type message]}]
  (email/send-message!
    :subject      subject
    :recipients   recipients
    :message-type message-type
    :message      message))

(defn create-slack-attachment-data [card-results]
  (let [{channel-id :id} (slack/files-channel)]
    (for [{{card-id :id, card-name :name, :as card} :card, result :result} card-results]
      {:title      card-name
       :attachment-bytes-thunk (fn [] (render/render-pulse-card-to-png (defaulted-timezone card) card result))
       :title_link (urls/card-url card-id)
       :attachment-name "image.png"
       :channel-id channel-id
       :fallback   card-name})))

(defn- create-slack-notification [pulse results channel-id]
  (log/debug (u/format-color 'cyan "Sending Pulse (%d: %s) via Slack" (:id pulse) (:name pulse)))
  {:channel-id channel-id
   :message (str "Pulse: " (:name pulse))
   :attachments (create-slack-attachment-data results)})

(defn create-and-upload-slack-attachments!
  "Create an attachment in Slack for a given Card by rendering its result into an image and uploading it."
  [attachments]
  (doall
   (for [{:keys [attachment-bytes-thunk attachment-name channel-id] :as attachment-data} attachments]
     (let [slack-file-url (slack/upload-file! (attachment-bytes-thunk) attachment-name channel-id)]
       (-> attachment-data
           (select-keys [:title :title_link :fallback])
           (assoc :image_url slack-file-url))))))

(defn- send-slack-pulse!
  "Post a `Pulse` to a slack channel given a list of card results to render and details about the slack destination."
  [{:keys [channel-id message attachments]}]
  {:pre [(string? channel-id)]}
  (let [attachments (create-and-upload-slack-attachments! attachments)]
    (slack/post-chat-message! channel-id message attachments)))

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

(defn- pulse->notifications [{:keys [cards channel-ids], :as pulse}]
  (let [results     (for [card  cards
                          :let  [result (execute-card (:id card), :pulse-id (:id pulse))] ; Pulse ID may be `nil` if the Pulse isn't saved yet
                          :when result] ; some cards may return empty results, e.g. if the card has been archived
                      result)
        channel-ids (or channel-ids (mapv :id (:channels pulse)))]
    (when-not (and (:skip_if_empty pulse) (are-all-cards-empty? results))
      (for [channel-id channel-ids
            :let [{:keys [channel_type details recipients]} (some #(when (= channel-id (:id %)) %)
                                                                  (:channels pulse))]]
          (case (keyword channel_type)
            :email (create-email-notification pulse results recipients)
            :slack (create-slack-notification pulse results (:channel details)))))))

(defn- send-notifications! [notifications]
  (doseq [notification notifications]
    (if (contains? notification :channel-id)
      (send-slack-pulse! notification)
      (send-email-pulse! notification))))

(defn send-pulse!
  "Execute and Send a `Pulse`, optionally specifying the specific `PulseChannels`.  This includes running each
   `PulseCard`, formatting the results, and sending the results to any specified destination.

   Example:
       (send-pulse! pulse)                       Send to all Channels
       (send-pulse! pulse :channel-ids [312])    Send only to Channel with :id = 312"
  [{:keys [cards], :as pulse} & {:keys [channel-ids]}]
  {:pre [(map? pulse) (every? map? cards) (every? :id cards)]}
  (send-notifications! (pulse->notifications (merge pulse (when channel-ids {:channel-ids channel-ids})))))
