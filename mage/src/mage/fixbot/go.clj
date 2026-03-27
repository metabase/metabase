(ns mage.fixbot.go
  (:require
   [clojure.string :as str]
   [mage.bot.launch :as launch]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Workmux config

(defn- generate-workmux-config
  "Generate the .workmux.yaml content from the common template."
  [app-db]
  (let [ee-token   (u/env "MB_PREMIUM_EMBEDDING_TOKEN" (constantly ""))
        linear-key (u/env "LINEAR_API_KEY" (constantly ""))]
    (-> (slurp (str u/project-root-directory "/dev/bot/common/workmux-template.yaml"))
        (str/replace "{{BOT_NAME}}" "fixbot")
        (str/replace "{{SOURCE_REPO}}" u/project-root-directory)
        (str/replace "{{BOT_POST_CREATE}}"
                     (str "  - mkdir -p .fixbot/playwright/sessions .fixbot/playwright/sockets\n"
                          "  - MB_PREMIUM_EMBEDDING_TOKEN=" ee-token
                          " LINEAR_API_KEY=" linear-key
                          " ./bin/mage -bot-dev-env --app-db " app-db "\n")))))

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

      (let [session-name (str "fixbot-" (str/lower-case issue-id))]
        (launch/launch-workmux-session!
         {:session-name   session-name
          :branch-name    branch-name
          :prompt-file    prompt-file
          :workmux-config (generate-workmux-config app-db)
          :base-branch    base-branch
          :display-info   {"App DB" app-db}})))))
