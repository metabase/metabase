(ns hooks.metabase.util.malli.registry
  (:refer-clojure :exclude [def])
  (:require
   [clj-kondo.hooks-api :as api]))

(defn def
  "Register the schema keyword so LSP can jump to it."
  [x]
  (letfn [(update-def-keyword [k]
            (api/reg-keyword! k 'metabase.util.malli.registry/def))
          (update-children [[_def k :as children]]
            (if (api/keyword-node? k)
              (update (vec children) 1 update-def-keyword)
              children))
          (update-node [node]
            (if (api/list-node? node)
              (-> (api/list-node (update-children (:children node)))
                  (with-meta (meta node)))
              node))]
    (update x :node update-node)))
