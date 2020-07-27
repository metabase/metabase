(ns metabase.events.revision
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.events :as events]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [metric :refer [Metric]]
                             [revision :refer [push-revision!]]
                             [segment :refer [Segment]])))


(def ^:const revisions-topics
  "The `Set` of event topics which are subscribed to for use in revision tracking."
  #{:card-create
    :card-update
    :dashboard-create
    :dashboard-update
    :dashboard-add-cards
    :dashboard-remove-cards
    :dashboard-reposition-cards
    :metric-create
    :metric-update
    :metric-delete
    :segment-create
    :segment-update
    :segment-delete})

(defonce ^:private ^{:doc "Channel for receiving event notifications we want to subscribe to for revision events."}
  revisions-channel
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn process-revision-event!
  "Handle processing for a single event notification received on the revisions-channel"
  [revision-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} revision-event]
      (let [model            (events/topic->model topic)
            id               (events/object->model-id topic object)
            user-id          (events/object->user-id object)
            revision-message (:revision_message object)]
        ;; TODO: seems unnecessary to select each entity again, is there a reason we aren't using `object` directly?
        (case model
          "card"      (push-revision! :entity       Card,
                                      :id           id,
                                      :object       (Card id),
                                      :user-id      user-id,
                                      :is-creation? (= :card-create topic)
                                      :message      revision-message)
          "dashboard" (push-revision! :entity       Dashboard,
                                      :id           id,
                                      :object       (Dashboard id),
                                      :user-id      user-id,
                                      :is-creation? (= :dashboard-create topic)
                                      :message      revision-message)
          "metric"    (push-revision! :entity       Metric,
                                      :id           id,
                                      :object       (Metric id),
                                      :user-id      user-id,
                                      :is-creation? (= :metric-create topic)
                                      :message      revision-message)
          "segment"   (push-revision! :entity       Segment,
                                      :id           id,
                                      :object       (Segment id),
                                      :user-id      user-id,
                                      :is-creation? (= :segment-create topic)
                                      :message      revision-message))))
    (catch Throwable e
      (log/warn (format "Failed to process revision event. %s" (:topic revision-event)) e))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------

(defmethod events/init! ::Revisions
  [_]
  (events/start-event-listener! revisions-topics revisions-channel process-revision-event!))
