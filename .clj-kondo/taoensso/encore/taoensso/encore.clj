(ns taoensso.encore
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn defalias [{:keys [node]}]
  (let [[sym-raw src-raw] (rest (:children node))
        src (if src-raw src-raw sym-raw)
        sym (if src-raw
              sym-raw
              (symbol (name (hooks/sexpr src))))]
    {:node (with-meta
             (hooks/list-node
               [(hooks/token-node 'def)
                (hooks/token-node (hooks/sexpr sym))
                (hooks/token-node (hooks/sexpr src))])
             (meta src))}))
