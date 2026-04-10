(ns mage.reprobot.session
  (:require
   [mage.bot.session :as bot]))

(set! *warn-on-reflection* true)

(def ^:private prefix "reprobot")

(defn list-sessions!
  "List all reprobot sessions with status."
  [_parsed]
  (bot/list-sessions! prefix "ReproBot"))

(defn stop!
  "Stop a reprobot session (kill tmux + dev env, keep worktree)."
  [{:keys [arguments]}]
  (bot/stop-session! prefix (first arguments)))

(defn quit!
  "Tear down and remove a reprobot worktree session."
  [{:keys [arguments]}]
  (bot/quit-session! prefix (first arguments)))
