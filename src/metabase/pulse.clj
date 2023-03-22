(ns metabase.pulse
  "Public API for sending Pulses."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.integrations.slack :as slack]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card
    :as dashboard-card
    :refer [DashboardCard]]
   [metabase.models.database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.models.pulse :as pulse :refer [Pulse]]
   [metabase.models.serialization :as serdes]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.markdown :as markdown]
   [metabase.pulse.parameters :as params]
   [metabase.pulse.render :as render]
   [metabase.pulse.util :as pu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.retry :as retry]
   [metabase.util.ui-logic :as ui-logic]
   [metabase.util.urls :as urls]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

;;; ------------------------------------------------- PULSE SENDING --------------------------------------------------

(defn- merge-default-values
  "For the specific case of Dashboard Subscriptions we should use `:default` parameter values as the actual `:value` for
  the parameter if none is specified. Normally the FE client will take `:default` and pass it in as `:value` if it
  wants to use it (see #20503 for more details) but this obviously isn't an option for Dashboard Subscriptions... so
  go thru `parameters` and change `:default` to `:value` unless a `:value` is explicitly specified."
  [parameters]
  (for [{default-value :default, :as parameter} parameters]
    (merge
     (when default-value
       {:value default-value})
     (dissoc parameter :default))))

(defn- execute-dashboard-subscription-card
  "Returns subscription result for a card.

  This function should be executed under pulse's creator permissions."
  [dashboard dashcard card-or-id parameters]
  (assert api/*current-user-id* "Makes sure you wrapped this with a `with-current-user`.")
  (try
    (let [card-id (u/the-id card-or-id)
          card    (t2/select-one Card :id card-id)
          result  (qp.dashboard/run-query-for-dashcard-async
                   :dashboard-id  (u/the-id dashboard)
                   :card-id       card-id
                   :dashcard-id   (u/the-id dashcard)
                   :context       :pulse ; TODO - we should support for `:dashboard-subscription` and use that to differentiate the two
                   :export-format :api
                   :parameters    parameters
                   :middleware    {:process-viz-settings? true
                                   :js-int-to-string?     false}
                   :run           (fn [query info]
                                    (qp/process-query-and-save-with-max-results-constraints!
                                     (assoc query :async? false)
                                     info)))]
      {:card     card
       :dashcard dashcard
       :result   result})
    (catch Throwable e
      (log/warn e (trs "Error running query for Card {0}" card-or-id)))))

(defn- dashcard-comparator
  "Comparator that determines which of two dashcards comes first in the layout order used for pulses.
  This is the same order used on the frontend for the mobile layout. Orders cards left-to-right, then top-to-bottom"
  [dashcard-1 dashcard-2]
  (if-not (= (:row dashcard-1) (:row dashcard-2))
    (compare (:row dashcard-1) (:row dashcard-2))
    (compare (:col dashcard-1) (:col dashcard-2))))

(defn virtual-card-of-type?
  "Check if dashcard is a virtual with type `ttype`, if `true` returns the dashcard, else returns `nil`.

  There are currently 3 types of virtual card: \"text\", \"action\", \"link\"."
  [dashcard ttype]
  (when (= ttype (get-in dashcard [:visualization_settings :virtual_card :display]))
    dashcard))

(defn- link-card-entity->url
  [{:keys [db_id id model] :as _entity}]
  (case model
    "card"       (urls/card-url id)
    "dataset"    (urls/card-url id)
    "collection" (urls/collection-url id)
    "dashboard"  (urls/dashboard-url id)
    "database"   (urls/database-url id)
    "table"      (urls/table-url db_id id)))

(defn- link-card->text
  [{:keys [entity url] :as _link-card}]
  (let [url-link-card? (some? url)]
    {:text (str (format
                  "### [%s](%s)"
                  (if url-link-card? url (:name entity))
                  (if url-link-card? url (link-card-entity->url entity)))
                (when-let [description (if url-link-card? nil (:description entity))]
                  (format "\n%s" description)))}))

(defn- dashcard-link-card->content
  "Convert a dashcard that is a link card to pulse content.

  This function should be executed under pulse's creator permissions."
  [dashcard]
  (assert api/*current-user-id* "Makes sure you wrapped this with a `with-current-user`.")
  (let [link-card (get-in dashcard [:visualization_settings :link])]
    (cond
      (some? (:url link-card))
      (link-card->text link-card)

      ;; if link card link to an entity, update the setting because
      ;; the info in viz-settings might be out-of-date
      (some? (:entity link-card))
      (let [{:keys [model id]} (:entity link-card)
            instance           (t2/select-one
                                 (serdes/link-card-model->toucan-model model)
                                 (dashboard-card/link-card-info-query-for-model model id))]
        (when (mi/can-read? instance)
          (link-card->text (assoc link-card :entity instance)))))))

(defn- dashcard->content
  "Given a dashcard returns its content based on its type.

  The result will follow the pulse's creator permissions."
  [dashcard pulse dashboard]
  (assert api/*current-user-id* "Makes sure you wrapped this with a `with-current-user`.")
  (cond
    (:card_id dashcard)
    (let [parameters (merge-default-values (params/parameters pulse dashboard))]
      (execute-dashboard-subscription-card dashboard dashcard (:card_id dashcard) parameters))

    ;; actions
    (virtual-card-of-type? dashcard "action")
    nil

    ;; link cards
    (virtual-card-of-type? dashcard "link")
    (dashcard-link-card->content dashcard)

    ;; text cards has existed for a while and I'm not sure if all existing text cards
    ;; will have virtual_card.display = "text", so assume everything else is a text card
    :else
    (let [parameters (merge-default-values (params/parameters pulse dashboard))]
      (-> dashcard
          (params/process-virtual-dashcard parameters)
          :visualization_settings))))

(defn- execute-dashboard
  "Fetch all the dashcards in a dashboard for a Pulse, and execute non-text cards.

  The gerenerated contents will follow the pulse's creator permissions."
  [{pulse-creator-id :creator_id, :as pulse} dashboard & {:as _options}]
  (let [dashboard-id      (u/the-id dashboard)
        dashcards         (t2/select DashboardCard :dashboard_id dashboard-id)
        ordered-dashcards (sort dashcard-comparator dashcards)]
    (mw.session/with-current-user pulse-creator-id
      (doall (for [dashcard ordered-dashcards
                   :let  [content (dashcard->content dashcard pulse dashboard)]
                   :when (some? content)]
               content)))))

(defn- database-id [card]
  (or (:database_id card)
      (get-in card [:dataset_query :database])))

(s/defn defaulted-timezone :- s/Str
  "Returns the timezone ID for the given `card`. Either the report timezone (if applicable) or the JVM timezone."
  [card :- (mi/InstanceOf Card)]
  (or (some->> card database-id (t2/select-one Database :id) qp.timezone/results-timezone-id)
      (qp.timezone/system-timezone-id)))

(defn- first-question-name [pulse]
  (-> pulse :cards first :name))

(defn- alert-condition-type->description [condition-type]
  (case (keyword condition-type)
    :meets (trs "reached its goal")
    :below (trs "gone below its goal")
    :rows  (trs "results")))

(def ^:private block-text-length-limit 3000)
(def ^:private attachment-text-length-limit 2000)

(defn- truncate-mrkdwn
  "If a mrkdwn string is greater than Slack's length limit, truncates it to fit the limit and
  adds an ellipsis character to the end."
  [mrkdwn limit]
  (if (> (count mrkdwn) limit)
    (-> mrkdwn
        (subs 0 (dec limit))
        (str "…"))
    mrkdwn))

(defn- create-slack-attachment-data
  "Returns a seq of slack attachment data structures, used in `create-and-upload-slack-attachments!`"
  [card-results]
  (let [channel-id (slack/files-channel)]
    (->> (for [card-result card-results]
           (let [{{card-id :id, card-name :name, :as card} :card, dashcard :dashcard, result :result} card-result]
             (if (and card result)
               {:title           (or (-> dashcard :visualization_settings :card.title)
                                     card-name)
                :rendered-info   (render/render-pulse-card :inline (defaulted-timezone card) card dashcard result)
                :title_link      (urls/card-url card-id)
                :attachment-name "image.png"
                :channel-id      channel-id
                :fallback        card-name}
               (let [mrkdwn (markdown/process-markdown (:text card-result) :slack)]
                 (when (not (str/blank? mrkdwn))
                   {:blocks [{:type "section"
                              :text {:type "mrkdwn"
                                     :text (truncate-mrkdwn mrkdwn block-text-length-limit)}}]})))))
         (remove nil?))))

(defn- subject
  [{:keys [name cards dashboard_id]}]
  (if (or dashboard_id
          (some :dashboard_id cards))
    name
    (trs "Pulse: {0}" name)))

(defn- filter-text
  [filter]
  (truncate-mrkdwn
   (format "*%s*\n%s" (:name filter) (params/value-string filter))
   attachment-text-length-limit))

(defn- slack-dashboard-header
  "Returns a block element that includes a dashboard's name, creator, and filters, for inclusion in a
  Slack dashboard subscription"
  [pulse dashboard]
  (let [header-section  {:type "header"
                         :text {:type "plain_text"
                                :text (subject pulse)
                                :emoji true}}
        creator-section {:type   "section"
                         :fields [{:type "mrkdwn"
                                   :text (str "Sent by " (-> pulse :creator :common_name))}]}
        filters         (params/parameters pulse dashboard)
        filter-fields   (for [filter filters]
                          {:type "mrkdwn"
                           :text (filter-text filter)})
        filter-section  (when (seq filter-fields)
                          {:type   "section"
                           :fields filter-fields})]
    (if filter-section
      {:blocks [header-section filter-section creator-section]}
      {:blocks [header-section creator-section]})))

(defn- slack-dashboard-footer
  "Returns a block element with the footer text and link which should be at the end of a Slack dashboard subscription."
  [pulse dashboard]
  {:blocks
   [{:type "divider"}
    {:type "context"
     :elements [{:type "mrkdwn"
                 :text (str "<" (params/dashboard-url (u/the-id dashboard) (params/parameters pulse dashboard)) "|"
                            "*Sent from " (public-settings/site-name) "*>")}]}]})

(def slack-width
  "Maximum width of the rendered PNG of HTML to be sent to Slack. Content that exceeds this width (e.g. a table with
  many columns) is truncated."
  1200)

(defn create-and-upload-slack-attachments!
  "Create an attachment in Slack for a given Card by rendering its result into an image and uploading
  it. Slack-attachment-uploader is a function which takes image-bytes and an attachment name, uploads the file, and
  returns an image url, defaulting to slack/upload-file!.

  Nested `blocks` lists containing text cards are passed through unmodified."
  ([attachments] (create-and-upload-slack-attachments! attachments slack/upload-file!))
  ([attachments slack-attachment-uploader]
   (letfn [(f [a] (select-keys a [:title :title_link :fallback]))]
     (reduce (fn [processed {:keys [rendered-info attachment-name channel-id] :as attachment-data}]
               (conj processed (if (:blocks attachment-data)
                                 attachment-data
                                 (if (:render/text rendered-info)
                                   (-> (f attachment-data)
                                       (assoc :text (:render/text rendered-info)))
                                   (let [image-bytes (render/png-from-render-info rendered-info slack-width)
                                         image-url   (slack-attachment-uploader image-bytes attachment-name channel-id)]
                                     (-> (f attachment-data)
                                         (assoc :image_url image-url)))))))
             []
             attachments))))

(defn- is-card-empty?
  "Check if the card is empty"
  [card]
  (if-let [result (:result card)]
    (or (zero? (-> result :row_count))
        ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
        (= [[nil]]
           (-> result :data :rows)))
    ;; Text cards have no result; treat as empty
    true))

(defn- are-all-cards-empty?
  "Do none of the cards have any results?"
  [results]
  (every? is-card-empty? results))

(defn- goal-met? [{:keys [alert_above_goal], :as pulse} [first-result]]
  (let [goal-comparison      (if alert_above_goal >= <)
        goal-val             (ui-logic/find-goal-value first-result)
        comparison-col-rowfn (ui-logic/make-goal-comparison-rowfn (:card first-result)
                                                            (get-in first-result [:result :data]))]

    (when-not (and goal-val comparison-col-rowfn)
      (throw (ex-info (tru "Unable to compare results to goal for alert.")
                      {:pulse  pulse
                       :result first-result})))
    (boolean
     (some (fn [row]
             (goal-comparison (comparison-col-rowfn row) goal-val))
           (get-in first-result [:result :data :rows])))))


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
  [pulse results]
  (if (:skip_if_empty pulse)
    (not (are-all-cards-empty? results))
    true))

;; 'notification' used below means a map that has information needed to send a Pulse/Alert, including results of
;; running the underlying query

(defmulti ^:private notification
  "Polymorphoic function for creating notifications. This logic is different for pulse type (i.e. alert vs. pulse) and
  channel_type (i.e. email vs. slack)"
  {:arglists '([alert-or-pulse results channel])}
  (fn [pulse _ {:keys [channel_type]}]
    [(alert-or-pulse pulse) (keyword channel_type)]))

(defmethod notification [:pulse :email]
  [{pulse-id :id, pulse-name :name, dashboard-id :dashboard_id, :as pulse} results {:keys [recipients]}]
  (log/debug (u/format-color 'cyan (trs "Sending Pulse ({0}: {1}) with {2} Cards via email"
                                        pulse-id (pr-str pulse-name) (count results))))
  (let [email-recipients (filterv u/email? (map :email recipients))
        query-results    (filter :card results)
        timezone         (-> query-results first :card defaulted-timezone)
        dashboard        (t2/select-one Dashboard :id dashboard-id)]
    {:subject      (subject pulse)
     :recipients   email-recipients
     :message-type :attachments
     :message      (messages/render-pulse-email timezone pulse dashboard results)}))

(defmethod notification [:pulse :slack]
  [{pulse-id :id, pulse-name :name, dashboard-id :dashboard_id, :as pulse}
   results
   {{channel-id :channel} :details}]
  (log/debug (u/format-color 'cyan (trs "Sending Pulse ({0}: {1}) with {2} Cards via Slack"
                                        pulse-id (pr-str pulse-name) (count results))))
  (let [dashboard (t2/select-one Dashboard :id dashboard-id)]
    {:channel-id  channel-id
     :attachments (remove nil?
                          (flatten [(slack-dashboard-header pulse dashboard)
                                    (create-slack-attachment-data results)
                                    (when dashboard (slack-dashboard-footer pulse dashboard))]))}))

(defmethod notification [:alert :email]
  [{:keys [id] :as pulse} results channel]
  (log/debug (trs "Sending Alert ({0}: {1}) via email" id name))
  (let [condition-kwd    (messages/pulse->alert-condition-kwd pulse)
        email-subject    (trs "Alert: {0} has {1}"
                              (first-question-name pulse)
                              (alert-condition-type->description condition-kwd))
        email-recipients (filterv u/email? (map :email (:recipients channel)))
        first-result     (first results)
        timezone         (-> first-result :card defaulted-timezone)]
    {:subject      email-subject
     :recipients   email-recipients
     :message-type :attachments
     :message      (messages/render-alert-email timezone pulse channel results (ui-logic/find-goal-value first-result))}))

(defmethod notification [:alert :slack]
  [pulse results {{channel-id :channel} :details}]
  (log/debug (u/format-color 'cyan (trs "Sending Alert ({0}: {1}) via Slack" (:id pulse) (:name pulse))))
  {:channel-id  channel-id
   :attachments (cons {:blocks [{:type "header"
                                 :text {:type "plain_text"
                                        :text (str "🔔 " (first-question-name pulse))
                                        :emoji true}}]}
                      (create-slack-attachment-data results))})

(defmethod notification :default
  [_ _ {:keys [channel_type]}]
  (throw (UnsupportedOperationException. (tru "Unrecognized channel type {0}" (pr-str channel_type)))))

(defn- results->notifications [{:keys [channels channel-ids], pulse-id :id, :as pulse} results]
  (let [channel-ids (or channel-ids (mapv :id channels))]
    (when (should-send-notification? pulse results)
      (when (:alert_first_only pulse)
        (t2/delete! Pulse :id pulse-id))
      ;; `channel-ids` is the set of channels to send to now, so only send to those. Note the whole set of channels
      (for [channel channels
            :when   (contains? (set channel-ids) (:id channel))]
        (notification pulse results channel)))))

(defn- pulse->notifications
  "Execute the underlying queries for a sequence of Pulses and return the results as 'notification' maps."
  [{:keys [cards], pulse-id :id, :as pulse} dashboard]
  (results->notifications pulse
                          (if dashboard
                            ;; send the dashboard
                            (execute-dashboard pulse dashboard)
                            ;; send the cards instead
                            (for [card  cards
                                  ;; Pulse ID may be `nil` if the Pulse isn't saved yet
                                  :let  [result (pu/execute-card pulse (u/the-id card), :pulse-id pulse-id)]
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
    (try
      (slack/post-chat-message! channel-id message attachments)
      (catch ExceptionInfo e
        ;; Token errors have already been logged and we should not retry.
        (when-not (contains? (:errors (ex-data e)) :slack-token)
          (throw e))))))

(defmethod send-notification! :email
  [{:keys [subject recipients message-type message]}]
  (try
    (email/send-message-or-throw! {:subject      subject
                                   :recipients   recipients
                                   :message-type message-type
                                   :message      message})
    (catch ExceptionInfo e
      (when (not= :smtp-host-not-set (:cause (ex-data e)))
        (throw e)))))

(declare ^:private reconfigure-retrying)

(defsetting notification-retry-max-attempts
  (deferred-tru "The maximum number of attempts for delivering a single notification.")
  :type :integer
  :default 7
  :on-change reconfigure-retrying)

(defsetting notification-retry-initial-interval
  (deferred-tru "The initial retry delay in milliseconds when delivering notifications.")
  :type :integer
  :default 500
  :on-change reconfigure-retrying)

(defsetting notification-retry-multiplier
  (deferred-tru "The delay multiplier between attempts to deliver a single notification.")
  :type :double
  :default 2.0
  :on-change reconfigure-retrying)

(defsetting notification-retry-randomization-factor
  (deferred-tru "The randomization factor of the retry delay when delivering notifications.")
  :type :double
  :default 0.1
  :on-change reconfigure-retrying)

(defsetting notification-retry-max-interval-millis
  (deferred-tru "The maximum delay between attempts to deliver a single notification.")
  :type :integer
  :default 30000
  :on-change reconfigure-retrying)

(defn- retry-configuration []
  (cond-> {:max-attempts (notification-retry-max-attempts)
           :initial-interval-millis (notification-retry-initial-interval)
           :multiplier (notification-retry-multiplier)
           :randomization-factor (notification-retry-randomization-factor)
           :max-interval-millis (notification-retry-max-interval-millis)}
    (or config/is-dev? config/is-test?) (assoc :max-attempts 1)))

(defn- make-retry-state
  "Returns a notification sender wrapping [[send-notifications!]] retrying
  according to `retry-configuration`."
  []
  (let [retry (retry/random-exponential-backoff-retry "send-notification-retry"
                                                      (retry-configuration))]
    {:retry retry
     :sender (retry/decorate send-notification! retry)}))

(defonce
  ^{:private true
    :doc "Stores the current retry state. Updated whenever the notification
  retry settings change.
  It starts with value `nil` but is set whenever the settings change or when
  the first call with retry is made. (See #22790 for more details.)"}
  retry-state
  (atom nil))

(defn- reconfigure-retrying [_old-value _new-value]
  (log/info (trs "Reconfiguring notification sender"))
  (reset! retry-state (make-retry-state)))

(defn- send-notification-retrying!
  "Like [[send-notification!]] but retries sending on errors according
  to the retry settings."
  [& args]
  (when-not @retry-state
    (compare-and-set! retry-state nil (make-retry-state)))
  (apply (:sender @retry-state) args))

(defn- send-notifications! [notifications]
  (doseq [notification notifications]
    ;; do a try-catch around each notification so if one fails, we'll still send the other ones for example, an Alert
    ;; set up to send over both Slack & email: if Slack fails, we still want to send the email (#7409)
    (try
      (send-notification-retrying! notification)
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
  [{:keys [dashboard_id], :as pulse} & {:keys [channel-ids]}]
  {:pre [(map? pulse) (integer? (:creator_id pulse))]}
  (let [dashboard (t2/select-one Dashboard :id dashboard_id)
        pulse     (-> (mi/instance Pulse pulse)
                      ;; This is usually already done by this step, in the `send-pulses` task which uses `retrieve-pulse`
                      ;; to fetch the Pulse.
                      pulse/hydrate-notification
                      (merge (when channel-ids {:channel-ids channel-ids})))]
    (when (not (:archived dashboard))
      (send-notifications! (pulse->notifications pulse dashboard)))))
