(ns metabase.metabot.websocket
  "Logic for managing the websocket MetaBot uses to monitor and reply to Slack messages, specifically a 'monitor thread'
  that watches the websocket handling thread and disconnects/reconnects it when needed."
  (:require [aleph.http :as aleph]
            [clojure.tools.logging :as log]
            [manifold
             [deferred :as d]
             [stream :as s]]
            [metabase.integrations.slack :as slack]
            [metabase.metabot
             [events :as metabot.events]
             [instance :as metabot.instance]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [throttle.core :as throttle]))

(defonce ^:private websocket (atom nil))

(defn- handle-slack-event [socket start-time event]
  ;; if the websocket has changed, because we've decided to open a new connection for whatever reason, ignore events
  ;; that might come in from old ones.
  (when-not (= socket @websocket)
    (log/debug (trs "Websocket associated with this Slack event is different from the websocket we're currently using."))
    (s/close! socket)
    (throw (Exception.)))

  (metabot.events/handle-slack-event start-time event))

(defn- connect-websocket! []
  (when-let [websocket-url (slack/websocket-url)]
    (let [socket @(aleph/websocket-client websocket-url)]
      (reset! websocket socket)
      (d/catch (s/consume (partial handle-slack-event socket (System/currentTimeMillis))
                          socket)
          (fn [error]
            (log/error (trs "Error launching metabot:") error))))))

(defn- disconnect-websocket! []
  (when-let [socket @websocket]
    (reset! websocket nil)
    (when-not (s/closed? socket)
      (s/close! socket))))

;;; Websocket monitor

;; Keep track of the Thread ID of the current monitor thread. Monitor threads should check this ID
;; and if it is no longer equal to theirs they should die
(defonce ^:private websocket-monitor-thread-id (atom nil))

(defn stop!
  "Stop all MetaBot instances. Clear the current monitor thread ID, which will signal to any existing monitor threads to
  stop running; disconnect the current websocket."
  []
  (reset! websocket-monitor-thread-id nil)
  (disconnect-websocket!))

(defn currently-running?
  "Is the MetaBot running?

  Checks whether there is currently a MetaBot websocket monitor thread running. (The monitor threads make sure the
  WebSocket connections are open; if a monitor thread is open, it's should be maintaining an open WebSocket
  connection.)"
  []
  (boolean @websocket-monitor-thread-id))

;; we'll use a THROTTLER to implement exponential backoff for recconenction attempts, since THROTTLERS are designed
;; with for this sort of thing e.g. after the first failed connection we'll wait 2 seconds, then each that amount
;; increases by the `:delay-exponent` of 1.3. So our reconnection schedule will look something like:
;;
;; number of consecutive failed attempts | seconds before next try (rounded up to nearest multiple of 2 seconds)
;; --------------------------------------+----------------------------------------------------------------------
;;                                    0  |   2
;;                                    1  |   4
;;                                    2  |   4
;;                                    3  |   6
;;                                    4  |   8
;;                                    5  |  14
;;                                    6  |  30
;;
;; we'll throttle this based on values of the `slack-token` setting; that way if someone changes its value they won't
;; have to wait whatever the exponential delay is before the connection is retried
(def ^:private reconnection-attempt-throttler
  (throttle/make-throttler nil :attempts-threshold 1, :initial-delay-ms 2000, :delay-exponent 1.3))

(defn- should-attempt-to-reconnect? ^Boolean []
  (boolean
   (u/ignore-exceptions
     (throttle/check reconnection-attempt-throttler (slack/slack-token))
     true)))

(defn- reopen-websocket-connection-if-needed!
  "Check to see if websocket connection is [still] open, [re-]open it if not."
  []
  ;; Only open the Websocket connection if this instance is the MetaBot
  (when (metabot.instance/am-i-the-metabot?)
    (when (= (.getId (Thread/currentThread)) @websocket-monitor-thread-id)
      (try
        (when (or (not  @websocket)
                  (s/closed? @websocket))
          (log/debug (trs "MetaBot WebSocket is closed. Reconnecting now."))
          (connect-websocket!))
        (catch Throwable e
          (log/error e (trs "Error connecting websocket:")))))))

(defn start-websocket-monitor!
  "Start the WebSocket monitor thread. This thread periodically checks to make sure the WebSocket connection should be
  open, and if it should but is not, attempts to reconnect. If it is open but should not be, closes the current
  connection."
  []
  (future
    (reset! websocket-monitor-thread-id (.getId (Thread/currentThread)))
    (loop []
      ;; Every 2 seconds...
      (while (not (should-attempt-to-reconnect?))
        (Thread/sleep 2000))
      (reopen-websocket-connection-if-needed!)
      (recur))))
