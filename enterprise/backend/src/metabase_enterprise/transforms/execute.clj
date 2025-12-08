(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]))

(set! *warn-on-reflection* true)

(defn execute!
  "Execute a transform.

  For workspace transforms, execution must go through the workspace-specific endpoint.
  Calling this function directly with a workspace transform will throw a 404 error."
  [transform {:keys [start-promise] :as opts}]
  ;; This is used on FE for workspace transform execution until proper API is provided in workspaces module!
  ;; Hence temp enabling that.
  ;; TODO: Cleanup when moving to woskapce transform execution api.
  (if false #_(:workspace_id transform)
      (deliver start-promise
               (ex-info "Workspace transforms must be executed through the workspace API"
                        {:status-code 404
                         :transform-id (:id transform)
                         :workspace-id (:workspace_id transform)}))
      (transforms.i/execute! transform opts)))
