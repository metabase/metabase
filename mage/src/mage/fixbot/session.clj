(ns mage.fixbot.session
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers

(defn- workmux-list
  "Run `workmux list` and return the raw output lines."
  []
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "list")]
    (if (zero? exit)
      (vec (remove str/blank? out))
      [])))

(defn- find-session
  "Find a workmux session matching the given name or issue ID (case-insensitive substring match).
   Returns the session name or nil."
  [name-or-id]
  (let [needle  (str/lower-case (str/trim name-or-id))
        sessions (workmux-list)]
    (first (filter #(str/includes? (str/lower-case %) needle) sessions))))

(defn- print-available-sessions!
  "Print the list of available workmux sessions."
  []
  (let [sessions (workmux-list)]
    (if (seq sessions)
      (do
        (println (c/yellow "Available sessions:"))
        (doseq [s sessions]
          (println (str "  " s))))
      (println (c/yellow "No active sessions.")))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Commands

(defn pause!
  "Pause a fixbot session: stop containers, close tmux window, keep worktree."
  [{:keys [arguments]}]
  (let [name-or-id (first arguments)]
    (when (str/blank? name-or-id)
      (println (c/red "Usage: ./bin/mage -fixbot-pause <name-or-issue-id>"))
      (u/exit 1))
    (let [session (find-session name-or-id)]
      (when-not session
        (println (c/red "No session found matching: ") name-or-id)
        (print-available-sessions!)
        (u/exit 1))
      ;; Get worktree path and tear down dev env
      (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "path" session)
            worktree-path      (when (zero? exit) (str/trim (str/join "" out)))]
        (when (and worktree-path (seq worktree-path))
          (println (c/yellow "Stopping dev environment in " worktree-path "..."))
          (let [{:keys [exit]} (shell/sh* {:dir worktree-path} "./bin/mage" "-fixbot-dev-env" "--down")]
            (when-not (zero? exit)
              (println (c/yellow "Warning: dev-env teardown returned non-zero exit code"))))))
      ;; Close tmux window (keeps worktree)
      (println (c/yellow "Closing tmux window for " session "..."))
      (shell/sh* {:quiet? true} "workmux" "close" session)
      (println)
      (println (c/bold (c/green "Session paused: ") (c/cyan session)))
      (println (c/yellow "Resume with: ") (str "./bin/mage -fixbot-resume " session)))))

(defn resume!
  "Resume a paused fixbot session."
  [{:keys [arguments]}]
  (let [name-or-id (first arguments)]
    (when (str/blank? name-or-id)
      (println (c/red "Usage: ./bin/mage -fixbot-resume <name-or-issue-id>"))
      (u/exit 1))
    (let [;; Parse argument: PR URL → branch, issue ID, or branch name
          arg       (str/trim name-or-id)
          pr-match  (re-find #"https://github\.com/.*/pull/(\d+)" arg)
          lookup    (if pr-match
                      ;; Extract branch from PR
                      (let [pr-num (second pr-match)
                            branch (str/trim (str/join "" (:out (shell/sh* {:quiet? true}
                                                                           "gh" "pr" "view" pr-num
                                                                           "--json" "headRefName"
                                                                           "--jq" ".headRefName"))))]
                        (if (str/blank? branch)
                          (do (println (c/red "Could not determine branch for PR #" pr-num))
                              (u/exit 1))
                          branch))
                      arg)
          session   (find-session lookup)]
      (if session
        (do
          (println (c/yellow "Resuming session: " session "..."))
          (shell/sh "workmux" "open" session "--run-hooks")
          (println)
          (println (c/bold (c/green "Session resumed: ") (c/cyan session))))
        (do
          (println (c/red "No paused session found matching: ") lookup)
          (print-available-sessions!)
          (println)
          (println (c/yellow "To create a new session, use /fixbot with the issue ID."))
          (u/exit 1))))))

(defn list-sessions!
  "List all fixbot sessions with status."
  [_parsed]
  (println (c/bold (c/green "Fixbot Sessions")))
  (println)
  ;; Show workmux list with PR info
  (let [{:keys [exit out]} (shell/sh* "workmux" "list" "--pr")]
    (when (zero? exit)
      (doseq [line out]
        (println line))))
  (println)
  ;; Show git status info
  (let [{:keys [exit out]} (shell/sh* "workmux" "status" "--git")]
    (when (zero? exit)
      (doseq [line out]
        (println line)))))

(defn dashboard!
  "Open the workmux TUI dashboard."
  []
  (let [pb (ProcessBuilder. ^java.util.List ["workmux" "dashboard"])]
    (.inheritIO pb)
    (.directory pb (java.io.File. ^String u/project-root-directory))
    (let [proc (.start pb)]
      (.waitFor proc)
      (System/exit (.exitValue proc)))))
