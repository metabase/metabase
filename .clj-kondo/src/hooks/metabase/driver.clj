(ns hooks.metabase.driver
  (:require
   [clj-kondo.hooks-api :as api]))

(defn register!
  "Register the driver keyword so LSP can jump to it."
  [x]
  (letfn [(update-driver-keyword [k]
            (api/reg-keyword! k 'metabase.driver/register!))
          (update-children [[_register! k :as children]]
            (if (api/keyword-node? k)
              (update (vec children) 1 update-driver-keyword)
              children))
          (update-node [node]
            (if (api/list-node? node)
              (update node :children update-children)
              node))]
    (update x :node update-node)))
