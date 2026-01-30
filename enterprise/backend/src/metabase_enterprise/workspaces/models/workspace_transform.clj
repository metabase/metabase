(ns metabase-enterprise.workspaces.models.workspace-transform
  "Model for WorkspaceTransform - holds the changeset of transforms being created
   and edited within a workspace."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceTransform [_model] :workspace_transform)

;; IMPORTANT: ref_id is NOT unique across workspaces - it corresponds to a Representation id and
;; the same transform can be checked out into multiple workspaces. Always use BOTH workspace_id
;; AND ref_id to identify a specific WorkspaceTransform record.
(methodical/defmethod t2/primary-keys :model/WorkspaceTransform [_model] [:ref_id :workspace_id])

(doto :model/WorkspaceTransform
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

;; TODO (chris 2025/12/11) we need to share a bunch of stuff with transforms, i think we'll need to reorganize modules
;;      suggestion: add a transforms-interfaces module which both transforms and workspaces depend on.

(defn- transform-source-out-DUPLICATED [m]
  (-> m
      mi/json-out-without-keywordization
      (update-keys keyword)
      (m/update-existing :query lib-be/normalize-query)
      (m/update-existing :type keyword)
      (m/update-existing :source-incremental-strategy #(update-keys % keyword))))

(defn- transform-source-in-DUPLICATED [m]
  (-> m
      (m/update-existing :query (comp lib/prepare-for-serialization lib-be/normalize-query))
      mi/json-in))

(t2/deftransforms :model/WorkspaceTransform
  {:ref_id {:in identity :out str/trim}
   :source {:out transform-source-out-DUPLICATED, :in transform-source-in-DUPLICATED}
   :target mi/transform-json})

(t2/define-before-insert :model/WorkspaceTransform
  [instance]
  ;; Ref id can not be added here due to mysql t2 bug
  (when-not (string? (not-empty (:ref_id instance)))
    (throw (ex-info "ref_id required for WorkspaceTransform insertion."
                    {:instance instance})))
  instance)

(t2/define-before-update :model/WorkspaceTransform
  [instance]
  ;; global_id is immutable - a transform's link to the global transform it was checked out from cannot change
  (when (contains? (t2/changes instance) :global_id)
    (let [original (t2/original instance)]
      (throw (ex-info "Cannot change global_id of an existing workspace transform."
                      {:status-code   400
                       :workspace_id  (:workspace_id original)
                       :ref_id        (:ref_id original)
                       :old_global_id (:global_id original)
                       :new_global_id (:global_id instance)}))))
  ;; Mark the definition as changed when source or target is updated.
  ;; This is also set redundantly by [[metabase-enterprise.workspaces.impl/increment-analysis-version!]] in the API
  ;; layer, but having it here ensures correctness regardless of the code path used to update the transform.
  (cond-> instance
    (or (contains? (t2/changes instance) :source)
        (contains? (t2/changes instance) :target))
    (assoc :definition_changed true)))
