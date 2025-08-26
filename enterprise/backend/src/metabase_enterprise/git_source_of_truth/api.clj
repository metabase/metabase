(ns metabase-enterprise.git-source-of-truth.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.git-source-of-truth.config :as config]
   [metabase-enterprise.git-source-of-truth.git :as git]
   [metabase-enterprise.serialization.cmd :as serdes-cmd]

   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.log :as log]))

(defn- load-from-git-repository!
  "Load Metabase configuration from git repository using serdes."
  [repo-dir]
  (let [serdes-path (git/get-serdes-path (.toString repo-dir))]
    (log/infof "Loading Metabase configuration from serdes path: %s" serdes-path)

    (try
      (serdes-cmd/v2-load-internal! serdes-path {}
                                    :require-initialized-db? false)
      (log/info "Successfully loaded configuration from git repository")
      (catch Exception e
        (log/error e "Failed to load configuration from git repository")
        (throw e)))))

(defn- reload-from-git!
  "Reloads the Metabase entities from the library"
  []
  (if (config/enabled?)
    (do
      (log/info "Reloading Metabase configuration from git repository")

      (git/with-temp-directory repo-dir
        (try
          ;; Validate configuration first
          (config/validate-config!)
          (log/info "Git source of truth configuration validated successfully")

          ;; Clone the repository (this will get the latest version)
          (git/clone-repository! repo-dir)

          ;; Load configuration using serdes
          (load-from-git-repository! repo-dir)

          (log/info "Successfully reloaded entities from git repository")
          {:status :success
           :message "Successfully reloaded from git repository"}

          (catch Exception e
            (log/errorf e "Failed to reload from git repository: %s" (.getMessage e))
            (let [error-msg (cond
                              (instance? java.net.UnknownHostException e)
                              "Network error: Unable to reach git repository host"

                              (str/includes? (.getMessage e) "Authentication failed")
                              "Authentication failed: Please check your git credentials"

                              (str/includes? (.getMessage e) "Repository not found")
                              "Repository not found: Please check the repository URL"

                              (str/includes? (.getMessage e) "branch")
                              "Branch error: Please check the specified branch exists"

                              :else
                              (format "Failed to reload from git repository: %s" (.getMessage e)))]
              {:status :error
               :message error-msg
               :details {:error-type (type e)
                         :repo-url (config/git-source-repo-url)
                         :branch (config/git-source-branch)}})))))

    {:status :error
     :message "Git source of truth is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(api.macros/defendpoint :post "/reload"
  "Reload Metabase content from Git repository source of truth.
  
  This endpoint will:
  1. Fetch the latest changes from the configured git repository
  2. Load the updated content using the serialization/deserialization system
  3. Ensure read-only mode remains enabled
  
  Requires superuser permissions."
  []
  (api/check-superuser)
  (log/info "API request to reload from git repository")

  (let [result (reload-from-git!)]
    (case (:status result)
      :success
      {:status 200
       :body {:status "success"
              :message (:message result)}}

      :error
      {:status 400
       :body {:status "error"
              :message (:message result)}}

      ;; Fallback for unexpected result format
      {:status 500
       :body {:status "error"
              :message "Unexpected error occurred during reload"}})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/git-source-of-truth` routes."
  (api.macros/ns-handler *ns* +auth))
