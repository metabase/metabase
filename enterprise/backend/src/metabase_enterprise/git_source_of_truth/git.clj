(ns metabase-enterprise.git-source-of-truth.git
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [metabase-enterprise.git-source-of-truth.config :as config]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(defn- create-temp-directory
  "Create a secure temporary directory for git operations."
  [prefix]
  (let [temp-dir (Files/createTempDirectory prefix (into-array FileAttribute []))]
    (.toString temp-dir)))

(defn- execute-git-command
  "Execute a git command in the specified directory. Returns {:exit-code :stdout :stderr}."
  [directory & args]
  (let [result (apply shell/sh "git" (concat args [:dir directory]))]
    (log/debugf "Git command: git %s (exit: %d)" (str/join " " args) (:exit result))
    (when-not (zero? (:exit result))
      (log/errorf "Git command failed: %s" (:err result)))
    result))

(defn- build-clone-url
  "Build git clone URL with authentication if token is provided."
  [repo-url auth-token]
  (if auth-token
    (let [url (java.net.URL. repo-url)
          protocol (.getProtocol url)
          host (.getHost url)
          path (.getPath url)]
      (format "%s://%s@%s%s" protocol auth-token host path))
    repo-url))

(defn cleanup-temp-directory!
  "Clean up temporary directory and all its contents."
  [temp-dir]
  (when temp-dir
    (try
      (let [dir-file (io/file temp-dir)]
        (when (.exists dir-file)
          (log/debugf "Cleaning up temporary directory: %s" temp-dir)

          (letfn [(delete-file [file]
                    (when (.isDirectory file)
                      (doseq [child (.listFiles file)]
                        (delete-file child)))
                    (.delete file))]
            (delete-file dir-file))

          (log/debugf "Successfully cleaned up temporary directory: %s" temp-dir)))
      (catch Exception e
        (log/warnf e "Failed to clean up temporary directory: %s" temp-dir)))))

(defn clone-repository!
  "Clone git repository to a temporary directory. Returns the path to the cloned repository."
  []
  (let [repo-url (config/git-source-repo-url)
        auth-token (config/git-source-auth-token)
        branch (config/git-source-branch)
        temp-dir (create-temp-directory "metabase-git-source-")
        clone-url (build-clone-url repo-url auth-token)]

    (let [result (execute-git-command temp-dir "clone" "--single-branch" "--branch" branch clone-url ".")]
      (if (zero? (:exit result))
        (do
          (log/infof "Successfully cloned repository to %s" temp-dir)
          temp-dir)
        (do
          (cleanup-temp-directory! temp-dir)
          (throw (ex-info (format "Failed to clone git repository: %s" (:err result))
                          {:repo-url repo-url
                           :branch branch
                           :exit-code (:exit result)
                           :stderr (:err result)})))))))

(defn fetch-latest-changes!
  "Fetch the latest changes from the remote repository."
  [repo-dir]
  (log/infof "Fetching latest changes in %s" repo-dir)

  (let [fetch-result (execute-git-command repo-dir "fetch" "origin")
        reset-result (execute-git-command repo-dir "reset" "--hard" (str "origin/" (config/git-source-branch)))]

    (when-not (zero? (:exit fetch-result))
      (throw (ex-info (format "Failed to fetch from remote: %s" (:err fetch-result))
                      {:exit-code (:exit fetch-result)
                       :stderr (:err fetch-result)})))

    (when-not (zero? (:exit reset-result))
      (throw (ex-info (format "Failed to reset to latest: %s" (:err reset-result))
                      {:exit-code (:exit reset-result)
                       :stderr (:err reset-result)})))

    (log/info "Successfully updated to latest changes")))

(defn get-serdes-path
  "Get the full path to the serdes files within the repository."
  [repo-dir]
  (let [config-path (config/git-source-path)
        full-path (if (= config-path ".")
                    repo-dir
                    (str repo-dir File/separator config-path))]

    (when-not (.exists (io/file full-path))
      (throw (ex-info (format "Serdes path does not exist: %s" full-path)
                      {:repo-dir repo-dir
                       :config-path config-path
                       :full-path full-path})))

    full-path))

(defn validate-repository-access!
  "Validate that the configured git repository is accessible."
  []
  (let [repo-url (config/git-source-repo-url)
        branch (config/git-source-branch)]

    (log/infof "Validating access to git repository %s (branch: %s)" repo-url branch)

    (let [temp-dir (create-temp-directory "metabase-git-validate-")]
      (try
        (let [auth-token (config/git-source-auth-token)
              clone-url (build-clone-url repo-url auth-token)
              result (execute-git-command temp-dir "ls-remote" "--heads" clone-url branch)]

          (if (zero? (:exit result))
            (log/info "Git repository is accessible")
            (throw (ex-info (format "Git repository is not accessible: %s" (:err result))
                            {:repo-url repo-url
                             :branch branch
                             :exit-code (:exit result)
                             :stderr (:err result)}))))
        (finally
          (cleanup-temp-directory! temp-dir))))))
