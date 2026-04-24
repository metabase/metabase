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

(defn- current-worktree-path
  "Return the absolute path of the git worktree the caller is currently in,
   or nil if not inside a git repo."
  []
  (let [{:keys [exit out]} (shell/sh* {:quiet? true :dir (System/getProperty "user.dir")}
                                      "git" "rev-parse" "--show-toplevel")]
    (when (zero? exit)
      (str/trim (str/join "" out)))))

(defn- main-repo-path
  "Return the absolute path of the main (common) git repo, or nil if not in a git repo.
   When run from a linked worktree, this returns the main repo, not the worktree."
  []
  (let [{:keys [exit out]} (shell/sh* {:quiet? true :dir (System/getProperty "user.dir")}
                                      "git" "rev-parse" "--git-common-dir")]
    (when (zero? exit)
      (let [git-dir (str/trim (str/join "" out))
            ;; git-common-dir is usually `<main>/.git` or an absolute path ending in `/.git`
            abs     (if (str/starts-with? git-dir "/")
                      git-dir
                      (str (System/getProperty "user.dir") "/" git-dir))]
        (str/replace abs #"/\.git/?$" "")))))

(defn- detect-current-session
  "Detect the current session name when the caller is inside a worktree.

   Derives the name from the current worktree's path rather than asking
   workmux (which has no `current` subcommand). If the caller is in the
   main repo, returns nil (there's no active session there).

   Strategy:
   1. `git rev-parse --show-toplevel` → current worktree path
   2. `git rev-parse --git-common-dir` → main repo path
   3. If they are the same, we're in the main repo → nil
   4. Otherwise take the basename of the worktree path as the session name
      (autobot always names worktrees with the session slug)."
  []
  (let [wt   (current-worktree-path)
        main (main-repo-path)]
    (when (and wt main (not= wt main))
      (last (str/split wt #"/")))))

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
  "Generate the .workmux.yaml content from a template for a given bot.
   In PR-env mode (when pr-env-url is non-nil), uses the slim PR-env template
   instead of the full local-dev template."
  [{:keys [bot-name app-db pr-env-url pr-num]}]
  (let [template-path (if pr-env-url
                        (str u/project-root-directory "/dev/bot/workmux-template-pr-env.yaml")
                        (str u/project-root-directory "/dev/bot/workmux-template.yaml"))]
    (cond-> (slurp template-path)
      true        (str/replace "{{BOT_NAME}}" bot-name)
      (not pr-env-url) (str/replace "{{APP_DB}}" app-db)
      pr-env-url  (str/replace "{{PR_ENV_URL}}" pr-env-url)
      pr-num      (str/replace "{{PR_NUM}}" pr-num))))

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
          ;; Already inside tmux — run workmux directly; it creates a new window
          ;; in the current session.
          (shell/sh "workmux" "add" ref
                    "--name" session-name
                    "-P" prompt-file)
          ;; Not inside tmux — create a detached session and send the workmux
          ;; command to its initial shell. This leaves an extra zsh window (0)
          ;; alongside the bot window (1); the user switches to window 1 after
          ;; attaching. We tried two alternatives, both of which failed:
          ;;   1. `workmux add --session` — hangs when run from a non-interactive
          ;;      subprocess because it tries to attach and has no tty.
          ;;   2. Appending `; exit` to the workmux-cmd so window 0 self-destructs
          ;;      after workmux creates window 1 — racy: window 0 exits before
          ;;      workmux has fully registered window 1, and tmux tears down the
          ;;      whole session. Keep window 0 alive to avoid the race.
          (do
            (println (c/yellow "Not inside tmux. Creating detached tmux session..."))
            (shell/sh "nohup" "bash" "-c"
                      (str "tmux new-session -d -s " session-name
                           " && tmux send-keys -t " session-name
                           " " (pr-str workmux-cmd) " Enter"))
            (println)
            (println (c/bold (c/green "Tmux session created: ") (c/cyan session-name)))
            (println)
            (println "Attach to it with:")
            (println (str "  tmux attach -t " session-name " (then switch to window 1 with Ctrl-b 1)")))))

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

(defn- create-branch!
  "Create a new local branch <branch-name> pointing at <base-ref>. Exits on failure."
  [branch-name base-ref]
  (println (c/yellow "Creating new branch: ") (str branch-name " from " base-ref))
  (let [{:keys [exit err]} (shell/sh* {:quiet? true} "git" "branch" branch-name base-ref)]
    (when-not (zero? exit)
      (println (c/red "Failed to create branch " branch-name " from " base-ref))
      (doseq [line err] (println (c/red "  " line)))
      (u/exit 1))
    (println (c/green "  Created local branch: ") branch-name)
    branch-name))

(defn- resolve-branch-ref!
  "Fetch from origin and verify the branch exists locally or on origin.
   Returns the ref to pass to workmux add (the branch name if local, or origin/<branch> if remote only).

   The presence of base-branch means the caller wants the branch CREATED:
     - If the branch does not exist, creates it locally from base-branch.
     - If the branch already exists, exits with error (the base would otherwise be silently ignored).
   Without base-branch, the branch must already exist; otherwise exits with error."
  [branch-name {:keys [base-branch]}]
  (println (c/yellow "Checking that branch exists: ") branch-name)
  (shell/sh* {:quiet? true} "git" "fetch" "origin" branch-name)
  (let [local?  (local-branch-exists? branch-name)
        remote? (remote-branch-exists? branch-name)
        exists? (or local? remote?)
        base?   (not (str/blank? base-branch))]
    (cond
      (and exists? base?)
      (do
        (println (c/red "Branch already exists: ") branch-name)
        (println (c/red "  Cannot use 'from " base-branch "' (--base " base-branch ") because " branch-name " already exists."))
        (println (c/red "  Remove 'from <base>' to use the existing branch, or pick a new branch name."))
        (u/exit 1))

      local?
      (do
        (println (c/green "  Found local branch: ") branch-name)
        branch-name)

      remote?
      (let [remote-ref (str "origin/" branch-name)]
        (println (c/green "  Found remote branch: ") remote-ref)
        remote-ref)

      base?
      (create-branch! branch-name base-branch)

      :else
      (do
        (println (c/red "Branch not found: ") branch-name)
        (println (c/red "  No local branch and no origin/" branch-name " exists."))
        (println (c/red "  autobot will NOT create new branches — create the branch first,"))
        (println (c/red "  or pass --base <ref> (from <ref> in /autobot) to create it from that ref."))
        (u/exit 1)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Launch entry point

(defn go!
  "Launch a session. Takes --bot, --command, --base, --pr-env-url, and branch name."
  [{:keys [arguments options]}]
  (let [branch-name (first arguments)]
    (when (str/blank? branch-name)
      (println (c/red "Usage: ./bin/mage -autobot-go <branch-name> --bot <name> --command <cmd> [--pr-env-url <url>]"))
      (u/exit 1))
    (let [branch-name  (str/trim branch-name)
          bot-name     (:bot options)
          command      (:command options)
          app-db       (or (:app-db options) "postgres")
          base-branch  (:base options)
          pr-env-url   (:pr-env-url options)
          pr-num       (when pr-env-url
                         (second (re-find #"pr(\d+)" pr-env-url)))
          session-name (branch-to-session-name branch-name)
          config       (generate-workmux-config
                        {:bot-name    (or bot-name "autobot")
                         :app-db      app-db
                         :pr-env-url  pr-env-url
                         :pr-num      pr-num})]
      (when (and pr-env-url (str/blank? pr-num))
        (println (c/red "Could not extract PR number from --pr-env-url: " pr-env-url))
        (println (c/red "Expected format: https://pr<NUMBER>.coredev.metabase.com"))
        (u/exit 1))
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
              (let [branch-ref (resolve-branch-ref! branch-name
                                                    {:base-branch base-branch})
                    info       (cond-> {"Bot" bot-name "Command" command}
                                 (not pr-env-url) (assoc "App DB" app-db)
                                 pr-env-url       (assoc "PR Env" pr-env-url
                                                         "PR #"   pr-num))]
                (launch-workmux-session!
                 {:session-name   session-name
                  :branch-name    branch-name
                  :branch-ref     branch-ref
                  :base-branch    base-branch
                  :prompt-file    prompt-file
                  :workmux-config config
                  :display-info   info})))))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Result lookup

(defn- most-recent-result-md
  "Given a worktree path and a bot name, find the most recent result.md file
   under <wt>/.bot/<bot>/*/result.md. Returns the java.io.File or nil."
  [wt-path bot-name]
  (let [bot-dir (java.io.File. (str wt-path "/.bot/" bot-name))]
    (when (.isDirectory bot-dir)
      (->> (.listFiles bot-dir)
           (filter #(.isDirectory ^java.io.File %))
           (map (fn [^java.io.File subdir]
                  (java.io.File. subdir "result.md")))
           (filter #(.exists ^java.io.File %))
           (sort-by #(.lastModified ^java.io.File %))
           last))))

(defn result!
  "Print the most recent result.md for a given branch+bot combination.
   Usage: ./bin/mage -autobot-result <branch> <bot>"
  [{:keys [arguments]}]
  (let [[branch bot-name] arguments]
    (when (or (str/blank? branch) (str/blank? bot-name))
      (println (c/red "Usage: ./bin/mage -autobot-result <branch> <bot>"))
      (u/exit 1))
    (let [session-name (branch-to-session-name branch)
          session      (find-session session-name)
          wt-path      (when session (worktree-path session))]
      (cond
        (not wt-path)
        (do
          (println (c/red "No worktree found for branch: " branch))
          (print-available-sessions!)
          (u/exit 1))

        :else
        (let [result-file (most-recent-result-md wt-path bot-name)]
          (if result-file
            (do
              (println (c/bold (c/cyan "Result file: ")) (.getPath ^java.io.File result-file))
              (println)
              (println (slurp result-file)))
            (do
              (println (c/yellow (str "No result.md found for bot '" bot-name "' in " wt-path)))
              (println (c/yellow "The bot may not have started writing one yet, or the bot name is wrong.")))))))))

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
      (shell/sh* {:quiet? true :dir wt-path} "./bin/mage" "-bot-dev-env" "--down"))
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
