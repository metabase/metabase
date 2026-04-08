(ns mage.qabot.go
  (:require
   [clojure.string :as str]
   [mage.bot.launch :as launch]
   [mage.bot.session :as bot]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- generate-workmux-config
  "Generate the .workmux.yaml content from the common template."
  [app-db]
  (let [ee-token (u/env "MB_PREMIUM_EMBEDDING_TOKEN" (constantly ""))
        linear-key (u/env "LINEAR_API_KEY" (constantly ""))]
    (-> (slurp (str u/project-root-directory "/dev/bot/common/workmux-template.yaml"))
        (str/replace "{{BOT_NAME}}" "qabot")
        (str/replace "{{SOURCE_REPO}}" u/project-root-directory)
        (str/replace "{{BOT_POST_CREATE}}"
                     (str "  - mkdir -p .qabot\n"
                          "  - MB_PREMIUM_EMBEDDING_TOKEN=" ee-token
                          " LINEAR_API_KEY=" linear-key
                          " ./bin/mage -bot-dev-env --app-db " app-db "\n")))))

(defn- branch-to-session-name
  "Convert a branch name to a qabot session name.
   e.g., 'feature/my-branch' -> 'qabot-my-branch'"
  [branch-name]
  (let [slug (-> branch-name
                 (str/replace #".+/" "")
                 (str/lower-case)
                 (str/replace #"[^a-z0-9-]" "-")
                 (str/replace #"-+" "-")
                 (str/replace #"^-|-$" ""))]
    (str "qabot-" (subs slug 0 (min (count slug) 40)))))

(defn run!
  "Main entry point for qabot workmux mode."
  [{:keys [arguments options]}]
  (let [branch-name (first arguments)]
    (when (str/blank? branch-name)
      (println (c/red "Usage: ./bin/mage qabot-go <branch-name> --prompt-file <path>"))
      (u/exit 1))
    (let [branch-name  (str/trim branch-name)
          app-db       (or (:app-db options) "postgres")
          prompt-file  (:prompt-file options)
          session-name (branch-to-session-name branch-name)
          config       (generate-workmux-config app-db)]
      (when (str/includes? branch-name "/")
        (println (c/red "Pass a local branch name, not a remote ref."))
        (println "Example: ./bin/mage qabot-go master  (not origin/master)")
        (u/exit 1))
      (when (str/blank? prompt-file)
        (println (c/red "--prompt-file is required"))
        (u/exit 1))
      (when-not (.exists (java.io.File. ^String prompt-file))
        (println (c/red "Prompt file not found: " prompt-file))
        (u/exit 1))

      ;; Check for running tmux session
      (when (bot/tmux-session-running? session-name)
        (println (c/red "Session " session-name " is already running!"))
        (println)
        (println "Attach to it with:")
        (println (str "  tmux attach -t " session-name))
        (println)
        (println (str "Stop it first with: ./bin/mage -qabot-stop " branch-name))
        (u/exit 1))

      ;; Check for existing worktree -> relaunch, otherwise fresh launch
      (let [existing (bot/find-session session-name)
            wt-path  (when existing (bot/worktree-path existing))]
        (if (and existing wt-path)
          (do
            (println (c/yellow "Found existing worktree: " existing))
            (launch/relaunch-existing-session!
             {:bot-name       "qabot"
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
            :display-info   {"App DB" app-db}}))))))
