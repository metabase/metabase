(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]))

(set! *warn-on-reflection* true)

(defn execute!
  "Execute a transform.

  For workspace transforms, execution must go through the workspace-specific endpoint.
  Calling this function directly with a workspace transform will throw a 404 error."
  [transform opts]
  (when (:workspace_id transform)
    (throw (ex-info "Workspace transforms must be executed through the workspace API"
                    {:status-code 404
                     :transform-id (:id transform)
                     :workspace-id (:workspace_id transform)})))
  (transforms.i/execute! transform opts))
