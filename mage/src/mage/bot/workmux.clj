(ns mage.bot.workmux
  "Unified workmux session management — launch, stop, list, quit.
   Replaces per-bot go.clj files with a single entry point."
  (:require
   [clojure.string :as str]
   [mage.bot.launch :as launch]
   [mage.bot.session :as bot]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Self-detection (for running stop/quit from inside workmux)

(defn- detect-current-session
  "Detect the current workmux session name when running inside a workmux worktree.
   Returns the session name or nil if not inside a workmux session."
  []
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "current")]
    (when (zero? exit)
      (let [name (str/trim (str/join "" out))]
        (when (seq name) name)))))

(defn- resolve-session-name
  "Resolve a session name from arguments, or detect current session if no args."
  [name-or-id]
  (if (str/blank? name-or-id)
    (or (detect-current-session)
        (do
          (println (c/red "No session name provided and not inside a workmux session."))
          (println "Usage: ./bin/mage -workmux-stop <session-name>")
          (println "       (or run from inside a workmux session with no arguments)")
          (u/exit 1)))
    (or (bot/find-session name-or-id)
        (do
          (println (c/red "No session found matching: ") name-or-id)
          (bot/print-available-sessions!)
          (u/exit 1)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Launch

(defn run!
  "Launch a workmux session. Takes --bot, --command, --app-db, and branch name."
  [{:keys [arguments options]}]
  (let [branch-name (first arguments)]
    (when (str/blank? branch-name)
      (println (c/red "Usage: ./bin/mage workmux-go <branch-name> --bot <name> --command <cmd> [--app-db postgres]"))
      (u/exit 1))
    (let [branch-name  (str/trim branch-name)
          bot-name     (:bot options)
          command      (:command options)
          app-db       (or (:app-db options) "postgres")
          session-name (bot/branch-to-session-name (or bot-name "workmux") branch-name)
          config       (launch/generate-workmux-config (or bot-name "workmux") app-db)]
      (when (str/blank? bot-name)
        (println (c/red "--bot is required"))
        (u/exit 1))
      (when (str/blank? command)
        (println (c/red "--command is required"))
        (u/exit 1))
      (when (str/includes? branch-name "/")
        (println (c/red "Pass a local branch name, not a remote ref."))
        (u/exit 1))

      ;; Check for running tmux session
      (when (bot/tmux-session-running? session-name)
        (println (c/red "Session " session-name " is already running!"))
        (println)
        (println "Attach to it with:")
        (println (str "  tmux attach -t " session-name))
        (println)
        (println (str "Stop it first with: /workmux-stop " session-name))
        (u/exit 1))

      ;; Write the prompt — just the inner command
      (let [prompt-file (str ".workmux-prompt-" session-name ".md")]
        (spit prompt-file command)

        ;; Check for existing worktree -> relaunch, otherwise fresh launch
        (let [existing (bot/find-session session-name)
              wt-path  (when existing (bot/worktree-path existing))]
          (if (and existing wt-path)
            (do
              (println (c/yellow "Found existing worktree: " existing))
              (launch/relaunch-existing-session!
               {:bot-name       bot-name
                :session-name   session-name
                :wt-path        wt-path
                :prompt-file    prompt-file
                :app-db         app-db
                :workmux-config config}))
            (launch/launch-workmux-session!
             {:session-name   session-name
              :branch-name    branch-name
              :prompt-file    prompt-file
              :workmux-config config
              :base-branch    (or (:base options) (str "origin/" branch-name))
              :display-info   {"Bot" bot-name "App DB" app-db "Command" command}})))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Session management (unified, bot-agnostic)

(defn stop!
  "Stop a workmux session (kill tmux + dev env, keep worktree).
   Works with a session name argument, or detects current session if no args."
  [{:keys [arguments]}]
  (let [session (resolve-session-name (first arguments))
        wt-path (bot/worktree-path session)]
    ;; Stop dev environment
    (when (and wt-path (seq wt-path))
      (println (c/yellow "Stopping dev environment in " wt-path "..."))
      (shell/sh* {:quiet? true :dir wt-path} "./bin/mage" "-bot-dev-env" "--down"))
    ;; Kill tmux session
    (println (c/yellow "Stopping tmux session: " session "..."))
    (shell/sh* {:quiet? true} "tmux" "kill-session" "-t" session)
    (println)
    (println (c/bold (c/green "Session stopped: ") (c/cyan session)))
    (println (c/yellow "Worktree preserved. Use /workmux to restart."))))

(defn quit!
  "Tear down and remove a workmux session.
   Works with a session name argument, or detects current session if no args."
  [{:keys [arguments]}]
  (let [session (resolve-session-name (first arguments))]
    (println (c/yellow "Removing worktree: " session "..."))
    (shell/sh* {:quiet? true} "workmux" "remove" "-f" session)
    (shell/sh* {:quiet? true} "tmux" "kill-session" "-t" session)
    (println)
    (println (c/bold (c/green "Session removed: ") (c/cyan session)))))

(defn list-all!
  "List all workmux sessions with status."
  [_parsed]
  (println (c/bold (c/green "Workmux Sessions")))
  (println)
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "list")]
    (when (zero? exit)
      (doseq [line out]
        (println line)))))
