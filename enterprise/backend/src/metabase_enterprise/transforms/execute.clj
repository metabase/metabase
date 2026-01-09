(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
     (t2/update! :model/Transform (:id transform) {:execution_stale false})
     result)))
