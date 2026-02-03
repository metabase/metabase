(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]))

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
   (transforms.i/execute! transform opts)))
