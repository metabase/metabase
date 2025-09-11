(ns metabase-enterprise.library.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.library.settings :as settings]
   [metabase-enterprise.library.source :as source]
   [metabase-enterprise.library.source.git :as git]
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

(defn- reload-from-git!
  "Reloads the Metabase entities from the "
  [branch]
  (if-let [source (source/get-source)]
    (let [library-collection (t2/select-one :model/Collection :entity_id collection/library-entity-id)]
      (try
        (git/fetch! source)
        ;; Load all entities from Git first - this handles creates/updates via entity_id matching
        (let [load-result (serdes/with-cache
                            (v2.load/load-metabase! (source/ingestable-source source (or branch (settings/git-sync-import-branch)))
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
             :details {:error-type (type e)}}))))
    {:status :error
     :message "Library source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

(api.macros/defendpoint :post "/import"
  "Reload Metabase content from Git repository source of truth.

  This endpoint will:
  1. Fetch the latest changes from the configured git repository
  2. Load the updated content using the serialization/deserialization system

  Requires superuser permissions."
  [_route
   _query
   {:keys [branch]} :- [:map [:branch {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (let [result (reload-from-git! branch)]
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library` routes."
  (api.macros/ns-handler *ns* +auth))
