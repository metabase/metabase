(ns metabase.pulse
  "Public API for sending Pulses."
  (:require [clojure.tools.logging :as log]
            [metabase
             [email :as email]
             [query-processor :as qp]
             [util :as u]]
            [metabase.email.messages :as messages]
            [metabase.integrations.slack :as slack]
            [metabase.models.card :refer [Card]]
            [metabase.pulse.render :as render]
            [metabase.util.urls :as urls]))

;;; ## ---------------------------------------- PULSE SENDING ----------------------------------------


;; TODO: this is probably something that could live somewhere else and just be reused
(defn execute-card
  "Execute the query for a single card with CARD-ID. OPTIONS are passed along to `dataset-query`."
  [card-id & {:as options}]
  {:pre [(integer? card-id)]}
  (when-let [card (Card card-id)]
    (let [{:keys [creator_id dataset_query]} card]
      (try
        {:card   card
         :result (qp/dataset-query dataset_query (merge {:executed-by creator_id, :context :pulse, :card-id card-id}
                                                        options))}
        (catch Throwable t
          (log/warn (format "Error running card query (%n)" card-id) t))))))

(defn- send-email-pulse!
  "Send a `Pulse` email given a list of card results to render and a list of recipients to send to."
  [{:keys [id name] :as pulse} results recipients]
  (log/debug (format "Sending Pulse (%d: %s) via Channel :email" id name))
  (let [email-subject    (str "Pulse: " name)
        email-recipients (filterv u/is-email? (map :email recipients))]
    (email/send-message!
      :subject      email-subject
      :recipients   email-recipients
      :message-type :attachments
      :message      (messages/render-pulse-email pulse results))))

(defn create-and-upload-slack-attachments!
  "Create an attachment in Slack for a given Card by rendering its result into an image and uploading it."
  [card-results]
  (let [{channel-id :id} (slack/files-channel)]
    (doall (for [{{card-id :id, card-name :name, :as card} :card, result :result} card-results]
             (let [image-byte-array (render/render-pulse-card-to-png card result)
                   slack-file-url   (slack/upload-file! image-byte-array "image.png" channel-id)]
               {:title      card-name
                :title_link (urls/card-url card-id)
                :image_url  slack-file-url
                :fallback   card-name})))))

(defn- send-slack-pulse!
  "Post a `Pulse` to a slack channel given a list of card results to render and details about the slack destination."
  [pulse results channel-id]
  {:pre [(string? channel-id)]}
  (log/debug (u/format-color 'cyan "Sending Pulse (%d: %s) via Slack" (:id pulse) (:name pulse)))
  (let [attachments (create-and-upload-slack-attachments! results)]
    (slack/post-chat-message! channel-id
                              (str "Pulse: " (:name pulse))
                              attachments)))

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

(defn send-pulse!
  "Execute and Send a `Pulse`, optionally specifying the specific `PulseChannels`.  This includes running each
   `PulseCard`, formatting the results, and sending the results to any specified destination.

   Example:
       (send-pulse! pulse)                       Send to all Channels
       (send-pulse! pulse :channel-ids [312])    Send only to Channel with :id = 312"
  [{:keys [cards], :as pulse} & {:keys [channel-ids]}]
  {:pre [(map? pulse) (every? map? cards) (every? :id cards)]}
  (let [results     (for [card cards]
                      (execute-card (:id card), :pulse-id (:id pulse))) ; Pulse ID may be `nil` if the Pulse isn't saved yet
        channel-ids (or channel-ids (mapv :id (:channels pulse)))]
    (when-not (and (:skip_if_empty pulse) (are-all-cards-empty? results))
      (doseq [channel-id channel-ids]
        (let [{:keys [channel_type details recipients]} (some #(when (= channel-id (:id %)) %)
                                                              (:channels pulse))]
          (condp = (keyword channel_type)
            :email (send-email-pulse! pulse results recipients)
            :slack (send-slack-pulse! pulse results (:channel details))))))))
