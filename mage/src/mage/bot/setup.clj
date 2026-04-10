(ns mage.bot.setup
  "Bot worktree setup — installs workmux-status hooks and bot-specific
   Claude Code permissions for autobot worktrees."
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private hooks-json-content
  (str "{\"version\":1,\"hooks\":{"
       "\"userPromptSubmitted\":[{\"type\":\"command\",\"bash\":\"workmux set-window-status working\"}],"
       "\"postToolUse\":[{\"type\":\"command\",\"bash\":\"workmux set-window-status working\"}],"
       "\"agentStop\":[{\"type\":\"command\",\"bash\":\"workmux set-window-status done\"}]}}"))

(defn- write-hooks!
  "Write workmux-status hooks.json for Claude Code status reporting."
  [wt-path]
  (let [hooks-dir (str wt-path "/.github/hooks/workmux-status")]
    (fs/create-dirs hooks-dir)
    (spit (str hooks-dir "/hooks.json") hooks-json-content)
    (println (c/green "  Wrote workmux-status hooks"))))

(defn- install-bot-settings!
  "Copy the bot settings.local.json template into the worktree's .claude/ directory.
   This provides sandboxed, pre-approved permissions for bot agents running in autobot."
  [wt-path]
  (let [template (str u/project-root-directory "/dev/bot/bot.settings.local.json")
        target   (str wt-path "/.claude/settings.local.json")]
    (if (fs/exists? template)
      (do
        (fs/create-dirs (str wt-path "/.claude"))
        (fs/copy template target {:replace-existing true})
        (println (c/green "  Installed bot settings.local.json")))
      (println (c/yellow "  Bot settings template not found: " template)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Public API

(defn setup-bot-worktree!
  "Install workmux-status hooks and bot-specific Claude Code permissions
   in the worktree."
  [{:keys [wt-path]}]
  (write-hooks! wt-path)
  (install-bot-settings! wt-path))

(defn setup!
  "CLI entry point for -bot-setup command."
  [{:keys [options]}]
  (let [{:keys [bot]} options
        wt-path u/project-root-directory]
    (when (str/blank? bot)
      (println (c/red "Usage: ./bin/mage -bot-setup --bot <name>"))
      (u/exit 1))
    (setup-bot-worktree! {:wt-path wt-path})))
