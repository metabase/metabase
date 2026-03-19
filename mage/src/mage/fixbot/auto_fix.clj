(ns mage.fixbot.auto-fix
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Workmux config

(defn- extract-claude-oauth-token
  "Extract the Claude OAuth token from the macOS keychain.
   Returns the token string, or nil if not available."
  []
  (when (str/starts-with? (System/getProperty "os.name" "") "Mac")
    (let [{:keys [exit out]} (shell/sh* {:quiet? true}
                                        "security" "find-generic-password"
                                        "-s" "Claude Code-credentials"
                                        "-a" (System/getProperty "user.name")
                                        "-w")]
      (when (zero? exit)
        (let [raw (str/trim (str/join "" out))
              ;; Parse {"claudeAiOauth":{"accessToken":"sk-ant-...",...}}
              m   (re-find #"\"accessToken\"\s*:\s*\"([^\"]+)\"" raw)]
          (second m))))))

(defn- generate-workmux-config
  "Generate the .workmux.yaml content."
  [issue-id issue-url app-db]
  (str "agent: ./bin/claude-dangerous\n"
       "\n"
       "post_create:\n"
       "  - mkdir -p .fixbot\n"
       "  - echo '" issue-id " | " issue-url "' > .fixbot/issue.txt\n"
       "  - cp .claude/fixbot/commands/*.md .claude/commands/\n"
       "  - ./bin/mage -fixbot-dev-env --app-db " app-db "\n"
       "  - .claude/fixbot/bd-init-worktree.sh\n"
       "\n"
       "pre_remove:\n"
       "  - ./bin/mage -fixbot-dev-env --down\n"
       "\n"
       "files:\n"
       "  symlink:\n"
       "    - node_modules\n"
       "\n"
       "panes:\n"
       "  - command: <agent>\n"
       "    focus: true\n"
       "\n"
       "  - command: clj -M:dev:dev-start:drivers:drivers-dev:ee:ee-dev\n"
       "    split: horizontal\n"
       "    percentage: 35\n"
       "\n"
       "  - command: MB_EDITION=ee bun run build-hot\n"
       "    split: vertical\n"
       "    percentage: 50\n"
       "\n"
       "  - command: watch -n 5 -t cat .fixbot/status.txt\n"
       "    split: horizontal\n"
       "    size: 5\n"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Main orchestrator

(defn run!
  "Main entry point for the auto-fix workflow.
   Expects --app-db, --prompt-file, and --branch options from the orchestrating Claude command."
  [{:keys [arguments options]}]
  (let [issue-id (first arguments)]
    (when (str/blank? issue-id)
      (println (c/red "Usage: ./bin/mage -fixbot-auto-fix MB-12345 --app-db postgres --prompt-file /tmp/prompt.md --branch 'username/mb-12345-fix-thing'"))
      (u/exit 1))
    (let [issue-id    (str/upper-case (str/trim issue-id))
          app-db      (or (:app-db options) "postgres")
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

      (let [session-name  (str "fixbot/" (str/lower-case issue-id))
            workmux-path  (str u/project-root-directory "/.workmux.yaml")
            backup-path   (str workmux-path ".bak")
            had-backup?   (.exists (java.io.File. workmux-path))
            ;; Use the issue URL from Linear (construct from issue-id)
            issue-url     (str "https://linear.app/metabase/issue/" issue-id)
            in-tmux?      (not (str/blank? (u/env "TMUX" (constantly nil))))
            ;; Extract OAuth token while we have keychain access (tmux can't)
            oauth-token   (extract-claude-oauth-token)]

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

          (let [base-args   (when base-branch ["--base" base-branch])
                workmux-cmd (str "workmux add " branch-name
                                 " --name " session-name
                                 " -P " prompt-file
                                 (when base-branch (str " --base " base-branch)))]
            (if in-tmux?
              ;; Already inside tmux — run workmux directly
              (apply shell/sh "workmux" "add" branch-name
                     "--name" session-name
                     "-P" prompt-file
                     base-args)
              ;; Not inside tmux — create a detached session and run workmux in it
              (do
                (println (c/yellow "Not inside tmux. Creating detached tmux session..."))
                (shell/sh "tmux" "new-session" "-d" "-s" session-name)
                ;; Inject OAuth token into tmux session so keychain isn't needed
                (when oauth-token
                  (shell/sh "tmux" "set-environment" "-t" session-name
                            "CLAUDE_CODE_OAUTH_TOKEN" oauth-token))
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
