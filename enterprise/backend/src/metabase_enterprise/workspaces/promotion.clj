(ns metabase-enterprise.workspaces.promotion
  "Functionality for promoting workspace transforms back to main Metabase."
  (:require
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- find-original-transform
  "Find the original transform that was mirrored into this workspace.
   Uses the workspace_mapping_transform table to find the upstream transform."
  [x0 workspace-id]
  (or (when-let [mapping (t2/select-one :model/WorkspaceMappingTransform
                                        :downstream_id (:id x0)
                                        :workspace_id workspace-id)]
        (t2/select-one :model/Transform :id (:upstream_id mapping)))
      (throw (ex-info "Original transform not found" {:transform-id (:id x0)
                                                      :workspace-id workspace-id}))))

(defn- promote-single-transform!
  "Promote a single workspace transform to replace its original.
   Returns a map with :id, :name, and :status."
  [xf upstream]
  (try
    (let [upstream-id (:id upstream)]
      (log/infof "Promoting transform %d -> %d: %s" (:id xf) upstream-id (:name upstream))

      (let [updates (select-keys xf [:source :description])]
        (t2/update! :model/Transform upstream-id updates))

      ;; no execution for now
      ;; (log/infof "Re-executing transform %d in original schema" upstream-id)
      ;; (let [updated-transform (t2/select-one :model/Transform :id upstream-id)]
      ;;   (transforms/run-mbql-transform! updated-transform))

      {:id     upstream-id
       :name   (:name upstream)})
    (catch Throwable e
      (log/errorf e "Failed to promote transform %s" (:name xf))
      {:id     (:id xf)
       :name   (:name xf)
       :error  (ex-message e)})))

(defn- transform-ids [graph]
  (->> (:transforms graph) (keep :mapping) (mapv :id)))

(defn promote-transforms!
  "Promote all transforms in a workspace back to main Metabase.

   This will:
   1. Get all workspace transforms
   2. Order them by dependencies (using the workspace graph)
   3. For each transform:
      - Find the original transform
      - Update it with the workspace version's definition
      - Re-execute it in the original schema

   Returns a map with:
   - :promoted - sequence of {:id, :name} maps
   - :errors - any transforms that failed to promote"
  [ws]
  (log/infof "Starting promotion of transforms from workspace %s" (:id ws))

  (let [ids             (transform-ids (:graph ws))
        xs              (if (seq ids)
                          (t2/select :model/Transform :id [:in ids])
                          ;; fallback for when there is no graph
                          (t2/select :model/Transform :workspace_id (:id ws)))
        _               (log/infof "Found %d workspace transforms to promote" (count xs))
        results         (for [x0   xs
                              :let [original (find-original-transform x0 (:id ws))]]
                          (promote-single-transform! x0 original))
        {promoted false
         errors   true} (group-by #(contains? % :error) results)]

    (log/infof "Promotion complete. %d succeeded, %d failed"
               (count promoted)
               (count errors))

    {:promoted promoted
     :errors   errors}))
