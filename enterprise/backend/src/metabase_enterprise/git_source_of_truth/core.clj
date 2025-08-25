(ns metabase-enterprise.git-source-of-truth.core
  (:require
   [clojure.string]
   [metabase-enterprise.git-source-of-truth.config :as config]
   [metabase-enterprise.git-source-of-truth.git :as git]
   [metabase-enterprise.serialization.cmd :as serdes-cmd]
   [metabase.cloud-migration.core :as cloud-migration]
   [metabase.util.log :as log]))

(defn enabled?
  "Check if git source of truth is enabled via environment variables."
  []
  (config/enabled?))

(defn- load-from-git-repository!
  "Load Metabase configuration from git repository using serdes."
  [repo-dir]
  (let [serdes-path (git/get-serdes-path repo-dir)]
    (log/infof "Loading Metabase configuration from serdes path: %s" serdes-path)

    (try
      (serdes-cmd/v2-load-internal! serdes-path {}
                                    :require-initialized-db? false)
      (log/info "Successfully loaded configuration from git repository")
      (catch Exception e
        (log/error e "Failed to load configuration from git repository")
        (throw e)))))

(defn- enable-read-only-mode!
  "Enable read-only mode to prevent modifications to the database."
  []
  (log/info "Enabling read-only mode")
  (cloud-migration/read-only-mode! true)
  (log/info "Read-only mode enabled"))

(defn initialize-from-git!
  "Main initialization function - clone git repository, load content, and enable read-only mode."
  []
  (when (enabled?)
    (cloud-migration/read-only-mode! false)
    (log/info "Git source of truth is enabled - initializing Metabase from git repository")

    (let [repo-dir (atom nil)]
      (try
        ;; Validate configuration first
        (config/validate-config!)
        (log/info "Git source of truth configuration validated successfully")

        ;; Validate repository access
        (git/validate-repository-access!)
        (log/info "Git repository access validated successfully")

        ;; Clone the repository
        (reset! repo-dir (git/clone-repository!))

        ;; Load configuration using serdes
        (load-from-git-repository! @repo-dir)

        ;; Enable read-only mode
        (enable-read-only-mode!)

        (log/info "Successfully initialized Metabase from git repository")

        (catch Exception e
          (log/errorf e "Failed to initialize from git repository: %s" (.getMessage e))
          ;; Re-throw with more context if this is during startup
          (throw (ex-info "Git source of truth initialization failed"
                          {:phase :startup
                           :enabled? (enabled?)
                           :repo-url (config/git-source-repo-url)
                           :branch (config/git-source-branch)}
                          e)))

        (finally
          ;; Clean up temporary directory
          (when @repo-dir
            (git/cleanup-temp-directory! @repo-dir)))))))

(defn reload-from-git!
  "Reload Metabase configuration from git repository - used by API endpoint."
  []
  (if (enabled?)
    (do
      (log/info "Reloading Metabase configuration from git repository")

      (let [repo-dir (atom nil)]
        (try
          ;; Validate configuration first
          (config/validate-config!)
          (log/info "Git source of truth configuration validated successfully")

          ;; Clone the repository (this will get the latest version)
          (reset! repo-dir (git/clone-repository!))
          (cloud-migration/read-only-mode! false)

          ;; Load configuration using serdes
          (load-from-git-repository! @repo-dir)

          ;; Ensure read-only mode is still enabled
          (enable-read-only-mode!)

          (log/info "Successfully reloaded configuration from git repository")
          {:status :success
           :message "Successfully reloaded from git repository"}

          (catch Exception e
            (log/errorf e "Failed to reload from git repository: %s" (.getMessage e))
            (let [error-msg (cond
                              (instance? java.net.UnknownHostException e)
                              "Network error: Unable to reach git repository host"

                              (clojure.string/includes? (.getMessage e) "Authentication failed")
                              "Authentication failed: Please check your git credentials"

                              (clojure.string/includes? (.getMessage e) "Repository not found")
                              "Repository not found: Please check the repository URL"

                              (clojure.string/includes? (.getMessage e) "branch")
                              "Branch error: Please check the specified branch exists"

                              :else
                              (format "Failed to reload from git repository: %s" (.getMessage e)))]
              {:status :error
               :message error-msg
               :details {:error-type (type e)
                         :repo-url (config/git-source-repo-url)
                         :branch (config/git-source-branch)}}))

          (finally
            ;; Clean up temporary directory
            (when @repo-dir
              (git/cleanup-temp-directory! @repo-dir))))))

    {:status :error
     :message "Git source of truth is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))
