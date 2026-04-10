(ns mage.cibot.session
  (:require
   [mage.bot.session :as bot]))

(set! *warn-on-reflection* true)

(def ^:private prefix "cibot")

(defn list-sessions!
  "List all cibot sessions with status."
  [_parsed]
  (bot/list-sessions! prefix "CIBot"))

(defn stop!
  "Stop a cibot session (kill tmux + dev env, keep worktree)."
  [{:keys [arguments]}]
  (bot/stop-session! prefix (first arguments)))

(defn quit!
  "Tear down and remove a cibot worktree session."
  [{:keys [arguments]}]
  (bot/quit-session! prefix (first arguments)))
