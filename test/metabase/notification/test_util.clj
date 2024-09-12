(ns metabase.notification.test-util
  "Define the `metabase-test` channel and notification test utilities."
  (:require
   [metabase.channel.core :as channel]
   [metabase.test.util.dynamic-redefs :as test.util.dynamic-redefs]
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

(def default-can-connect-channel
  "Default channel that can connects"
  {:name        "Test channel"
   :description "Test channel description"
   :type        test-channel-type
   :details     {:return-type  "return-value"
                 :return-value true}
   :active      true})

(defn do-with-captured-channel-send!
  [thunk]
  (let [channel-messages (atom {})]
    (test.util.dynamic-redefs/with-dynamic-redefs
      [channel/send! (fn [channel message]
                       (swap! channel-messages update (:type channel) u/conjv message))]
      (thunk)
      @channel-messages)))

(defmacro with-captured-channel-send!
  "Macro that captures all messages sent to channels in the body of the macro.
  Returns a map of channel-type -> messages sent to that channel.

    (with-captured-channel-send!
      (channel/send! {:type :channel/email} {:say :hi})
      (channel/send! {:type :channel/email} {:say :xin-chao}))

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
       ~@body
       (finally
         (doseq [topic# topics#]
           (underive topic# :metabase/event))))))
