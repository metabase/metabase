(ns mage.bot.session
  "Shared workmux session management for fixbot, uxbot, and other bot types."
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers

(defn workmux-list-raw
  "Run `workmux list` and return the raw output lines."
  []
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "list")]
    (if (zero? exit)
      (vec (remove str/blank? out))
      [])))

(defn parse-worktree-name
  "Extract the worktree name from a workmux list output line."
  [line]
  (let [trimmed (str/trim line)]
    (when-let [path (last (re-find #"(\S+)\s*$" trimmed))]
      (cond
        (= path "(here)") nil
        (str/includes? path "__worktrees/")
        (second (str/split path #"__worktrees/" 2))
        :else (last (str/split path #"/"))))))

(defn find-session
  "Find a workmux session matching the given name or ID (case-insensitive substring match).
   Returns the worktree name (suitable for workmux commands) or nil."
  [name-or-id]
  (let [needle (str/lower-case (str/trim name-or-id))
        lines  (workmux-list-raw)
        data   (rest lines)]
    (->> data
         (keep (fn [line]
                 (when (str/includes? (str/lower-case line) needle)
                   (parse-worktree-name line))))
         first)))

(defn print-available-sessions!
  "Print the list of available workmux sessions."
  []
  (let [sessions (workmux-list-raw)]
    (if (seq sessions)
      (do
        (println (c/yellow "Available sessions:"))
        (doseq [s sessions]
          (println (str "  " s))))
      (println (c/yellow "No active sessions.")))))

(defn all-sessions-with-prefix
  "Return a list of all worktree names matching the given prefix."
  [prefix]
  (let [lines (workmux-list-raw)
        data  (rest lines)]
    (->> data
         (keep parse-worktree-name)
         (filter #(str/starts-with? % (str prefix "-")))
         vec)))

(defn worktree-path
  "Get the filesystem path for a workmux session."
  [session]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "path" session)]
    (when (zero? exit)
      (str/trim (str/join "" out)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Generic session operations

(defn tmux-session-running?
  "Check if a tmux session with the given name is currently running."
  [session-name]
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "tmux" "has-session" "-t" session-name)]
    (zero? exit)))

(defn stop-session!
  "Stop a session's tmux session and dev environment, but keep the worktree.
   `bot-prefix` is used for usage messages."
  [bot-prefix name-or-id]
  (when (str/blank? name-or-id)
    (println (c/red (str "Usage: ./bin/mage -" bot-prefix "-stop <name-or-id>")))
    (u/exit 1))
  (let [session (find-session name-or-id)]
    (when-not session
      (println (c/red "No session found matching: ") name-or-id)
      (print-available-sessions!)
      (u/exit 1))
    ;; Stop dev environment
    (let [wt-path (worktree-path session)]
      (when (and wt-path (seq wt-path))
        (println (c/yellow "Stopping dev environment in " wt-path "..."))
        (shell/sh* {:dir wt-path} "./bin/mage" "-bot-dev-env" "--down")))
    ;; Kill tmux session
    (println (c/yellow "Stopping tmux session: " session "..."))
    (shell/sh* {:quiet? true} "tmux" "kill-session" "-t" session)
    (println)
    (println (c/bold (c/green "Session stopped: ") (c/cyan session)))
    (println (c/yellow "Worktree preserved. Run /uxbot again to restart."))))

(defn quit-session!
  "Tear down and remove a workmux session by name or ID match.
   `bot-prefix` is used for usage messages (e.g., \"fixbot\", \"uxbot\")."
  [bot-prefix name-or-id]
  (when (str/blank? name-or-id)
    (println (c/red (str "Usage: ./bin/mage -" bot-prefix "-quit <name-or-id>")))
    (u/exit 1))
  (let [session (find-session name-or-id)]
    (when-not session
      (println (c/red "No session found matching: ") name-or-id)
      (print-available-sessions!)
      (u/exit 1))
    (println (c/yellow "Removing worktree: " session "..."))
    (shell/sh "workmux" "remove" "-f" session)
    (shell/sh* {:quiet? true} "tmux" "kill-session" "-t" session)
    (println)
    (println (c/bold (c/green "Session removed: ") (c/cyan session)))))

(defn list-sessions!
  "List all sessions matching the given prefix with status."
  [bot-prefix label]
  (println (c/bold (c/green (str label " Sessions"))))
  (println)
  (let [sessions    (all-sessions-with-prefix bot-prefix)
        filter-args (into [bot-prefix] sessions)]
    (let [{:keys [exit out]} (apply shell/sh* {:quiet? true} "workmux" "list" "--pr" filter-args)]
      (when (zero? exit)
        (doseq [line out]
          (println line))))
    (println)
    (let [{:keys [exit out]} (apply shell/sh* {:quiet? true} "workmux" "status" "--git" filter-args)]
      (when (zero? exit)
        (doseq [line out]
          (println line))))))

(defn pause-one!
  "Pause a single session by worktree name."
  [bot-prefix session]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "path" session)
        wt-path            (when (zero? exit) (str/trim (str/join "" out)))]
    (when (and wt-path (seq wt-path))
      (println (c/yellow "Stopping dev environment in " wt-path "..."))
      (let [{:keys [exit]} (shell/sh* {:dir wt-path} "./bin/mage" "-bot-dev-env" "--down")]
        (when-not (zero? exit)
          (println (c/yellow "Warning: dev-env teardown returned non-zero exit code"))))))
  (println (c/yellow "Closing tmux window for " session "..."))
  (shell/sh* {:quiet? true} "workmux" "close" session)
  (println)
  (println (c/bold (c/green "Session paused: ") (c/cyan session)))
  (println (c/yellow "Resume with: ") (str "./bin/mage -" bot-prefix "-resume " session)))

(defn pause-sessions!
  "Pause one or all sessions matching the given prefix."
  [bot-prefix name-or-id]
  (when (str/blank? name-or-id)
    (println (c/red (str "Usage: ./bin/mage -" bot-prefix "-pause <name-or-id|all>")))
    (u/exit 1))
  (if (= "all" (str/lower-case (str/trim name-or-id)))
    (let [sessions (all-sessions-with-prefix bot-prefix)]
      (if (empty? sessions)
        (println (c/yellow (str "No active " bot-prefix " sessions to pause.")))
        (doseq [session sessions]
          (pause-one! bot-prefix session))))
    (let [session (find-session name-or-id)]
      (when-not session
        (println (c/red "No session found matching: ") name-or-id)
        (print-available-sessions!)
        (u/exit 1))
      (pause-one! bot-prefix session))))
