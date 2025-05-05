(ns metabase.notification.test-util
  "Define the `metabase-test` channel and notification test utilities."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.channel.core :as channel]
   [metabase.channel.email :as email]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.notification.core :as notification]
   [metabase.notification.events.notification :as events.notification]
   [metabase.notification.models :as models.notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.send :as notification.send]
   [metabase.notification.task.send :as task.notification]
   [metabase.task :as task]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def test-channel-type
  "The channel type for the test channel."
  "channel/metabase-test")

(defmethod channel/can-connect? (keyword test-channel-type)
  [_channel-type {:keys [return-type return-value] :as _details}]
  (case return-type
    "throw"
    (throw (ex-info "Test error" return-value))

    "return-value"
    return-value))

(defmethod channel/send! (keyword test-channel-type)
  [_channel message]
  message)

(defmethod channel/render-notification [:channel/metabase-test :notification/testing]
  [_channel-type notification-info _template _recipients]
  [notification-info])

(defmethod notification.payload/payload :notification/testing
  [_notification]
  {::payload? true})

(defmacro with-send-notification-sync
  "Notifications are sent async by default, wrap the body in this macro to send them synchronously."
  [& body]
  `(binding [notification.send/*default-options* {:notification/sync? true}]
     ~@body))

(defmacro with-javascript-visualization-stub
  "Rebind `metabase.channel.render.js.svg/*javascript-visualization*` to a stub function. Used to speed up tests that don't require the correct visualization for cards."
  [& body]
  `(binding [js.svg/*javascript-visualization*
             (fn [~'& ~'_]
               {:type :svg
                :content "<svg width=\"300\" height=\"130\" xmlns=\"http://www.w3.org/2000/svg\">\n  <rect width=\"200\" height=\"100\" x=\"10\" y=\"10\" rx=\"20\" ry=\"20\" fill=\"blue\" />\n</svg>"})]
     ~@body))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn do-with-captured-channel-send!
  [thunk]
  (with-send-notification-sync
    (let [channel-messages (atom {})]
      (with-redefs [channel/send! (fn [channel message]
                                    (swap! channel-messages update (:type channel) u/conjv message))]
        (thunk)
        @channel-messages))))

(defmacro with-captured-channel-send!
  "Macro that captures all messages sent to channels in the body of the macro.
  Returns a map of channel-type -> messages sent to that channel.

  (with-captured-channel-send!
  (channel/send! {:type :channel/email} {:say :hi})
  (channel/send! {:type :channel/email} {:say :xin-chao}))

  @captured-messages
  ;; => {:channel/email [{:say :hi} {:say :xin-chao}]}"
  [& body]
  `(do-with-captured-channel-send!
    (fn []
      ~@body)))

(defmacro with-temporary-event-topics!
  "Temporarily make `topics` valid event topics."
  [topics & body]
  `(let [topics# ~topics]
     (try
       (doseq [topic# topics#]
         (derive topic# :metabase/event))
       (with-redefs [events.notification/supported-topics (set/union @#'events.notification/supported-topics topics#)]
         ~@body)
       (finally
         (doseq [topic# topics#]
           (underive topic# :metabase/event))))))

(defmacro with-notification-cleanup!
  "Macro that clean ups notification related models"
  [& body]
  `(mt/with-model-cleanup [:model/Notification
                           :model/NotificationCard
                           :model/NotificationHandler
                           :model/NotificationSubscription
                           :model/NotificationRecipient]
     ~@body))

(defmacro with-notification-testing-setup!
  "Macro that sets up the notification testing environment."
  [& body]
  `(with-notification-cleanup!
     (with-send-notification-sync
       ~@body)))

(def default-card-name "Card notification test card")

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn do-with-temp-notification
  "Create a temporary notification for testing."
  [{:keys [notification handlers subscriptions]} thunk]
  (let [notification (models.notification/create-notification!
                      notification
                      subscriptions
                      handlers)]
    (try
      (thunk (models.notification/hydrate-notification notification))
      (finally
        (t2/delete! :model/Notification (:id notification))))))

(defmacro with-temp-notification
  "Macro that sets up a temporary notification for testing.
    (with-temp-notification
      [notification {:notification  {:creator_id 1}
                     :subscriptions []
                     :handlers      []}]
      (do-something))"
  [[bindings props] & body]
  `(do-with-temp-notification ~props (fn [~bindings] ~@body)))

(defn do-with-card-notification
  [{:keys [card notification-card notification subscriptions handlers]} thunk]
  (mt/with-temp
    [:model/Card {card-id :id} (merge
                                {:name          default-card-name
                                 :dataset_query (mt/mbql-query products {:aggregation [[:count]]
                                                                         :breakout    [$category]})}

                                card)]
    (do-with-temp-notification
     {:notification  (merge {:payload      (assoc notification-card
                                                  :card_id card-id)
                             :payload_type :notification/card
                             :creator_id   (mt/user->id :crowberto)}
                            notification)
      :subscriptions subscriptions
      :handlers      handlers}
     thunk)))

(defmacro with-card-notification
  "Macro that sets up a card notification for testing.
    (with-card-notification
      [notification {:card              {:name \"My Card\"}
                     :notification      {:creator_id 1}
                     :notification-card {:send_condition :rows}
                     :subscriptions     []
                     :handlers          []}]"
  [[bindings props] & body]
  `(do-with-card-notification ~props (fn [~bindings] ~@body)))

(defn do-with-system-event-notification!
  [{:keys [event notification subscriptions handlers]} thunk]
  (with-temporary-event-topics! [event]
    (do-with-temp-notification
     {:notification  (merge {:payload_type :notification/system-event
                             :creator_id   (mt/user->id :crowberto)}
                            notification)
      :subscriptions subscriptions
      :handlers      handlers}
     thunk)))

(defmacro with-system-event-notification!
  "Macro that sets up a system event notification for testing.
    (with-system-event-notification!
      [notification {:event         :metabase/big-event
                     :notification  {:creator_id 1}
                     :subscriptions []
                     :handlers      []}]"
  [[notification-binding props] & body]
  `(do-with-system-event-notification! ~props (fn [~notification-binding] ~@body)))

(def channel-type->fixture
  {:channel/email (fn [thunk] (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                                                 email-smtp-port 587
                                                                 site-url        "https://testmb.com/"]
                                (thunk)))
   :channel/slack (fn [thunk] (thunk))})

(defn apply-channel-fixtures
  [channel-types thunk]
  ((reduce (fn [handler fixture] #(fixture handler))
           thunk
           (keep channel-type->fixture channel-types))))

(defmacro with-channel-fixtures
  "Macro that applies the given channel fixtures to the body of the macro."
  [channel-types & body]
  `(with-send-notification-sync
     (apply-channel-fixtures ~channel-types (fn [] ~@body))))

(defn test-send-notification!
  "Test sending a notification with the given channel-type->assert-fn map."
  [notification channel-type->assert-fn]
  (with-channel-fixtures (keys channel-type->assert-fn)
    (let [channel-type->captured-message (with-captured-channel-send!
                                           (notification/send-notification! notification))]

      (doseq [[channel-type assert-fn] channel-type->assert-fn]
        (testing (format "chanel-type = %s" channel-type)
          (assert-fn (get channel-type->captured-message channel-type)))))))

(defn slack-message->boolean [{:keys [attachments] :as result}]
  (assoc result :attachments (for [attachment-info attachments]
                               (if (:rendered-info attachment-info)
                                 (update attachment-info
                                         :rendered-info
                                         (fn [ri] (m/map-vals some? ri)))
                                 attachment-info))))

(defn do-with-mock-inbox-email!
  "Helper function that mocks email/send-email! to capture emails in a vector and returns them."
  [thunk]
  (let [emails (atom [])]
    (mt/with-dynamic-fn-redefs [email/send-email! (fn [_ email]
                                                    (swap! emails conj email))]
      (thunk)
      @emails)))

(defmacro with-mock-inbox-email!
  "Macro that mocks email/send-email! to capture emails in a vector and returns them.
   Example:
   (with-mock-inbox-email
     (email/send-email! {:to \"test@test.com\"})
     (email/send-email! {:to \"test2@test.com\"}))
   ;; => [{:to \"test@test.com\"} {:to \"test2@test.com\"}]"
  [& body]
  `(do-with-mock-inbox-email! (fn [] ~@body)))

(defn send-notification-triggers
  "Return the quartz triggers for a subscription."
  [subscription-id]
  (map
   #(select-keys % [:key :schedule :data :timezone])
   (task/existing-triggers @#'task.notification/send-notification-job-key
                           (#'task.notification/send-notification-trigger-key subscription-id))))

(defn notification-triggers
  "Return the quartz triggers for a notification."
  [notification-id]
  (let [subscription-ids (t2/select-pks-set :model/NotificationSubscription :notification_id notification-id)]
    (mapcat send-notification-triggers subscription-ids)))

(defn subscription->trigger-info
  "Return the quartz trigger info for a subscription."
  ([subscription-id cron-schedule]
   (subscription->trigger-info subscription-id cron-schedule "UTC"))
  ([subscription-id cron-schedule timezone]
   {:key      (.getName (#'task.notification/send-notification-trigger-key subscription-id))
    :schedule cron-schedule
    :data     {"subscription-id" subscription-id}
    :timezone timezone}))

;; ------------------------------------------------------------------------------------------------;;
;;                                         Dummy Data                                              ;;
;; ------------------------------------------------------------------------------------------------;;

;; :model/Channel
(def default-can-connect-channel
  "A :model/Channel that can connect."
  {:name        "Test channel"
   :description "Test channel description"
   :type        test-channel-type
   :details     {:return-type  "return-value"
                 :return-value true}
   :active      true})

(def channel-template-email-with-handlebars-body
  "A :model/ChannelTemplate for email channels that has a :event/handlebars-text template."
  {:channel_type :channel/email
   :details      {:type    :email/handlebars-text
                  :subject "Welcome {{payload.event_info.object.first_name}} to {{context.site_name}}"
                  :body    "Hello {{payload.event_info.object.first_name}}! Welcome to {{context.site_name}}!"}})

(def default-email-handler
  (delay {:channel_type :channel/email
          :recipients   [{:type    :notification-recipient/user
                          :user_id (mt/user->id :rasta)}]}))

(def default-slack-handler
  {:channel_type :channel/slack
   :recipients   [{:type    :notification-recipient/raw-value
                   :details {:value "#general"}}]})

(def png-attachment
  {:type         :inline
   :content-id   true
   :content-type "image/png"
   :content      java.net.URL})

(def csv-attachment
  {:type         :attachment
   :content-type "text/csv"
   :file-name    (format "%s.csv" default-card-name)
   :content      java.net.URL
   :description  (format "More results for '%s'" default-card-name)
   :content-id   false})

(def xls-attachment
  {:type         :attachment
   :file-name    "Test card.xlsx"
   :content-type "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   :content      java.net.URL
   :description  "More results for 'Test card'"
   :content-id   false})
