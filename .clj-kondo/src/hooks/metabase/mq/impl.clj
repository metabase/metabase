(ns hooks.metabase.mq.impl
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn def-listener
  "Kondo hook for `mq/def-listener`. Rewrites to a `fn` form so kondo can analyze bindings.

   Form:
     (mq/def-listener! :queue/bar [msgs] body...)"
  [{:keys [node]}]
  (let [[_ _channel-name bindings & body] (:children node)
        ;; rewrite as: (fn [bindings...] body...)
        new-node (hooks/list-node
                  (list*
                   (hooks/token-node 'fn)
                   bindings
                   body))]
    {:node new-node}))
