(ns hooks.metabase.test.data
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as string]
   [clojure.walk :as walk]))

(defn dataset [{:keys [node]}]
  (let [[dataset & body] (rest (:children node))]
    {:node (with-meta
             (hooks/list-node
              (list*
               (hooks/token-node 'clojure.test/testing)
               (hooks/string-node (str dataset))
               body))
             (meta dataset))}))

(defn $ids [{:keys [node]}]
  (let [[table-name & body] (rest (:children node))
        unused-node (hooks/token-node '_)
        vars (atom #{})
        _ (walk/postwalk (fn [node]
                           (when (hooks/token-node? node)
                             (let [str-node (str (hooks/sexpr node))]
                               (when (or (string/starts-with? str-node "$")
                                         (string/starts-with? str-node "!")
                                         (string/starts-with? str-node "&")
                                         (string/starts-with? str-node "*")
                                         (string/starts-with? str-node "%"))
                                 (swap! vars conj node))))
                           node)
                         body)
        nil-bindings (vec (interpose nil @vars))
        unused-bindings (vec (interpose unused-node @vars))
        final-bindings (concat [table-name nil
                                unused-node table-name]
                               (if (seq nil-bindings)
                                 (conj nil-bindings nil)
                                 [])
                               (if (seq unused-bindings)
                                 (conj (next unused-bindings)
                                       (first unused-bindings)
                                       unused-node)
                                 []))]
    {:node (with-meta
             (hooks/list-node
              (list*
               (hooks/token-node 'let)
               (hooks/vector-node (vec final-bindings))
               body))
             (meta body))}))
