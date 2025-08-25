(ns metabase-enterprise.git-source-of-truth.config
  (:require
   [clojure.string]
   [metabase.config.core :as config]))

(defn git-source-repo-url
  "Git repository URL to use as source of truth. When set, Metabase will clone this repository and load its content using serdes."
  []
  (config/config-str :mb-git-source-repo-url))

(defn git-source-branch
  "Git branch to checkout. Defaults to 'main' if not specified."
  []
  (or (config/config-str :mb-git-source-branch) "main"))

(defn git-source-path
  "Path within the git repository to the serdes files. Defaults to '.' (root directory) if not specified."
  []
  (or (config/config-str :mb-git-source-path) "."))

(defn git-source-auth-token
  "Optional authentication token for accessing private git repositories."
  []
  (config/config-str :mb-git-source-auth-token))

(defn enabled?
  "Check if git source of truth is enabled via environment variables."
  []
  (some? (git-source-repo-url)))

(defn validate-config!
  "Validate the git source of truth configuration. Throws an exception if invalid."
  []
  (when (enabled?)
    (let [repo-url (git-source-repo-url)
          branch (git-source-branch)
          path (git-source-path)]

      (when (empty? repo-url)
        (throw (ex-info "Git repository URL is required but empty"
                        {:config-key :mb-git-source-repo-url})))

      (when (empty? branch)
        (throw (ex-info "Git branch is required but empty"
                        {:config-key :mb-git-source-branch})))

      (when (empty? path)
        (throw (ex-info "Git source path is required but empty"
                        {:config-key :mb-git-source-path})))

      ;; Validate branch name (basic check)
      (when-not (re-matches #"^[a-zA-Z0-9/_-]+$" branch)
        (throw (ex-info (format "Invalid git branch name: %s" branch)
                        {:config-key :mb-git-source-branch
                         :branch branch})))

      ;; Validate path (basic check)
      (when (or (clojure.string/includes? path "..")
                (clojure.string/starts-with? path "/"))
        (throw (ex-info (format "Invalid git source path (must be relative and not contain '..'): %s" path)
                        {:config-key :mb-git-source-path
                         :path path}))))))
