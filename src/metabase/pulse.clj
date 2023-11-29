(ns metabase.pulse
  "Public API for sending Pulses."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.integrations.slack :as slack]
   [metabase.models.dashboard :as dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :as dashboard-card]
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
   [metabase.shared.parameters.parameters :as shared.params]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.retry :as retry]
   [metabase.util.ui-logic :as ui-logic]
   [metabase.util.urls :as urls]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

;;; ------------------------------------------------- PULSE SENDING --------------------------------------------------

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
          card    (t2/select-one :model/Card :id card-id)
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
      (when-not (and (get-in dashcard [:visualization_settings :card.hide_empty]) (is-card-empty? result))
        {:card     card
         :dashcard dashcard
         :result   result
         :type     :card}))
    (catch Throwable e
      (log/warn e (trs "Error running query for Card {0}" card-or-id)))))

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

(defn- link-card->text-part
  [{:keys [entity url] :as _link-card}]
  (let [url-link-card? (some? url)]
    {:text (str (format
                  "### [%s](%s)"
                  (if url-link-card? url (:name entity))
                  (if url-link-card? url (link-card-entity->url entity)))
                (when-let [description (if url-link-card? nil (:description entity))]
                  (format "\n%s" description)))
     :type :text}))

(defn- dashcard-link-card->part
  "Convert a dashcard that is a link card to pulse part.

  This function should be executed under pulse's creator permissions."
  [dashcard]
  (assert api/*current-user-id* "Makes sure you wrapped this with a `with-current-user`.")
  (let [link-card (get-in dashcard [:visualization_settings :link])]
    (cond
      (some? (:url link-card))
      (link-card->text-part link-card)

      ;; if link card link to an entity, update the setting because
      ;; the info in viz-settings might be out-of-date
      (some? (:entity link-card))
      (let [{:keys [model id]} (:entity link-card)
            instance           (t2/select-one
                                 (serdes/link-card-model->toucan-model model)
                                 (dashboard-card/link-card-info-query-for-model model id))]
        (when (mi/can-read? instance)
          (link-card->text-part (assoc link-card :entity instance)))))))

(defn- escape-heading-markdown
  [dashcard]
  (if (= "heading" (get-in dashcard [:visualization_settings :virtual_card :display]))
    (update-in dashcard [:visualization_settings :text] #(str "## " (shared.params/escape-chars % shared.params/escaped-chars-regex)))
    dashcard))

(defn- dashcard->part
  "Given a dashcard returns its part based on its type.

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
    (dashcard-link-card->part dashcard)

    ;; text cards have existed for a while and I'm not sure if all existing text cards
    ;; will have virtual_card.display = "text", so assume everything else is a text card
    :else
    (let [parameters (merge-default-values (params/parameters pulse dashboard))]
      (-> dashcard
          (params/process-virtual-dashcard parameters)
          escape-heading-markdown
          :visualization_settings
          (assoc :type :text)))))

(defn- dashcards->part
  [dashcards pulse dashboard]
  (let [ordered-dashcards (sort dashboard-card/dashcard-comparator dashcards)]
    (doall (for [dashcard ordered-dashcards
                 :let     [part (dashcard->part dashcard pulse dashboard)]
                 :when    (some? part)]
             part))))

(defn- tab->part
  [{:keys [name]}]
  {:text name
   :type :tab-title})

(defn- execute-dashboard
  "Fetch all the dashcards in a dashboard for a Pulse, and execute non-text cards.

  The gerenerated parts will follow the pulse's creator permissions."
  [{pulse-creator-id :creator_id, :as pulse} dashboard & {:as _options}]
  (let [dashboard-id      (u/the-id dashboard)]
    (mw.session/with-current-user pulse-creator-id
      (if (dashboard/has-tabs? dashboard)
        (let [tabs-with-cards (t2/hydrate (t2/select :model/DashboardTab :dashboard_id dashboard-id) :tab-cards)]
         (doall (flatten (for [{:keys [cards] :as tab} tabs-with-cards]
                           (concat [(tab->part tab)] (dashcards->part cards pulse dashboard))))))
        (dashcards->part (t2/select :model/DashboardCard :dashboard_id dashboard-id) pulse dashboard)))))

(defn- database-id [card]
  (or (:database_id card)
      (get-in card [:dataset_query :database])))

(mu/defn defaulted-timezone :- :string
  "Returns the timezone ID for the given `card`. Either the report timezone (if applicable) or the JVM timezone."
  [card :- (mi/InstanceOf :model/Card)]
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

(defn- text->markdown-block
  [text]
  (let [mrkdwn (markdown/process-markdown text :slack)]
    (when (not (str/blank? mrkdwn))
      {:blocks [{:type "section"
                 :text {:type "mrkdwn"
                        :text (truncate-mrkdwn mrkdwn block-text-length-limit)}}]})))

(defn- part->attachment-data
  [part channel-id]
  (case (:type part)
    :card
    (let [{:keys [card dashcard result]}          part
          {card-id :id card-name :name :as card} card]
      {:title           (or (-> dashcard :visualization_settings :card.title)
                            card-name)
       :rendered-info   (render/render-pulse-card :inline (defaulted-timezone card) card dashcard result)
       :title_link      (urls/card-url card-id)
       :attachment-name "image.png"
       :channel-id      channel-id
       :fallback        card-name})

    :text
    (text->markdown-block (:text part))

    :tab-title
    (text->markdown-block (format "# %s" (:text part)))))

(defn- create-slack-attachment-data
  "Returns a seq of slack attachment data structures, used in `create-and-upload-slack-attachments!`"
  [parts]
  (let [channel-id (slack/files-channel)]
    (for [part  parts
          :let  [attachment (part->attachment-data part channel-id)]
          :when attachment]
      attachment)))

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
  "Create an attachment in Slack for a given Card by rendering its content into an image and uploading
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

(defn- are-all-parts-empty?
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
  (fn [pulse _parts] (alert-or-pulse pulse)))

(defmethod should-send-notification? :alert
  [{:keys [alert_condition] :as alert} parts]
  (cond
    (= "rows" alert_condition)
    (not (are-all-parts-empty? parts))

    (= "goal" alert_condition)
    (goal-met? alert parts)

    :else
    (let [^String error-text (tru "Unrecognized alert with condition ''{0}''" alert_condition)]
      (throw (IllegalArgumentException. error-text)))))

(defmethod should-send-notification? :pulse
  [pulse parts]
  (if (:skip_if_empty pulse)
    (not (are-all-parts-empty? parts))
    true))

(defn- parts->cards-count
  [parts]
  (count (filter #(some? (#{:text :card} (:type %))) parts)))

;; 'notification' used below means a map that has information needed to send a Pulse/Alert, including results of
;; running the underlying query
(defmulti ^:private notification
  "Polymorphoic function for creating notifications. This logic is different for pulse type (i.e. alert vs. pulse) and
  channel_type (i.e. email vs. slack)"
  {:arglists '([alert-or-pulse parts channel])}
  (fn [pulse _ {:keys [channel_type]}]
    [(alert-or-pulse pulse) (keyword channel_type)]))

(defn- construct-pulse-email [subject recipients message]
  {:subject      subject
   :recipients   recipients
   :message-type :attachments
   :message      message})

(defmethod notification [:pulse :email]
  [{pulse-id :id, pulse-name :name, dashboard-id :dashboard_id, :as pulse} parts {:keys [recipients]}]
  (log/debug (u/format-color 'cyan (trs "Sending Pulse ({0}: {1}) with {2} Cards via email"
                                        pulse-id (pr-str pulse-name) (parts->cards-count parts))))
  (let [user-recipients     (filter (fn [recipient] (and (u/email? (:email recipient))
                                                         (some? (:id recipient)))) recipients)
        non-user-recipients (filter (fn [recipient] (and (u/email? (:email recipient))
                                                         (nil? (:id recipient)))) recipients)
        timezone            (->> parts (some :card) defaulted-timezone)
        dashboard           (update (t2/select-one Dashboard :id dashboard-id) :description markdown/process-markdown :html)
        email-to-users      (when (> (count user-recipients) 0)
                              (construct-pulse-email (subject pulse) (mapv :email user-recipients) (messages/render-pulse-email timezone pulse dashboard parts nil)))
        email-to-nonusers   (for [non-user (map :email non-user-recipients)]
                              (construct-pulse-email (subject pulse) [non-user] (messages/render-pulse-email timezone pulse dashboard parts non-user)))]
    (if email-to-users
      (conj email-to-nonusers email-to-users)
      email-to-nonusers)))

(defmethod notification [:pulse :slack]
  [{pulse-id :id, pulse-name :name, dashboard-id :dashboard_id, :as pulse}
   parts
   {{channel-id :channel} :details}]
  (log/debug (u/format-color 'cyan (trs "Sending Pulse ({0}: {1}) with {2} Cards via Slack"
                                        pulse-id (pr-str pulse-name) (parts->cards-count parts))))
  (let [dashboard (t2/select-one Dashboard :id dashboard-id)]
    {:channel-id  channel-id
     :attachments (remove nil?
                          (flatten [(slack-dashboard-header pulse dashboard)
                                    (create-slack-attachment-data parts)
                                    (when dashboard (slack-dashboard-footer pulse dashboard))]))}))

(defmethod notification [:alert :email]
  [{:keys [id] :as pulse} parts channel]
  (log/debug (trs "Sending Alert ({0}: {1}) via email" id name))
  (let [condition-kwd       (messages/pulse->alert-condition-kwd pulse)
        email-subject       (trs "Alert: {0} has {1}"
                                 (first-question-name pulse)
                                 (alert-condition-type->description condition-kwd))
        user-recipients     (filter (fn [recipient] (and (u/email? (:email recipient))
                                                         (some? (:id recipient)))) (:recipients channel))
        non-user-recipients (filter (fn [recipient] (and (u/email? (:email recipient))
                                                         (nil? (:id recipient)))) (:recipients channel))
        first-part          (some :card parts)
        timezone            (defaulted-timezone first-part)
        email-to-users      (when (> (count user-recipients) 0)
                              (construct-pulse-email email-subject (mapv :email user-recipients) (messages/render-alert-email timezone pulse channel parts (ui-logic/find-goal-value first-part) nil)))
        email-to-nonusers   (for [non-user (map :email non-user-recipients)]
                              (construct-pulse-email email-subject [non-user] (messages/render-alert-email timezone pulse channel parts (ui-logic/find-goal-value first-part) non-user)))]
       (if email-to-users
         (conj email-to-nonusers email-to-users)
         email-to-nonusers)))

(defmethod notification [:alert :slack]
  [pulse parts {{channel-id :channel} :details}]
  (log/debug (u/format-color 'cyan (trs "Sending Alert ({0}: {1}) via Slack" (:id pulse) (:name pulse))))
  {:channel-id  channel-id
   :attachments (cons {:blocks [{:type "header"
                                 :text {:type "plain_text"
                                        :text (str "🔔 " (first-question-name pulse))
                                        :emoji true}}]}
                      (create-slack-attachment-data parts))})

(defmethod notification :default
  [_ _ {:keys [channel_type]}]
  (throw (UnsupportedOperationException. (tru "Unrecognized channel type {0}" (pr-str channel_type)))))

(defn- parts->notifications [{:keys [channels channel-ids], pulse-id :id, :as pulse} parts]
  (let [channel-ids (or channel-ids (mapv :id channels))]
    (when (should-send-notification? pulse parts)
      (let [event-type (if (= :pulse (alert-or-pulse pulse))
                         :event/subscription-send
                         :event/alert-send)]
        (events/publish-event! event-type {:id      (:id pulse)
                                           :user-id (:creator_id pulse)
                                           :object  {:recipients (map :recipients (:channels pulse))
                                                     :filters    (:parameters pulse)}}))

      (when (:alert_first_only pulse)
        (t2/delete! Pulse :id pulse-id))
      ;; `channel-ids` is the set of channels to send to now, so only send to those. Note the whole set of channels
      (for [channel channels
            :when   (contains? (set channel-ids) (:id channel))]
        (notification pulse parts channel)))))

(defn- pulse->notifications
  "Execute the underlying queries for a sequence of Pulses and return the parts as 'notification' maps."
  [{:keys [cards], pulse-id :id, :as pulse} dashboard]
  (parts->notifications pulse
                          (if dashboard
                            ;; send the dashboard
                            (execute-dashboard pulse dashboard)
                            ;; send the cards instead
                            (for [card  cards
                                  ;; Pulse ID may be `nil` if the Pulse isn't saved yet
                                  :let  [part (assoc (pu/execute-card pulse (u/the-id card) :pulse-id pulse-id) :type :card)]
                                  ;; some cards may return empty part, e.g. if the card has been archived
                                  :when part]
                              part))))

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
  [emails]
  (doseq [{:keys [subject recipients message-type message]} emails]
    (try
      (email/send-message-or-throw! {:subject      subject
                                     :recipients   recipients
                                     :message-type message-type
                                     :message      message
                                     :bcc?         (email/bcc-enabled?)})
      (catch ExceptionInfo e
        (when (not= :smtp-host-not-set (:cause (ex-data e)))
          (throw e))))))

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
   `PulseCard`, formatting the content, and sending the content to any specified destination.

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
