(ns mage.bot.fixbot-preflight
  "Fixbot-specific preflight checks and utilities."
  (:require
   [mage.bot.preflight :as bp]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn preflight!
  "Check all prerequisites for the fixbot workflow. Exits with an error if any fail."
  [& _]
  (bp/check-workmux!)
  (bp/check-nrepl!)
  (bp/check-docker!)
  (bp/check-tmux-status!)
  (bp/check-linear-api-key! :required)
  (bp/check-ee-token!)
  (bp/check-playwright!)
  (bp/check-node-modules!)
  (println (c/green "All preflight checks passed.")))

(defn write-sandbox-settings!
  "Copy the bot settings.local.json template into the current worktree's .claude/ directory."
  [_parsed]
  (let [source (str u/project-root-directory "/dev/bot/bot.settings.local.json")
        target ".claude/settings.local.json"]
    (if (.exists (java.io.File. ^String source))
      (do
        (spit target (slurp source))
        (println (c/green "Wrote ") target))
      (do
        (println (c/red "Source not found: ") source)
        (u/exit 1)))))
