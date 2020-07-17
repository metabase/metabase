(ns metabase.events.dependencies
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.events :as events]
            [metabase.models
             [card :refer [Card]]
             [dependency :as dependency :refer [IDependent]]
             [metric :refer [Metric]]]))

(def ^:private ^:const dependencies-topics
  "The `Set` of event topics which are subscribed to for use in dependencies tracking."
  #{:card-create
    :card-update
    :metric-create
    :metric-update})

(defonce ^:private ^{:doc "Channel for receiving event notifications we want to subscribe to for dependencies events."}
  dependencies-channel
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(def ^:private model->entity
  {:card   Card
   :metric Metric})

(defn process-dependencies-event
  "Handle processing for a single event notification received on the dependencies-channel"
  [dependency-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} dependency-event]
      (let [model   (events/topic->model topic)
            entity  (model->entity (keyword model))
            id      (events/object->model-id topic object)]
        ;; entity must support dependency tracking to continue
        (when (satisfies? IDependent entity)
          (when-let [deps (dependency/dependencies entity id object)]
            (dependency/update-dependencies! entity id deps)))))
    (catch Throwable e
      (log/warn (format "Failed to process dependencies event. %s" (:topic dependency-event)) e))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------

(defmethod events/init! ::Dependencies
  [_]
  (events/start-event-listener! dependencies-topics dependencies-channel process-dependencies-event))
