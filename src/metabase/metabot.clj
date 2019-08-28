(ns metabase.metabot
  (:require [clojure.tools.logging :as log]
            [metabase.integrations.slack :as slack]
            [metabase.metabot
             [instance :as metabot.instance]
             [websocket :as metabot.websocket]]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util.i18n :refer [deferred-trs trs]]))

(defsetting metabot-enabled
  (deferred-trs "Enable MetaBot, which lets you search for and view your saved questions directly via Slack.")
  :type    :boolean
  :default false)


;;; ------------------------------------------- Websocket Connection Stuff -------------------------------------------

(defn- seconds-to-wait-before-starting
  "Return a random number of seconds to wait before starting MetaBot processess, between 0 and 59. This is done to
  introduce a bit of jitter that should prevent a rush of multiple instances all racing to become the MetaBot at the
  same time."
  []
  (mod (.nextInt (java.security.SecureRandom.)) 60))

(defn start-metabot!
  "Start the MetaBot! :robot_face:

  This will spin up a background thread that opens and maintains a Slack WebSocket connection."
  []
  (future
    (Thread/sleep (* 1000 (seconds-to-wait-before-starting)))
    (when (and (slack/slack-token)
               (metabot-enabled))
      (log/info (trs "Starting MetaBot threads..."))
      (metabot.websocket/start-websocket-monitor!)
      (metabot.instance/start-instance-monitor!))))

(defn stop-metabot!
  "Stop the MetaBot! :robot_face:

  This will stop the background thread that responsible for the Slack WebSocket connection."
  []
  (log/info (trs "Stopping MetaBot...  🤖"))
  (metabot.websocket/stop!))

(defn restart-metabot!
  "Restart the MetaBot listening process.
   Used on settings changed"
  []
  (when (metabot.websocket/currently-running?)
    (log/info (trs "MetaBot already running. Killing the previous WebSocket listener first."))
    (stop-metabot!))
  (start-metabot!))
