(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn execute!
  "Execute a transform."
  [transform opts]
  (let [thunk (fn [] (transforms.i/execute! transform opts))]
    (if-let [workspace (and (:workspace_id transform)
                            (t2/select-one :model/Workspace (:workspace_id transform)))]
      (workspaces/with-workspace-isolation workspace
        (thunk))
      (thunk))))
