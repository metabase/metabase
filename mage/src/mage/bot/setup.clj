(ns mage.bot.setup
  "Consolidated bot worktree setup. Called by workmux post_create (fresh launch)
   and relaunch. Idempotent — safe to run multiple times.

   Only generates/copies git-ignored files. All tracked files (mage source,
   bb.edn, dev/bot/*, .claude/commands/*) are handled by bot.patch applied
   during worktree creation."
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private bot-dirs
  "Bot-specific directories to create in the worktree."
  {"fixbot" [".fixbot/playwright/sessions" ".fixbot/playwright/sockets"]
   "qabot"  [".qabot"]
   "uxbot"  [".uxbot/screenshots"]})

(def ^:private playwright-mcp-version "0.0.68")

(def ^:private mcp-json-content
  (str "{\"mcpServers\":{\"playwright\":{\"command\":\"npx\","
       "\"args\":[\"-y\",\"@playwright/mcp@" playwright-mcp-version "\","
       "\"--headless\",\"--browser\",\"chrome\","
       "\"--viewport-size\",\"1440x900\","
       "\"--snapshot-mode\",\"full\","
       "\"--block-service-workers\",\"--isolated\","
       "\"--timeout-action\",\"10000\"]}}}"))

(def ^:private hooks-json-content
  (str "{\"version\":1,\"hooks\":{"
       "\"userPromptSubmitted\":[{\"type\":\"command\",\"bash\":\"workmux set-window-status working\"}],"
       "\"postToolUse\":[{\"type\":\"command\",\"bash\":\"workmux set-window-status working\"}],"
       "\"agentStop\":[{\"type\":\"command\",\"bash\":\"workmux set-window-status done\"}]}}"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Setup steps (git-ignored outputs only)

(defn- generate-settings!
  "Generate .claude/settings.local.json from the bot's template, substituting paths."
  [bot-name wt-path]
  (let [template-path (str wt-path "/dev/bot/" bot-name "/settings.local-template.json")
        output-path   (str wt-path "/.claude/settings.local.json")]
    (when (fs/exists? template-path)
      (println (c/yellow "Generating settings.local.json..."))
      (let [tmpdir (str/replace (or (System/getenv "TMPDIR") "/tmp") #"/$" "")
            content (-> (slurp template-path)
                        (str/replace "{{pwd}}" wt-path)
                        (str/replace "{{tmpdir}}" tmpdir))]
        (spit output-path content)
        (println (c/green "  Wrote " output-path))))))

(defn- create-bot-dirs!
  "Create bot-specific directories and initial status file."
  [bot-name wt-path]
  (doseq [dir (get bot-dirs bot-name)]
    (fs/create-dirs (str wt-path "/" dir)))
  (let [status-path (str wt-path "/." bot-name "/llm-status.txt")]
    (spit status-path "Starting up")
    (println (c/green "  Created bot directories and status file"))))

(defn- deploy-commands!
  "Copy bot commands from dev/bot/<bot>/commands/ into .claude/commands/."
  [bot-name wt-path]
  (let [commands-dir (str wt-path "/.claude/commands")
        bot-commands (str wt-path "/dev/bot/" bot-name "/commands")]
    (when (fs/exists? bot-commands)
      ;; Remove old bot commands
      (doseq [f (fs/glob commands-dir (str bot-name "*.md"))]
        (fs/delete f))
      ;; Copy fresh ones
      (doseq [f (fs/glob bot-commands "*.md")]
        (fs/copy f (str commands-dir "/" (fs/file-name f)) {:replace-existing true}))
      (println (c/green "  Deployed bot commands")))))

(defn- write-hooks!
  "Write workmux-status hooks.json for Claude Code status reporting."
  [wt-path]
  (let [hooks-dir (str wt-path "/.github/hooks/workmux-status")]
    (fs/create-dirs hooks-dir)
    (spit (str hooks-dir "/hooks.json") hooks-json-content)
    (println (c/green "  Wrote workmux-status hooks"))))

(defn- run-dev-env!
  "Run bot dev-env setup (Docker DB, mise.local.toml, metabase.config.yml)."
  [bot-name wt-path app-db]
  (println (c/yellow "Setting up dev environment..."))
  (shell/sh {:dir wt-path} "./bin/mage" "-bot-dev-env" "--app-db" app-db "--bot" bot-name))

(defn- trust-mise!
  "Trust mise.local.toml in the worktree."
  [wt-path]
  (shell/sh {:dir wt-path} "mise" "trust" "mise.local.toml")
  (println (c/green "  Trusted mise.local.toml")))

(defn- install-deps!
  "Run bun install in the worktree."
  [wt-path]
  (println (c/yellow "Installing dependencies..."))
  (shell/sh {:dir wt-path} "bun" "install")
  (println (c/green "  bun install complete")))

(defn- cache-playwright!
  "Ensure Playwright MCP is cached."
  [wt-path]
  (println (c/yellow "Caching Playwright MCP..."))
  (shell/sh {:dir wt-path} "npx" "-y" (str "@playwright/mcp@" playwright-mcp-version) "--version")
  (println (c/green "  Playwright MCP cached")))

(defn- write-mcp-json!
  "Write .mcp.json with Playwright MCP config."
  [wt-path]
  (spit (str wt-path "/.mcp.json") mcp-json-content)
  (println (c/green "  Wrote .mcp.json")))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Public API

(defn setup-bot-worktree!
  "One-stop bot worktree setup. Idempotent — safe for fresh and relaunch.
   Only generates git-ignored files; tracked files come from bot.patch.
   Options:
     :bot-name — \"fixbot\", \"qabot\", or \"uxbot\"
     :wt-path  — path to the worktree being set up
     :app-db   — database type (\"postgres\", \"mysql\", etc.)"
  [{:keys [bot-name wt-path app-db]}]
  (println)
  (println (c/bold (c/green "Setting up " bot-name " worktree: ") (c/cyan wt-path)))
  (println)
  (generate-settings! bot-name wt-path)
  (create-bot-dirs! bot-name wt-path)
  (deploy-commands! bot-name wt-path)
  (write-hooks! wt-path)
  (run-dev-env! bot-name wt-path (or app-db "postgres"))
  (trust-mise! wt-path)
  (install-deps! wt-path)
  (cache-playwright! wt-path)
  (write-mcp-json! wt-path)
  (println)
  (println (c/bold (c/green "Bot worktree setup complete."))))

(defn setup!
  "CLI entry point for -bot-setup command."
  [{:keys [options]}]
  (let [{:keys [bot app-db]} options
        wt-path u/project-root-directory]
    (when (str/blank? bot)
      (println (c/red "Usage: ./bin/mage -bot-setup --bot <name> [--app-db postgres]"))
      (u/exit 1))
    (setup-bot-worktree! {:bot-name bot
                          :wt-path  wt-path
                          :app-db   (or app-db "postgres")})))
