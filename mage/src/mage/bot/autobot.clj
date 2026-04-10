(ns mage.bot.autobot
  "Unified autobot session management — launch, stop, list, quit.
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
;; Self-detection (for running stop/quit from inside a autobot session)

(defn- detect-current-session
  "Detect the current autobot session name when running inside a autobot worktree.
   Returns the session name or nil if not inside a autobot session."
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
          (println (c/red "No session name provided and not inside a autobot session."))
          (println "Usage: ./bin/mage -autobot-stop <session-name>")
          (println "       (or run from inside a autobot session with no arguments)")
          (u/exit 1)))
    (or (bot/find-session name-or-id)
        (do
          (println (c/red "No session found matching: ") name-or-id)
          (bot/print-available-sessions!)
          (u/exit 1)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Launch

(defn run!
  "Launch a autobot session. Takes --bot, --command, --app-db, and branch name."
  [{:keys [arguments options]}]
  (let [branch-name (first arguments)]
    (when (str/blank? branch-name)
      (println (c/red "Usage: ./bin/mage autobot-go <branch-name> --bot <name> --command <cmd> [--app-db postgres]"))
      (u/exit 1))
    (let [branch-name  (str/trim branch-name)
          bot-name     (:bot options)
          command      (:command options)
          app-db       (or (:app-db options) "postgres")
          base-branch  (or (:base options) "origin/master")
          session-name (bot/branch-to-session-name (or bot-name "autobot") branch-name)
          config       (launch/generate-workmux-config (or bot-name "autobot") app-db)]
      (when (str/blank? bot-name)
        (println (c/red "--bot is required"))
        (u/exit 1))
      (when (str/blank? command)
        (println (c/red "--command is required"))
        (u/exit 1))

      ;; Check for running tmux session
      (when (bot/tmux-session-running? session-name)
        (println (c/red "Session " session-name " is already running!"))
        (println)
        (println "Attach to it with:")
        (println (str "  tmux attach -t " session-name))
        (println)
        (println (str "Stop it first with: /autobot-stop " session-name))
        (u/exit 1))

      ;; Write the prompt to a temp file — passed to workmux -P for the agent's initial prompt
      (let [prompt-file (str "/tmp/.autobot-prompt-" session-name ".md")]
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
              :base-branch    base-branch
              :prompt-file    prompt-file
              :workmux-config config
              :display-info   {"Bot" bot-name "App DB" app-db "Command" command}})))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Session management (unified, bot-agnostic)

(defn stop!
  "Stop a autobot session (kill tmux + dev env, keep worktree).
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
    (println (c/yellow "Worktree preserved. Use /autobot to restart."))))

(defn quit!
  "Tear down and remove a autobot session.
   Works with a session name argument, or detects current session if no args."
  [{:keys [arguments]}]
  (let [session (resolve-session-name (first arguments))]
    (println (c/yellow "Removing worktree: " session "..."))
    (shell/sh* {:quiet? true} "workmux" "remove" "-f" session)
    (shell/sh* {:quiet? true} "tmux" "kill-session" "-t" session)
    (println)
    (println (c/bold (c/green "Session removed: ") (c/cyan session)))))

(defn list-all!
  "List all autobot sessions with status."
  [_parsed]
  (println (c/bold (c/green "Nocode Sessions")))
  (println)
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "list")]
    (when (zero? exit)
      (doseq [line out]
        (println line)))))
