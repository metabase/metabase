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

#_(metabase-enterprise.workspaces.isolation/with-workspace-isolation (toucan2.core/select-one :model/Workspace 3)
    (transforms.i/execute! (toucan2.core/select-one :model/Transform 5) {:run-method :manual}))

#_(toucan2.core/select :model/Transform 5)
