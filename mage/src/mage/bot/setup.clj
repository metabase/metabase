(ns mage.bot.setup
  "Bot worktree setup — installs workmux-status hooks for autobot worktrees."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private hooks-json-content
  (json/write-str
   {:version 1
    :hooks   {:userPromptSubmitted [{:type "command" :bash "workmux set-window-status working"}]
              :postToolUse         [{:type "command" :bash "workmux set-window-status working"}]
              :agentStop           [{:type "command" :bash "workmux set-window-status done"}]}}))

(defn- write-hooks!
  "Write workmux-status hooks.json for Claude Code status reporting."
  [wt-path]
  (let [hooks-dir (str wt-path "/.github/hooks/workmux-status")]
    (fs/create-dirs hooks-dir)
    (spit (str hooks-dir "/hooks.json") hooks-json-content)
    (println (c/green "  Wrote workmux-status hooks"))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Public API

(defn setup-bot-worktree!
  "Install workmux-status hooks in the worktree. Bot agents rely on
   the user's global Claude Code settings (`~/.claude/settings.json`)
   plus the project `.claude/settings.local.json` that
   `setup-worktree` already copies from the main worktree."
  [{:keys [wt-path]}]
  (write-hooks! wt-path))

(defn setup!
  "CLI entry point for -bot-setup command."
  [{:keys [options]}]
  (let [{:keys [bot]} options
        wt-path u/project-root-directory]
    (when (str/blank? bot)
      (println (c/red "Usage: ./bin/mage -bot-setup --bot <name>"))
      (u/exit 1))
    (setup-bot-worktree! {:wt-path wt-path})))
