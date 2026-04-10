(ns mage.fixbot.session
  (:require
   [mage.bot.session :as bot]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private prefix "fixbot")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Public API — delegates to shared bot.session

(defn pause!
  "Pause a fixbot session."
  [{:keys [arguments]}]
  (bot/pause-sessions! prefix (first arguments)))

(defn list-sessions!
  "List all fixbot sessions with status."
  [_parsed]
  (bot/list-sessions! prefix "Fixbot"))

(defn quit!
  "Tear down and remove a fixbot worktree session."
  [{:keys [arguments]}]
  (bot/quit-session! prefix (first arguments)))

(defn write-sandbox-settings!
  "Copy the sandbox-specific settings.local.json into the current worktree's .claude/ directory."
  [_parsed]
  (let [source (str u/project-root-directory "/dev/bot/fixbot/sandbox-settings.local.json")
        target ".claude/settings.local.json"]
    (if (.exists (java.io.File. ^String source))
      (do
        (spit target (slurp source))
        (println (c/green "Wrote ") target))
      (do
        (println (c/red "Source not found: ") source)
        (u/exit 1)))))

(defn dashboard!
  "Open the workmux TUI dashboard."
  []
  (let [pb (ProcessBuilder. ^java.util.List ["workmux" "dashboard" "fixbot"])]
    (.inheritIO pb)
    (.directory pb (java.io.File. ^String u/project-root-directory))
    (let [proc (.start pb)]
      (.waitFor proc)
      (System/exit (.exitValue proc)))))
