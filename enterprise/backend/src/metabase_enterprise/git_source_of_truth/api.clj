(ns metabase-enterprise.git-source-of-truth.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.git-source-of-truth.settings :as settings]
   [metabase-enterprise.git-source-of-truth.sources :as sources]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import (java.io File)
           (java.nio.file Files)
           (java.nio.file.attribute FileAttribute)))

(defn cleanup-temp-directory!
  "Clean up temporary directory and all its contents."
  [temp-dir]
  (when temp-dir
    (try
      (let [dir-file (io/file temp-dir)]
        (when (.exists ^File dir-file)
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

(defmacro with-temp-directory
  "Makes a temp dir and then deletes it outside the form."
  [binding & body]
  `(let [~binding (.toFile (Files/createTempDirectory "git-source-of-truth-" (into-array FileAttribute [])))]
     (try ~@body
          (finally
            (cleanup-temp-directory! ~binding)))))

(defn- reload-from-git!
  "Reloads the Metabase entities from the library"
  []
  (if-let [source (sources/get-source)]
    (with-temp-directory dir
      (log/info "Reloading Metabase configuration from source")
      (try
        (serdes/with-cache
          (serdes.load/load-selective!
           (serdes.ingest/ingest-yaml (sources/load-source! source (.toString dir)))
           (->> (settings/git-sync-entities)
                (filter val)
                (map key)
                (map name)
                (map u/capitalize-first-char)
                (into #{}))))
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
             :details {:error-type (type e)}}))))
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
