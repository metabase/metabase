(ns mage.fixbot.go
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Workmux config

(defn- generate-workmux-config
  "Generate the .workmux.yaml content from the template file."
  [issue-id issue-url app-db]
  (-> (slurp (str u/project-root-directory "/.claude/fixbot/workmux-template.yaml"))
      (str/replace "{{ISSUE_ID}}" issue-id)
      (str/replace "{{ISSUE_URL}}" issue-url)
      (str/replace "{{APP_DB}}" app-db)
      (str/replace "{{SOURCE_REPO}}" u/project-root-directory)
      (str/replace "{{MB_PREMIUM_EMBEDDING_TOKEN}}" (u/env "MB_PREMIUM_EMBEDDING_TOKEN" (constantly "")))
      (str/replace "{{LINEAR_API_KEY}}" (u/env "LINEAR_API_KEY" (constantly "")))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Main orchestrator

(defn run!
  "Main entry point for the auto-fix workflow.
   Expects --app-db, --prompt-file, and --branch options from the orchestrating Claude command."
  [{:keys [arguments options]}]
  (let [issue-id (first arguments)]
    (when (str/blank? issue-id)
      (println (c/red "Usage: ./bin/mage fixbot-go MB-12345 --app-db postgres --prompt-file /tmp/prompt.md --branch 'username/mb-12345-fix-thing'"))
      (u/exit 1))
    (let [issue-id (str/upper-case (str/trim issue-id))
          app-db (or (:app-db options) "postgres")
          prompt-file (:prompt-file options)
          branch-name (:branch options)
          base-branch (:base options)]
      (when-not (re-matches #"[A-Z]+-\d+" issue-id)
        (println (c/red "Invalid issue identifier: " issue-id))
        (println "Expected format: MB-12345")
        (u/exit 1))
      (when (str/blank? prompt-file)
        (println (c/red "--prompt-file is required"))
        (u/exit 1))
      (when-not (.exists (java.io.File. ^String prompt-file))
        (println (c/red "Prompt file not found: " prompt-file))
        (u/exit 1))
      (when (str/blank? branch-name)
        (println (c/red "--branch is required"))
        (u/exit 1))

      (let [session-name (str "fixbot-" (str/lower-case issue-id))
            workmux-path (str u/project-root-directory "/.workmux.yaml")
            backup-path (str workmux-path ".bak")
            had-backup? (.exists (java.io.File. workmux-path))
            ;; Use the issue URL from Linear (construct from issue-id)
            issue-url (str "https://linear.app/metabase/issue/" issue-id)
            in-tmux? (not (str/blank? (u/env "TMUX" (constantly nil))))]

        ;; Write Claude Code hooks to main repo so workmux doesn't prompt
        (let [hooks-dir (str u/project-root-directory "/.github/hooks/workmux-status")]
          (.mkdirs (java.io.File. ^String hooks-dir))
          (spit (str hooks-dir "/hooks.json")
                "{\"version\":1,\"hooks\":{\"userPromptSubmitted\":[{\"type\":\"command\",\"bash\":\"workmux set-window-status working\"}],\"postToolUse\":[{\"type\":\"command\",\"bash\":\"workmux set-window-status working\"}],\"agentStop\":[{\"type\":\"command\",\"bash\":\"workmux set-window-status done\"}]}}"))

        ;; Back up existing .workmux.yaml if it exists
        (when had-backup?
          (println (c/yellow "Backing up existing .workmux.yaml..."))
          (.renameTo (java.io.File. workmux-path) (java.io.File. backup-path)))

        ;; Write our workmux config
        (println (c/yellow "Writing .workmux.yaml..."))
        (spit workmux-path
              (generate-workmux-config issue-id issue-url app-db))

        (try
          ;; Launch workmux
          (println)
          (println (c/bold (c/green "Launching workmux session: ") (c/cyan session-name)))
          (println (c/yellow "Branch: ") branch-name)
          (println (c/yellow "App DB: ") app-db)
          (println (c/yellow "Prompt: ") prompt-file)
          (println)

          (let [effective-base (or base-branch "master")
                base-args ["--base" effective-base]
                workmux-cmd (str "workmux add " branch-name
                                 " --name " session-name
                                 " -P " prompt-file
                                 " --base " effective-base)]
            (if in-tmux?
              ;; Already inside tmux — run workmux directly
              (apply shell/sh "workmux" "add" branch-name
                     "--name" session-name
                     "-P" prompt-file
                     base-args)
              ;; Not inside tmux — create a detached session and run workmux in it.
              ;; Env vars like MB_PREMIUM_EMBEDDING_TOKEN are baked into the
              ;; .workmux.yaml post_create commands so they don't need to be
              ;; in the tmux session's environment.
              (do
                (println (c/yellow "Not inside tmux. Creating detached tmux session..."))
                (shell/sh "tmux" "new-session" "-d" "-s" session-name)
                (shell/sh "tmux" "send-keys" "-t" session-name workmux-cmd "Enter")
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
                (.delete (java.io.File. workmux-path))))))))))
