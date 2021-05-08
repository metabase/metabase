(ns release.check-prereqs
  (:require [clojure.string :as str]
            [environ.core :as env]
            [metabuild-common.core :as u]))

(def ^:private required-commands
  ["git" "node" "yarn" "aws" "docker" "java" "wget" "zip"])

(defn- check-for-required-commands []
  (u/step "Verify required external commands are available"
    (doseq [cmd required-commands]
      (u/step (format "Verify command %s is available" (pr-str cmd))
        (when-not (zero? (:exit (u/sh* "which" cmd)))
          (throw (ex-info (format "The %s command is not available locally. Please install it and then try again." cmd)
                          {:cmd cmd})))))
    (u/announce "All required external commands are available.")))

(def ^:private required-env-vars
  (filter
   some?
   [:github-token
    :dockerhub-username
    :dockerhub-password
    :aws-default-profile
    ;; Slack Webhook URL is required unless you set `NO_SLACK`
    (when-not (env/env :no-slack) :slack-webhook-url)]))

(defn- check-for-required-env-vars []
  (u/step "Verify required env vars are set"
    (doseq [env-var required-env-vars
            :let    [actual-env-var (str/upper-case (str/replace (name env-var) #"-" "_"))]]
      (u/step (format "Verify env var %s is set" actual-env-var)
        (if (get env/env env-var)
          (u/announce "Found %s" actual-env-var)
          (u/step "Prompt for value"
            (u/announce "%s is not set." actual-env-var)
            (let [val (u/read-line-with-prompt "Please enter a value to use, or press Ctrl-C to quit:")]
              (alter-var-root #'env/env assoc env-var val))))))))

(defn- check-docker-is-running []
  (u/step "Verify Docker is running"
    (when-not (zero? (:exit (u/sh* {:quiet? true} "docker" "ps")))
      (throw (ex-info "Docker is not running. Please start it and try again." {})))
    (u/announce "Docker is running.")))

(defn check-prereqs []
  (u/step "Check prereqs"
    (check-for-required-commands)
    (check-for-required-env-vars)
    (check-docker-is-running)))
