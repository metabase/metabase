(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]))

(set! *warn-on-reflection* true)

(defn execute!
  "Execute a transform."
  [transform opts]
  (transforms.i/execute! transform opts))
