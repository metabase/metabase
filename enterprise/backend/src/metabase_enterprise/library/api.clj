(ns metabase-enterprise.library.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.library.sources :as sources]
   [metabase-enterprise.mbml.core :as mbml]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
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

(defn- reload-from-git!
  "Reloads the Metabase entities from the "
  []
  (if-let [source (sources/get-source)]
    (let [library-collection (t2/select-one :model/Collection :entity_id collection/library-entity-id)]
      (with-temp-directory dir
        (try
          (sources/load-source! source dir)
          ;; Load all entities from Git first - this handles creates/updates via entity_id matching
          (let [load-result (serdes/with-cache
                              (v2.load/load-metabase! (v2.ingest/ingest-yaml dir)
                                                      :root-dependency-path [{:id collection/library-entity-id
                                                                              :model "Collection"}]))
                ;; Extract entity_ids by model from the :seen paths
                imported-entities (->> (:seen load-result)
                                       (map last) ; Get the last element of each path (the entity itself)
                                       (group-by :model)
                                       (map (fn [[model entities]]
                                              [model (set (map :id entities))]))
                                       (into {}))
                affected-collection-ids (collection/collection->descendant-ids library-collection)]
            ;; Now delete any library content that was NOT part of the import
            (doseq [model [:model/Collection
                           :model/Card
                           :model/Dashboard
                           :model/NativeQuerySnippet
                           :model/Timeline
                           :model/Document]
                    :let [serdes-model (name model)
                          entity-ids (get imported-entities serdes-model [])]]
              (if (= model :model/Collection)
                (when (seq affected-collection-ids)
                  (t2/delete! :model/Collection
                              :id [:in affected-collection-ids]
                              ;; if we didn't sync any, then delete all collections in the library
                              :entity_id (if (seq entity-ids)
                                           [:not-in entity-ids]
                                           :entity_id)))
                (t2/delete! model
                            :collection_id [:in (cons (u/the-id library-collection) affected-collection-ids)]
                            :entity_id (if (seq entity-ids)
                                         [:not-in entity-ids]
                                         :entity_id)))))
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
               :details {:error-type (type e)}})))))
    {:status :error
     :message "Library source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(api.macros/defendpoint :post "/import"
  "Reload Metabase content from Git repository source of truth.

  This endpoint will:
  1. Fetch the latest changes from the configured git repository
  2. Load the updated content using the serialization/deserialization system

  Requires superuser permissions."
  []
  (api/check-superuser)
  (let [result (reload-from-git!)]
    (case (:status result)
      :success
      "Success"

      :error
      {:status 400
       :body {:status "error"
              :message (:message result)}}

      ;; Fallback for unexpected result format
      {:status 500
       :body {:status "error"
              :message "Unexpected error occurred during reload"}})))

(api.macros/defendpoint :post "/export"
  "Export the current state of the Library collection to a Source

  This endpoint will:
  1. Fetch the latest changes from the source
  2. Create a branch or subdirectory -- depending on source support
     If no branch is supplied use the configured export branch.
  3. Export the Library collection via serialization to the branch or subdirectory
  4. If possible commit the changes
  5. If possible sync to the source.

  Requires superuser permissions."
  [_route
   _query
   {:keys [branch force-sync]}] :- [:map
                                    [:branch {:optional true} ms/NonBlankString]
                                    [:force-sync {:optional true} :boolean]])

(api.macros/defendpoint :get "/source"
  "List items in the source repository"
  []
  (if-let [source (sources/get-source)]
    (with-temp-directory dir
      (log/info "Reloading Metabase configuration from source")
      (try
        (let [root-dir (io/file (sources/load-source! source (.toString dir)))
              files (next (file-seq root-dir))
              build-tree (fn build-tree [files parent-path]
                           (->> files
                                (filter #(not= (.getName %) ".git"))
                                (filter #(not= (.getName %) ".github"))
                                (filter #(not= (.getName %) ".gitignore"))
                                (filter #(.startsWith (.toPath %) (.toPath parent-path)))
                                (filter #(= (.getParent (.toPath %)) (.toPath parent-path)))
                                (map (fn [file]
                                       (let [rel-path (->> file .toPath (.relativize (.toPath root-dir)) .toString)]
                                         (if (.isDirectory file)
                                           {:id rel-path
                                            :name (str "/" (.getName file))
                                            :type "folder"
                                            :children (build-tree files file)}
                                           {:id rel-path
                                            :name (str "/" (.getName file))
                                            :type "file"}))))
                                (sort-by :name)))]
          {:id "root"
           :name "metabase-"
           :type "folder"
           :children (build-tree files root-dir)})

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
            {:status  :error
             :message error-msg
             :details {:error-type (type e)}}))))
    {:status  :error
     :message "Library source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(def ^:private entity-type->fe-type
  {"model/Transform:v1" "transform"})

(api.macros/defendpoint :get "/source/:path"
  "List item in the "
  [{:keys [path]}]
  (if-let [source (sources/get-source)]
    (with-temp-directory dir
      (log/info "Reloading Metabase configuration from source")
      (try
        (let [root-dir (io/file (sources/load-source! source (.toString dir)))
              file (io/file root-dir path)]
          (api/check-404 (when (.exists file)
                           (let [[entity-type _ model] (mbml/mbml-file->unsaved-model (str (io/file root-dir path)))]
                             {:path    path
                              :entityType (entity-type->fe-type entity-type)
                              :entity model
                              :content (slurp file)}))))
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
            {:status  :error
             :message error-msg
             :details {:error-type (type e)}}))))
    {:status  :error
     :message "Library source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library` routes."
  (api.macros/ns-handler *ns* +auth))
