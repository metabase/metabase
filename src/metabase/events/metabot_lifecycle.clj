(ns metabase.events.metabot-lifecycle
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase
             [events :as events]
             [metabot :as metabot]]))

(def ^:const ^:private metabot-lifecycle-topics
  "The `Set` of event topics which are subscribed to for use in metabot lifecycle."
  #{:settings-update})

(def ^:private metabot-lifecycle-channel
  "Channel for receiving event notifications we want to subscribe to for metabot lifecycle events."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn process-metabot-lifecycle-event
  "Handle processing for a single event notification received on the metabot-lifecycle-channel"
  [metabot-lifecycle-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (when-let [{topic :topic object :item} metabot-lifecycle-event]
    (try
      ;; if someone updated our slack-token, or metabot was enabled/disabled then react accordingly
      (when (and (contains? object :metabot-enabled) (contains? object :slack-token))
        (let [{:keys [slack-token metabot-enabled]} object]
          (cond
            (nil? slack-token)    (metabot/stop-metabot!)
            (not metabot-enabled) (metabot/stop-metabot!)
            :else                 (metabot/restart-metabot!))))
      (catch Throwable e
        (log/warn (format "Failed to process driver notifications event. %s" topic) e)))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


(defn events-init
  "Automatically called during startup; start event listener for metabot lifecycle events."
  []
  (events/start-event-listener! metabot-lifecycle-topics metabot-lifecycle-channel process-metabot-lifecycle-event))
