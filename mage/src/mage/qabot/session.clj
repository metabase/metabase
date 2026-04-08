(ns mage.qabot.session
  "QABot session management — delegates to shared mage.bot.session."
  (:require
   [mage.bot.session :as bot]))

(set! *warn-on-reflection* true)

(defn list-sessions!
  "List all qabot sessions."
  [_parsed]
  (bot/list-sessions! "qabot" "QABot"))

(defn stop!
  "Stop a qabot session (kill tmux + dev env, keep worktree)."
  [{:keys [arguments]}]
  (bot/stop-session! "qabot" (first arguments)))

(defn quit!
  "Tear down and remove a qabot worktree session."
  [{:keys [arguments]}]
  (bot/quit-session! "qabot" (first arguments)))
