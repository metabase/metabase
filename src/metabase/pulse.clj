(ns metabase.pulse
  "Public API for sending Pulses."
  (:require [clojure.tools.logging :as log]
            [metabase.api.card :as card-api]
            [metabase.email :as email]
            [metabase.email.messages :as messages]
            [metabase.integrations.slack :as slack]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.database :refer [Database]]
            [metabase.models.pulse :as pulse :refer [Pulse]]
            [metabase.plugins.classloader :as classloader]
            [metabase.pulse.interface :as i]
            [metabase.pulse.render :as render]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.server.middleware.session :as session]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.ui-logic :as ui]
            [metabase.util.urls :as urls]
            [schema.core :as s]
            [toucan.db :as db])
  (:import metabase.models.card.CardInstance))


(def ^:private parameters-impl
  (u/prog1 (or (u/ignore-exceptions
                 (classloader/require 'metabase-enterprise.pulse)
                 (some-> (resolve 'metabase-enterprise.pulse/ee-strategy-parameters-impl)
                         var-get))
               i/default-parameters-impl)))



;;; ------------------------------------------------- PULSE SENDING --------------------------------------------------

;; TODO - this is probably something that could live somewhere else and just be reused
;; TODO - this should be done async
(defn execute-card
  "Execute the query for a single Card. `options` are passed along to the Query Processor."
  [{pulse-creator-id :creator_id} card-or-id & {:as options}]
  ;; The Card must either be executed in the context of a User or by the MetaBot which itself is not a User
  {:pre [(or (integer? pulse-creator-id)
             (= (:context options) :metabot))]}
  (let [card-id (u/the-id card-or-id)]
    (try
      (when-let [{query :dataset_query, :as card} (Card :id card-id, :archived false)]
        (let [query         (assoc query :async? false)
              process-query (fn []
                              (binding [qp.perms/*card-id* card-id]
                                (qp/process-query-and-save-with-max-results-constraints!
                                 query
                                 (merge {:executed-by pulse-creator-id
                                         :context     :pulse
                                         :card-id     card-id}
                                        options))))]
          (let [result (if pulse-creator-id
                     (session/with-current-user pulse-creator-id
                       (process-query))
                     (process-query))]
            {:card   card
             :result result})))
      (catch Throwable e
        (log/warn e (trs "Error running query for Card {0}" card-id))))))

(defn- execute-dashboard-subscription-card
  [owner-id dashboard dashcard card-or-id parameters]
  (try
    (let [card-id         (u/the-id card-or-id)
          card            (Card :id card-id)
          param-id->param (u/key-by :id parameters)
          params          (for [mapping (:parameter_mappings dashcard)
                                :when   (= (:card_id mapping) card-id)
                                :let    [param (get param-id->param (:parameter_id mapping))]
                                :when   param]
                            (assoc param :target (:target mapping)))
          result (session/with-current-user owner-id
                   (card-api/run-query-for-card-async
                    card-id :api
                    :dashboard-id  (:id dashboard)
                    :context       :pulse ; TODO - we should support for `:dashboard-subscription` and use that to differentiate the two
                    :export-format :api
                    :parameters    params
                    :run (fn [query & args]
                           (apply qp/process-query-and-save-with-max-results-constraints! (assoc query :async? false) args))))]
      {:card card
       :result result})
    (catch Throwable e
        (log/warn e (trs "Error running query for Card {0}" card-or-id)))))

(defn execute-dashboard
  "Execute all the cards in a dashboard for a Pulse"
  [{pulse-creator-id :creator_id, :as pulse} dashboard-or-id & {:as options}]
  (let [dashboard-id (u/the-id dashboard-or-id)
        dashboard (Dashboard :id dashboard-id)]
    (for [dashcard (db/select DashboardCard :dashboard_id dashboard-id, :card_id [:not= nil])]
      (execute-dashboard-subscription-card pulse-creator-id dashboard dashcard (:card_id dashcard) (i/the-parameters parameters-impl pulse dashboard)))))

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

(defn- goal-met? [{:keys [alert_above_goal], :as pulse} [first-result]]
  (let [goal-comparison      (if alert_above_goal <= >=)
        goal-val             (ui/find-goal-value first-result)
        comparison-col-rowfn (ui/make-goal-comparison-rowfn (:card first-result)
                                                            (get-in first-result [:result :data]))]

    (when-not (and goal-val comparison-col-rowfn)
      (throw (ex-info (tru "Unable to compare results to goal for alert.")
                      {:pulse  pulse
                       :result first-result})))
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

(defn- subject
  [{:keys [name cards dashboard_id]}]
  (if (or dashboard_id
          (some :dashboard_id cards))
    name
    (trs "Pulse: {0}" name)))

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

;; 'notification' used below means a map that has information needed to send a Pulse/Alert, including results of
;; running the underlying query

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
  (let [email-recipients (filterv u/email? (map :email recipients))
        timezone         (-> results first :card defaulted-timezone)]
    {:subject      (subject pulse)
     :recipients   email-recipients
     :message-type :attachments
     :message      (messages/render-pulse-email timezone pulse results)}))

(defmethod notification [:pulse :slack]
  [{pulse-id :id, pulse-name :name, :as pulse} results {{channel-id :channel} :details :as channel}]
  (log/debug (u/format-color 'cyan (trs "Sending Pulse ({0}: {1}) with {2} Cards via Slack"
                                        pulse-id (pr-str pulse-name) (count results))))
  {:channel-id  channel-id
   :message     (subject pulse)
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

(defn- pulse->notifications
  "Execute the underlying queries for a sequence of Pulses and return the results as 'notification' maps."
  [{:keys [cards dashboard_id], pulse-id :id, :as pulse}]
  (results->notifications pulse
                          (if dashboard_id
                            ;; send the dashboard
                            (execute-dashboard pulse dashboard_id)
                            ;; send the cards instead
                            (for [card  cards
                                  ;; Pulse ID may be `nil` if the Pulse isn't saved yet
                                  :let  [result (execute-card pulse (u/the-id card), :pulse-id pulse-id)]
                                  ;; some cards may return empty results, e.g. if the card has been archived
                                  :when result]
                              result))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Sending Notifications                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ^:private send-notification!
  "Invokes the side-effecty function for sending emails/slacks depending on the notification type"
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
  {:pre [(map? pulse) (integer? (:creator_id pulse))]}
  (let [pulse (-> pulse
                  pulse/map->PulseInstance
                  ;; This is usually already done by this step, in the `send-pulses` task which uses `retrieve-pulse`
                  ;; to fetch the Pulse.
                  pulse/hydrate-notification
                  (merge (when channel-ids {:channel-ids channel-ids})))]
    (send-notifications! (pulse->notifications pulse))))
