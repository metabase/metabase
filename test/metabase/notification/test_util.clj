(ns metabase.notification.test-util
  "Define the `metabase-test` channel and notification test utilities."
  (:require
   [clojure.set :as set]
   [metabase.channel.core :as channel]
   [metabase.events.notification :as events.notification]
   [metabase.notification.core :as notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.send :as notification.send]
   [metabase.test :as mt]
   [metabase.util :as u]))

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

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-send-notification-sync
  "Notifications are sent async by default, wrap the body in this macro to send them synchronously."
  [& body]
  `(binding [notification/*send-notification!* #'notification.send/send-notification-sync!]
     ~@body))

(defn do-with-captured-channel-send!
  [thunk]
  (with-send-notification-sync
    (let [channel-messages (atom {})]
      (with-redefs
       [channel/send! (fn [channel message]
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

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-notification-testing-setup
  "Macro that sets up the notification testing environment."
  [& body]
  `(mt/with-model-cleanup [:model/Notification]
     (notification.tu/with-send-notification-sync
       ~@body)))

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

;; :model/ChannelTemplate

(def channel-template-email-with-mustache-body
  "A :model/ChannelTemplate for email channels that has a :event/mustache template."
  {:channel_type :channel/email
   :details      {:type    :email/mustache-text
                  :subject "Welcome {{event-info.object.first_name}} to {{settings.site-name}}"
                  :body    "Hello {{event-info.object.first_name}}! Welcome to {{settings.site-name}}!"}})

;; notification info
#_(def notification-info-user-joined-event
    "A notification-info of the user-joined system event notification that can be used
  to test [[channel/render-notification]]."
    {:payload_type :notification/system-event
     :payload      (#'events.notification/enriched-event-info
                    :event/user-joined
                    {:object
                     {:email        "rasta@metabase.com"
                      :first_name   "Rasta"
                      :last_login   nil
                      :is_qbnewb    true
                      :is_superuser false
                      :last_name    "Toucan"
                      :common_name  "Rasta Toucan"}})})
