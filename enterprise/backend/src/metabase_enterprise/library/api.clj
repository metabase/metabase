(ns metabase-enterprise.library.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.library.source :as source]
   [metabase-enterprise.library.source.git :as git]
   [metabase-enterprise.mbml.core :as mbml]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.log :as log])
  (:import (java.io File)
           (java.nio.file Files)
           (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

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
  `(let [~binding (.toFile (Files/createTempDirectory "library-" (into-array FileAttribute [])))]
     (try ~@body
          (finally
            (cleanup-temp-directory! ~binding)))))

(api.macros/defendpoint :post "/import"
  "Reload Metabase content from Git repository source of truth.

  This endpoint will:
  1. Fetch the latest changes from the configured git repository
  2. Load the updated content using the serialization/deserialization system

  Requires superuser permissions."
  []
  (api/check-superuser)
  (git/fetch! (source/get-source))
  {:status :success
   :message "Successfully reloaded from git repository"})

(api.macros/defendpoint :get "/source"
  "List items in the source repository"
  []
  nil
  ;(if-let [source (source/get-source)]
  ;  (with-temp-directory dir
  ;    (log/info "Reloading Metabase configuration from source")
  ;    (try
  ;      (let [root-dir (io/file (source/pull-source! source (.toString dir)))
  ;            files (next (file-seq root-dir))
  ;            build-tree (fn build-tree [files parent-path]
  ;                         (->> files
  ;                              (filter #(not= (.getName %) ".git"))
  ;                              (filter #(not= (.getName %) ".github"))
  ;                              (filter #(not= (.getName %) ".gitignore"))
  ;                              (filter #(.startsWith (.toPath %) (.toPath parent-path)))
  ;                              (filter #(= (.getParent (.toPath %)) (.toPath parent-path)))
  ;                              (map (fn [file]
  ;                                     (let [rel-path (->> file .toPath (.relativize (.toPath root-dir)) .toString)]
  ;                                       (if (.isDirectory file)
  ;                                         {:id rel-path
  ;                                          :name (str "/" (.getName file))
  ;                                          :type "folder"
  ;                                          :children (build-tree files file)}
  ;                                         {:id rel-path
  ;                                          :name (str "/" (.getName file))
  ;                                          :type "file"}))))
  ;                              (sort-by :name)))]
  ;        {:id "root"
  ;         :name "metabase-"
  ;         :type "folder"
  ;         :children (build-tree files root-dir)})
  ;
  ;      (catch Exception e
  ;        (log/errorf e "Failed to reload from git repository: %s" (.getMessage e))
  ;        (let [error-msg (cond
  ;                          (instance? java.net.UnknownHostException e)
  ;                          "Network error: Unable to reach git repository host"
  ;
  ;                          (str/includes? (.getMessage e) "Authentication failed")
  ;                          "Authentication failed: Please check your git credentials"
  ;
  ;                          (str/includes? (.getMessage e) "Repository not found")
  ;                          "Repository not found: Please check the repository URL"
  ;
  ;                          (str/includes? (.getMessage e) "branch")
  ;                          "Branch error: Please check the specified branch exists"
  ;
  ;                          :else
  ;                          (format "Failed to reload from git repository: %s" (.getMessage e)))]
  ;          {:status  :error
  ;           :message error-msg
  ;           :details {:error-type (type e)}}))))
  ;  {:status  :error
  ;   :message "Library source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."})
  )

(def ^:private entity-type->fe-type
  {"model/Transform:v1" "transform"})

(api.macros/defendpoint :get "/source/:path"
  "List item in the "
  [{:keys [path]}]
  nil
  ;(if-let [source (source/get-source)]
  ;  (with-temp-directory dir
  ;    (log/info "Reloading Metabase configuration from source")
  ;    (try
  ;      (let [root-dir (io/file (source/pull-source! source (.toString dir)))
  ;            file (io/file root-dir path)]
  ;        (api/check-404 (when (.exists file)
  ;                         (let [[entity-type _ model] (mbml/mbml-file->unsaved-model (str (io/file root-dir path)))]
  ;                           {:path    path
  ;                            :entityType (entity-type->fe-type entity-type)
  ;                            :entity model
  ;                            :content (slurp file)}))))
  ;      (catch Exception e
  ;        (log/errorf e "Failed to reload from git repository: %s" (.getMessage e))
  ;        (let [error-msg (cond
  ;                          (instance? java.net.UnknownHostException e)
  ;                          "Network error: Unable to reach git repository host"
  ;
  ;                          (str/includes? (.getMessage e) "Authentication failed")
  ;                          "Authentication failed: Please check your git credentials"
  ;
  ;                          (str/includes? (.getMessage e) "Repository not found")
  ;                          "Repository not found: Please check the repository URL"
  ;
  ;                          (str/includes? (.getMessage e) "branch")
  ;                          "Branch error: Please check the specified branch exists"
  ;
  ;                          :else
  ;                          (format "Failed to reload from git repository: %s" (.getMessage e)))]
  ;          {:status  :error
  ;           :message error-msg
  ;           :details {:error-type (type e)}}))))
  ;  {:status  :error
  ;   :message "Library source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))
  )

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library` routes."
  (api.macros/ns-handler *ns* +auth))
