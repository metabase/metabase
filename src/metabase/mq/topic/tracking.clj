(ns metabase.mq.topic.tracking
  "Test backend for the pub/sub system. Delegates to the in-memory backend
  while tracking callback invocations for test assertions."
  (:require
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.memory]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *recent*
  "Tracks recent callback invocations for testing purposes."
  {:published-messages (atom [])
   :received-messages  (atom [])
   :errors             (atom [])})

(defn reset-tracking!
  "Resets all tracking atoms to empty vectors."
  []
  (reset! (:published-messages *recent*) [])
  (reset! (:received-messages *recent*) [])
  (reset! (:errors *recent*) []))

(defmethod topic.backend/publish! :topic.backend/tracking
  [_ topic-name messages]
  (topic.backend/publish! :topic.backend/memory topic-name messages)
  (swap! (:published-messages *recent*) conj {:topic topic-name :messages messages}))

(defmethod topic.backend/subscribe! :topic.backend/tracking
  [_ topic-name subscriber-name handler]
  (let [tracking-handler (fn [{:keys [messages] :as msg}]
                           (try
                             (handler msg)
                             (swap! (:received-messages *recent*) conj {:topic topic-name :subscriber subscriber-name :messages messages})
                             (catch Exception e
                               (log/warnf e "Error in tracking subscriber %s for topic %s" subscriber-name (name topic-name))
                               (swap! (:errors *recent*) conj {:topic topic-name :subscriber subscriber-name :error e}))))]
    (topic.backend/subscribe! :topic.backend/memory topic-name subscriber-name tracking-handler)))

(defmethod topic.backend/unsubscribe! :topic.backend/tracking
  [_ topic-name subscriber-name]
  (topic.backend/unsubscribe! :topic.backend/memory topic-name subscriber-name))

(defmethod topic.backend/cleanup! :topic.backend/tracking
  [_ topic-name max-age-ms]
  (topic.backend/cleanup! :topic.backend/memory topic-name max-age-ms))
