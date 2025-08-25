(ns metabase-enterprise.git-source-of-truth.config
  (:require
   [clojure.string]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting git-source-repo-url
  (deferred-tru "Git repository URL to use as the source of truth for library managed entities.")
  :visibility :admin
  :export? true
  :encryption :no)

(defsetting git-source-branch
  (deferred-tru "Git branch to use for the source of truth for library")
  :visibility :admin
  :export? true
  :encryption :no
  :default "main")

(defsetting git-source-path
  (deferred-tru "Path in the repository to use as the base of the source of truth.")
  :visibility :admin
  :export? true
  :encryption :no
  :default ".")

(defn enabled?
  "Check if git source of truth is enabled"
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
