(ns hooks.metabase.mq.impl
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn def-listener
  "Kondo hook for `mq/def-listener`. Rewrites to a `fn` form so kondo can analyze bindings.

   Forms:
     (mq/def-listener! :topic/foo [msg] body...)
     (mq/def-listener! :queue/bar {:config map} [msgs] body...)"
  [{:keys [node]}]
  (let [[_ _channel-name & args] (:children node)
        ;; skip optional config map
        args (if (hooks/map-node? (first args))
               (rest args)
               args)
        [bindings & body] args
        ;; rewrite as: (fn [bindings...] body...)
        new-node (hooks/list-node
                  (list*
                   (hooks/token-node 'fn)
                   bindings
                   body))]
    {:node new-node}))
