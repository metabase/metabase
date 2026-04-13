(ns mage.bot.autobot
  "Unified autobot session management — launch, stop, list, quit."
  (:require
   [clojure.string :as str]
   [mage.bot.setup :as bot-setup]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Session naming and lookup

(defn branch-to-session-name
  "Convert a branch name to a session name (just the branch slug, no bot prefix).
   Replaces slashes and other non-alphanumeric chars with dashes.
   e.g., (branch-to-session-name \"feature/my-branch\") -> \"feature-my-branch\"
         (branch-to-session-name \"stream-fingerprinting\") -> \"stream-fingerprinting\""
  [branch-name]
  (let [slug (-> branch-name
                 (str/lower-case)
                 (str/replace #"[^a-z0-9-]" "-")
                 (str/replace #"-+" "-")
                 (str/replace #"^-|-$" ""))]
    (subs slug 0 (min (count slug) 40))))

(defn- workmux-list-raw
  "Run `workmux list` and return the raw output lines."
  []
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "list")]
    (if (zero? exit)
      (vec (remove str/blank? out))
      [])))

(defn- parse-worktree-name
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
  "Find a session matching the given name or ID (case-insensitive substring match).
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

(defn- print-available-sessions!
  "Print the list of available sessions."
  []
  (let [sessions (workmux-list-raw)]
    (if (seq sessions)
      (do
        (println (c/yellow "Available sessions:"))
        (doseq [s sessions]
          (println (str "  " s))))
      (println (c/yellow "No active sessions.")))))

(defn worktree-path
  "Get the filesystem path for a session."
  [session]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "path" session)]
    (when (zero? exit)
      (str/trim (str/join "" out)))))

(defn tmux-session-running?
  "Check if a tmux session with the given name is currently running."
  [session-name]
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "tmux" "has-session" "-t" session-name)]
    (zero? exit)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Self-detection (for running stop/quit from inside a session)

(defn- detect-current-session
  "Detect the current session name when running inside a worktree.
   Returns the session name or nil if not inside a session."
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
          (println (c/red "No session name provided and not inside a session."))
          (println "Usage: ./bin/mage -autobot-stop <session-name>")
          (println "       (or run from inside a session with no arguments)")
          (u/exit 1)))
    (or (find-session name-or-id)
        (do
          (println (c/red "No session found matching: ") name-or-id)
          (print-available-sessions!)
          (u/exit 1)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Workmux config generation

(defn- generate-workmux-config
  "Generate the .workmux.yaml content from the common template for a given bot."
  [bot-name app-db]
  (-> (slurp (str u/project-root-directory "/dev/bot/workmux-template.yaml"))
      (str/replace "{{BOT_NAME}}" bot-name)
      (str/replace "{{APP_DB}}" app-db)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fresh launch (workmux add — creates new worktree)

(defn- launch-workmux-session!
  "Launch a new workmux session (creates worktree from branch).
   branch-ref is what workmux add receives as its positional arg — either the
   existing branch name, or origin/<name> to check out a remote branch."
  [{:keys [session-name branch-name branch-ref base-branch prompt-file workmux-config display-info]}]
  (let [workmux-path (str u/project-root-directory "/.workmux.yaml")
        backup-path  (str workmux-path ".bak")
        had-backup?  (.exists (java.io.File. workmux-path))
        in-tmux?     (not (str/blank? (u/env "TMUX" (constantly nil))))]

    ;; Back up existing .workmux.yaml if it exists
    (when had-backup?
      (println (c/yellow "Backing up existing .workmux.yaml..."))
      (.renameTo (java.io.File. workmux-path) (java.io.File. backup-path)))

    ;; Write our workmux config
    (println (c/yellow "Writing .workmux.yaml..."))
    (spit workmux-path workmux-config)

    (try
      ;; Fetch latest refs
      (println (c/yellow "Fetching latest from remote..."))
      (shell/sh "git" "fetch")

      ;; Launch workmux
      (println)
      (println (c/bold (c/green "Launching workmux session: ") (c/cyan session-name)))
      (println (c/yellow "Branch: ") branch-name)
      (doseq [[label value] display-info]
        (println (c/yellow (str label ": ")) value))
      (println (c/yellow "Prompt: ") prompt-file)
      (println)

      ;; branch-ref is either the local branch name or origin/<name> — workmux
      ;; add will check it out either way. No --base needed since the branch
      ;; already exists (autobot refuses to create new branches).
      (let [ref         (or branch-ref branch-name)
            workmux-cmd (str "workmux add " ref
                             " --name " session-name
                             " -P " prompt-file)]
        (if in-tmux?
          ;; Already inside tmux — run workmux directly
          (shell/sh "workmux" "add" ref
                    "--name" session-name
                    "-P" prompt-file)
          ;; Not inside tmux — create a detached session
          (do
            (println (c/yellow "Not inside tmux. Creating detached tmux session..."))
            (shell/sh "nohup" "bash" "-c"
                      (str "tmux new-session -d -s " session-name
                           " && tmux send-keys -t " session-name
                           " '" workmux-cmd "' Enter"))
            (println)
            (println (c/bold (c/green "Tmux session created: ") (c/cyan session-name)))
            (println)
            (println "Attach to it with:")
            (println (str "  tmux attach -t " session-name)))))

      (finally
        ;; When not in tmux, workmux add was launched async via send-keys;
        ;; give it time to read .workmux.yaml before we restore/remove it
        (when-not in-tmux?
          (Thread/sleep 3000))
        ;; Restore .workmux.yaml
        (if had-backup?
          (do
            (println (c/yellow "Restoring .workmux.yaml from backup..."))
            (.renameTo (java.io.File. backup-path) (java.io.File. workmux-path)))
          (do
            (println (c/yellow "Removing .workmux.yaml..."))
            (.delete (java.io.File. workmux-path))))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Relaunch (workmux open — reuses existing worktree)

(defn- relaunch-existing-session!
  "Relaunch a session in an existing worktree.
   Installs hooks, then launches tmux."
  [{:keys [bot-name session-name wt-path prompt-file workmux-config]}]
  (let [in-tmux? (not (str/blank? (u/env "TMUX" (constantly nil))))]
    ;; Install hooks
    (bot-setup/setup-bot-worktree! {:wt-path wt-path})

    ;; Copy prompt file into worktree as prompt.md
    (let [prompt-src  (if (.isAbsolute (java.io.File. ^String prompt-file))
                        prompt-file
                        (str u/project-root-directory "/" prompt-file))
          prompt-dest (str wt-path "/prompt.md")]
      (spit prompt-dest (slurp prompt-src))
      (println (c/yellow "Copied prompt to " prompt-dest)))

    ;; Write .workmux.yaml for open (just panes section)
    (let [panes-idx     (str/index-of workmux-config "\npanes:")
          panes-section (when panes-idx (subs workmux-config panes-idx))]
      (spit (str wt-path "/.workmux.yaml")
            (str "agent: claude\n"
                 panes-section)))

    (println)
    (println (c/bold (c/green "Relaunching session: ") (c/cyan session-name)))
    (println)

    (if in-tmux?
      (shell/sh {:dir wt-path} "workmux" "open" session-name "--run-hooks"
                "-P" "prompt.md")
      (do
        (println (c/yellow "Not inside tmux. Creating detached tmux session..."))
        (shell/sh* {:quiet? true} "tmux" "kill-session" "-t" session-name)
        (shell/sh "nohup" "bash" "-c"
                  (str "cd " wt-path
                       " && tmux new-session -d -s " session-name
                       " && tmux send-keys -t " session-name
                       " 'workmux open " session-name " --run-hooks"
                       " -P prompt.md' Enter"))
        (println)
        (println (c/bold (c/green "Tmux session created: ") (c/cyan session-name)))
        (println)
        (println "Attach to it with:")
        (println (str "  tmux attach -t " session-name))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Branch validation

(defn- local-branch-exists?
  "Check if a local git branch with the given name exists."
  [branch-name]
  (let [{:keys [exit]} (shell/sh* {:quiet? true}
                                  "git" "show-ref" "--verify" "--quiet"
                                  (str "refs/heads/" branch-name))]
    (zero? exit)))

(defn- remote-branch-exists?
  "Check if a remote git branch origin/<branch-name> exists."
  [branch-name]
  (let [{:keys [exit]} (shell/sh* {:quiet? true}
                                  "git" "show-ref" "--verify" "--quiet"
                                  (str "refs/remotes/origin/" branch-name))]
    (zero? exit)))

(defn- resolve-branch-ref!
  "Fetch from origin and verify the branch exists locally or on origin.
   Returns the ref to pass to workmux add (the branch name if local, or origin/<branch> if remote only).
   Exits with error if neither exists — never creates a new branch."
  [branch-name]
  (println (c/yellow "Checking that branch exists: ") branch-name)
  (shell/sh* {:quiet? true} "git" "fetch" "origin" branch-name)
  (cond
    (local-branch-exists? branch-name)
    (do
      (println (c/green "  Found local branch: ") branch-name)
      branch-name)

    (remote-branch-exists? branch-name)
    (let [remote-ref (str "origin/" branch-name)]
      (println (c/green "  Found remote branch: ") remote-ref)
      remote-ref)

    :else
    (do
      (println (c/red "Branch not found: ") branch-name)
      (println (c/red "  No local branch and no origin/" branch-name " exists."))
      (println (c/red "  autobot will NOT create new branches — create the branch first."))
      (u/exit 1))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Launch entry point

(defn go!
  "Launch a session. Takes --bot, --command, --base, and branch name."
  [{:keys [arguments options]}]
  (let [branch-name (first arguments)]
    (when (str/blank? branch-name)
      (println (c/red "Usage: ./bin/mage -autobot-go <branch-name> --bot <name> --command <cmd>"))
      (u/exit 1))
    (let [branch-name  (str/trim branch-name)
          bot-name     (:bot options)
          command      (:command options)
          app-db       (or (:app-db options) "postgres")
          base-branch  (or (:base options) "origin/master")
          session-name (branch-to-session-name branch-name)
          config       (generate-workmux-config (or bot-name "autobot") app-db)]
      (when (str/blank? bot-name)
        (println (c/red "--bot is required"))
        (u/exit 1))
      (when (str/blank? command)
        (println (c/red "--command is required"))
        (u/exit 1))

      ;; Check for running tmux session
      (when (tmux-session-running? session-name)
        (println (c/red "Session " session-name " is already running!"))
        (println)
        (println "Attach to it with:")
        (println (str "  tmux attach -t " session-name))
        (println)
        (println (str "Stop it first with: /autobot-stop " session-name))
        (u/exit 1))

      ;; Write the prompt to a temp file — passed to workmux -P for the agent's initial prompt
      (let [prompt-file (str (System/getProperty "java.io.tmpdir") "/.autobot-prompt-" session-name ".md")]
        (spit prompt-file command)

        ;; Check for existing worktree -> relaunch, otherwise fresh launch
        (let [existing (find-session session-name)
              wt-path  (when existing (worktree-path existing))]
          (if (and existing wt-path)
            (do
              (println (c/yellow "Found existing worktree: " existing))
              (relaunch-existing-session!
               {:bot-name       bot-name
                :session-name   session-name
                :wt-path        wt-path
                :prompt-file    prompt-file
                :workmux-config config}))
            (do
              ;; Fresh launch: verify the branch exists somewhere before creating a worktree.
              ;; Returns the ref to pass to workmux (branch name if local, origin/<name> if remote-only).
              (let [branch-ref (resolve-branch-ref! branch-name)]
                (launch-workmux-session!
                 {:session-name   session-name
                  :branch-name    branch-name
                  :branch-ref     branch-ref
                  :base-branch    base-branch
                  :prompt-file    prompt-file
                  :workmux-config config
                  :display-info   {"Bot" bot-name "App DB" app-db "Command" command}})))))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Session management

(defn stop!
  "Stop a session (kill tmux + dev env, keep worktree).
   Works with a session name argument, or detects current session if no args."
  [{:keys [arguments]}]
  (let [session (resolve-session-name (first arguments))
        wt-path (worktree-path session)]
    ;; Stop dev environment
    (when (and wt-path (seq wt-path))
      (println (c/yellow "Stopping dev environment in " wt-path "..."))
      (shell/sh* {:quiet? true :dir wt-path} "./bin/mage" "-nvoxland-dev-env" "--down"))
    ;; Kill tmux session
    (println (c/yellow "Stopping tmux session: " session "..."))
    (shell/sh* {:quiet? true} "tmux" "kill-session" "-t" session)
    (println)
    (println (c/bold (c/green "Session stopped: ") (c/cyan session)))
    (println (c/yellow "Worktree preserved. Use /autobot to restart."))))

(defn quit!
  "Tear down and remove a session.
   Works with a session name argument, or detects current session if no args."
  [{:keys [arguments]}]
  (let [session (resolve-session-name (first arguments))]
    (println (c/yellow "Removing worktree: " session "..."))
    (shell/sh* {:quiet? true} "workmux" "remove" "-f" session)
    (shell/sh* {:quiet? true} "tmux" "kill-session" "-t" session)
    (println)
    (println (c/bold (c/green "Session removed: ") (c/cyan session)))))

(defn list-all!
  "List all sessions with status."
  [_parsed]
  (println (c/bold (c/green "Autobot Sessions")))
  (println)
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "workmux" "list")]
    (when (zero? exit)
      (doseq [line out]
        (println line)))))
