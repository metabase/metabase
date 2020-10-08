(ns release.check-prereqs
  (:require [clojure.string :as str]
            [environ.core :as env]
            [release.common :as c]))

(def ^:private required-commands
  ["yarn" "aws" "docker" "java"])

(defn- check-for-required-commands []
  (c/step "Verify required external commands are available"
    (doseq [cmd required-commands]
      (c/step (format "Verify command %s is available" (pr-str cmd)))
      (loop []
        (let [result (try
                       (c/sh "which" cmd)
                       (catch Throwable _
                         :fail))]
          (when (= result :fail)
            (printf "The %s command is not available locally. Please install it and press any key to continue, or Ctrl-C to quit."
                    (pr-str cmd))
            (flush)
            (read-line)
            (recur)))))
    (c/announce "All required external commands are available.")))

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
  (c/step "Verify required env vars are set"
    (doseq [env-var required-env-vars
            :let    [actual-env-var (str/upper-case (str/replace (name env-var) #"-" "_"))]]
      (c/step (format "Verify env var %s is set" actual-env-var)
        (if (get env/env env-var)
          (c/announce "Found %s" actual-env-var)
          (c/step "Prompt for value"
            (c/announce "%s is not set." actual-env-var)
            (let [val (c/read-line-with-prompt "Please enter a value to use, or press Ctrl-C to quit:")]
              (alter-var-root #'env/env assoc env-var val))))))))

(defn- check-docker-is-running []
  (c/step "Verify Docker is running"
    (loop []
      (let [result (try
                     (c/sh {:quiet? true} "docker" "ps")
                     (c/announce "Docker is running.")
                     (catch Throwable _
                       :fail))]
        (when (= result :fail)
          (printf "Docker is not running. Please make sure it is running and press any key to continue or Ctrl-C to quit.")
          (flush)
          (read-line)
          (recur))))))

(defn- java-version
  "Get `major.minor` version of the `java` command, e.g. `14.0` or `1.8` (Java 8)."
  []
  (when-let [[_ version] (re-find #"version \"(\d+\.\d+)\..*\"" (first (c/sh "java" "-version")))]
    (Double/parseDouble version)))

(defn- check-java-8 []
  (c/step "Verify Java version is Java 8"
    (let [version (or (java-version)
                            (throw (Exception. "Unable to determine Java major version.")))]
      ;; TODO -- is it possible to invoke `jabba` or some other command programmatically, or prompt for a different
      ;; `JAVA_HOME`/`PATH` to use?
      (when-not (#{1.8 8} version)
        (throw (Exception. "The Metabase build script currently requires Java 8 to run. Please change your Java version and try again.")))
      (c/announce "Java version is Java 8."))))

(defn check-prereqs []
  (c/step "Check prereqs"
    (check-for-required-commands)
    (check-for-required-env-vars)
    (check-docker-is-running)
    (check-java-8)))
