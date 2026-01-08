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

(methodical/defmethod t2/primary-keys :model/WorkspaceTransform [_model] [:ref_id])

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
  [transform]
  (let [changes (t2/changes transform)]
    (cond-> transform
      ;; Mark as execution_stale if source or target changes
      (or (:source changes) (:target changes)) (assoc :execution_stale true))))
