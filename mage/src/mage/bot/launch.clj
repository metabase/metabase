(ns mage.bot.launch
  "Shared workmux session launch logic for fixbot, uxbot, and other bot types."
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Fresh launch (workmux add — creates new worktree)

(defn launch-workmux-session!
  "Launch a new workmux session (creates worktree from branch).
   Options:
     :session-name   — tmux/workmux session name (e.g., \"fixbot-uxw-3330\")
     :branch-name    — git branch to create/use
     :prompt-file    — path to the agent prompt file (relative to main repo)
     :workmux-config — rendered .workmux.yaml content (string)
     :base-branch    — base branch to create worktree from (default: \"origin/master\")
     :display-info   — map of {\"label\" value} pairs to print"
  [{:keys [session-name branch-name prompt-file workmux-config base-branch display-info]}]
  (let [workmux-path (str u/project-root-directory "/.workmux.yaml")
        backup-path  (str workmux-path ".bak")
        had-backup?  (.exists (java.io.File. workmux-path))
        in-tmux?     (not (str/blank? (u/env "TMUX" (constantly nil))))]

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

      (let [effective-base (or base-branch "origin/master")
            workmux-cmd    (str "workmux add " branch-name
                                " --name " session-name
                                " -P " prompt-file
                                " --base " effective-base)]
        (if in-tmux?
          ;; Already inside tmux — run workmux directly
          (shell/sh "workmux" "add" branch-name
                    "--name" session-name
                    "-P" prompt-file
                    "--base" effective-base)
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

(defn relaunch-existing-session!
  "Relaunch a bot session in an existing worktree.
   Copies fresh tooling from source repo, regenerates config, starts dev env, and launches tmux.
   Options:
     :bot-name       — \"fixbot\" or \"uxbot\"
     :session-name   — tmux session name
     :wt-path        — absolute path to existing worktree
     :prompt-file    — path to prompt file (relative to main repo)
     :app-db         — database type (\"postgres\", \"mysql\", etc.)
     :workmux-config — rendered .workmux.yaml content (for panes section)
     :env-vars       — extra env vars for dev-env command (e.g., \"LINEAR_API_KEY=xxx\")"
  [{:keys [bot-name session-name wt-path prompt-file app-db workmux-config env-vars]}]
  (let [in-tmux? (not (str/blank? (u/env "TMUX" (constantly nil))))]
    ;; Copy fresh tooling into worktree
    (println (c/yellow "Updating tooling in existing worktree..."))
    (shell/sh "bash" "-c"
              (str "mkdir -p " wt-path "/.claude/" bot-name
                   " && cp -r " u/project-root-directory "/dev/bot/" bot-name "/* " wt-path "/.claude/" bot-name "/"
                   " && cp -r " u/project-root-directory "/dev/bot/common/* " wt-path "/.claude/" bot-name "/"
                   " && cp -r " u/project-root-directory "/mage/src/mage/ " wt-path "/mage/src/mage/"
                   " && cp " u/project-root-directory "/bb.edn " wt-path "/bb.edn"
                   " && rm -f " wt-path "/.claude/commands/" bot-name "*.md"
                   " && cp " wt-path "/.claude/" bot-name "/commands/*.md " wt-path "/.claude/commands/"))

    ;; Regenerate settings
    (let [settings-template (str wt-path "/.claude/" bot-name "/settings.local-template.json")]
      (when (.exists (java.io.File. ^String settings-template))
        (shell/sh "bash" "-c"
                  (str "sed 's|{{pwd}}|" wt-path "|;s|{{tmpdir}}|${TMPDIR%/}|' "
                       settings-template " > " wt-path "/.claude/settings.local.json"))))

    ;; Regenerate .mcp.json
    (spit (str wt-path "/.mcp.json")
          "{\"mcpServers\":{\"playwright\":{\"command\":\"npx\",\"args\":[\"-y\",\"@playwright/mcp\",\"--headless\",\"--browser\",\"chrome\"]}}}")

    ;; Start dev environment
    (println (c/yellow "Starting dev environment..."))
    (let [ee-token (u/env "MB_PREMIUM_EMBEDDING_TOKEN" (constantly ""))
          env-str  (str "MB_PREMIUM_EMBEDDING_TOKEN=" ee-token
                        (when env-vars (str " " env-vars)))]
      (shell/sh {:dir wt-path} "bash" "-c"
                (str env-str " ./bin/mage -bot-dev-env --app-db " app-db)))
    (shell/sh {:dir wt-path} "mise" "trust" "mise.local.toml")

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
