(ns mage.uxbot.session
  (:require
   [mage.bot.session :as bot]))

(set! *warn-on-reflection* true)

(def ^:private prefix "uxbot")

(defn list-sessions!
  "List all uxbot sessions with status."
  [_parsed]
  (bot/list-sessions! prefix "UXBot"))

(defn stop!
  "Stop a uxbot session (kill tmux + dev env, keep worktree)."
  [{:keys [arguments]}]
  (bot/stop-session! prefix (first arguments)))

(defn quit!
  "Tear down and remove a uxbot worktree session."
  [{:keys [arguments]}]
  (bot/quit-session! prefix (first arguments)))
