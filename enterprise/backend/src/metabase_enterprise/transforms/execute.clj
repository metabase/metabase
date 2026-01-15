(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- has-stale-transform-dependencies?
  "Check if a global transform has any stale parent transforms.
   Returns true if any parent transform is stale."
  [transform-id]
  (let [parent-transform-ids (t2/select-fn-set :to_entity_id
                                               :model/Dependency
                                               :from_entity_type "transform"
                                               :from_entity_id transform-id
                                               :to_entity_type "transform")]
    (and (seq parent-transform-ids)
         (t2/exists? :model/Transform
                     :id [:in parent-transform-ids]
                     :execution_stale true))))

(defn execute!
  "Run `transform` and sync its target table.

  This is executing synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  ([transform]
   (execute! transform nil))
  ([transform opts]
   #_{:clj-kondo/ignore [:discouraged-var]}
   (let [result (transforms.i/execute! transform opts)]
     ;; Only clear execution_stale if no upstream transforms are stale.
     ;; This prevents incorrectly marking a transform as not stale when its inputs
     ;; haven't been refreshed yet. See: https://github.com/metabase/metabase/pull/67974
     (when-not (has-stale-transform-dependencies? (:id transform))
       (t2/update! :model/Transform (:id transform) {:execution_stale false}))
     result)))
