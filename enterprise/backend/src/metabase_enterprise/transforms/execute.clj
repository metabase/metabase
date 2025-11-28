(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase.driver :as driver]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn execute!
  "Execute a transform"
  [transform opts]
  (let [f (fn [] (transforms.i/execute! transform opts))]
    (if-let [workspace (and (:workspace_id transform)
                            (t2/select-one :model/Workspace (:workspace_id transform)))]
      (driver/with-swapped-connection-details (:database_id workspace)
        (:database_details workspace)
        (f))
      (f))))
