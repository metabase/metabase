(ns mage.fixbot.session
  (:require
   [clojure.string :as str]
   [mage.bot.session :as bot]
   [mage.color :as c]
   [mage.fixbot.preflight :as preflight]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private prefix "fixbot")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Resume (fixbot-specific — reads fixbot workmux template)

(defn- write-resume-workmux-yaml!
  "Write a .workmux.yaml in the worktree that overrides the agent to use
   'claude --continue' so the agent resumes the previous conversation."
  [wt-path]
  (let [template      (slurp (str u/project-root-directory "/dev/bot/common/workmux-template.yaml"))
        ;; Fill in fixbot-specific values to get the panes section
        filled        (-> template
                          (str/replace "{{BOT_NAME}}" "fixbot")
                          (str/replace "{{SOURCE_REPO}}" u/project-root-directory)
                          (str/replace "{{BOT_POST_CREATE}}" ""))
        panes-idx     (str/index-of filled "\npanes:")
        panes-section (when panes-idx (subs filled panes-idx))
        yaml-path     (str wt-path "/.workmux.yaml")]
    (let [ee-token   (u/env "MB_PREMIUM_EMBEDDING_TOKEN" (constantly ""))
          linear-key (u/env "LINEAR_API_KEY" (constantly ""))]
      (spit yaml-path
            (str "agent: 'claude --continue'\n"
                 "\n"
                 "post_create:\n"
                 "  - cp -r " u/project-root-directory "/dev/bot/fixbot .claude/fixbot\n"
                 "  - cp -r " u/project-root-directory "/dev/bot/common/* .claude/fixbot/\n"
                 "  - cp -r " u/project-root-directory "/mage/src/mage/ mage/src/mage/\n"
                 "  - cp " u/project-root-directory "/bb.edn bb.edn\n"
                 "  - MB_PREMIUM_EMBEDDING_TOKEN=" ee-token
                 " LINEAR_API_KEY=" linear-key
                 " ./bin/mage -bot-dev-env\n"
                 "  - mise trust mise.local.toml\n"
                 panes-section)))
    (println (c/yellow "Wrote resume config to " yaml-path))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Public API — delegates to shared bot.session

(defn pause!
  "Pause a fixbot session."
  [{:keys [arguments]}]
  (bot/pause-sessions! prefix (first arguments)))

(defn resume!
  "Resume a paused fixbot session."
  [{:keys [arguments]}]
  (preflight/preflight!)
  (let [name-or-id (first arguments)]
    (when (str/blank? name-or-id)
      (println (c/red "Usage: ./bin/mage -fixbot-resume <name-or-issue-id>"))
      (u/exit 1))
    (let [arg       (str/trim name-or-id)
          pr-match  (re-find #"https://github\.com/.*/pull/(\d+)" arg)
          lookup    (if pr-match
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
          session   (bot/find-session lookup)]
      (if session
        (let [wt-path      (bot/worktree-path session)
              in-tmux?     (not (str/blank? (u/env "TMUX" (constantly nil))))
              resume-prompt "Continue where you left off."]
          (when wt-path
            (write-resume-workmux-yaml! wt-path))
          (println (c/yellow "Resuming session: " session "..."))
          (if in-tmux?
            (shell/sh {:dir wt-path} "workmux" "open" session "--run-hooks"
                      "-p" resume-prompt)
            (do
              (println (c/yellow "Not inside tmux. Creating detached tmux session..."))
              (shell/sh* {:quiet? true} "tmux" "kill-session" "-t" session)
              (shell/sh "nohup" "bash" "-c"
                        (str "cd " wt-path
                             " && tmux new-session -d -s " session
                             " && tmux send-keys -t " session
                             " \"workmux open " session " --run-hooks"
                             " -p '" resume-prompt "'\" Enter"))))
          (println)
          (if in-tmux?
            (println (c/bold (c/green "Session resumed: ") (c/cyan session)))
            (do
              (println (c/bold (c/green "Tmux session created: ") (c/cyan session)))
              (println)
              (println "Attach to it with:")
              (println (str "  tmux attach -t " session)))))
        (do
          (println (c/red "No paused session found matching: ") lookup)
          (bot/print-available-sessions!)
          (println)
          (println (c/yellow "To create a new session, use /fixbot with the issue ID."))
          (u/exit 1))))))

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
