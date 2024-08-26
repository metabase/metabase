(ns hooks.metabase.lib.schema.mbql-clause
  (:require
   [clj-kondo.hooks-api :as api]))

(defn define-mbql-clause
  "Register the schema keyword so LSP can jump to it."
  [x]
  (letfn [(update-def-keyword [k]
            (-> (api/keyword-node (keyword "mbql.clause" (name (api/sexpr k))))
                (with-meta (meta k))
                (api/reg-keyword! 'metabase.lib.schema.mbql-clause/define-mbql-clause)))
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
