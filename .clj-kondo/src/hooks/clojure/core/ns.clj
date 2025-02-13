(ns hooks.clojure.core.ns
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common]
   [hooks.common.modules :as modules]))

(defn- ns-form-node->require-node [ns-form-node]
  (some (fn [node]
          (when (and (hooks/list-node? node)
                     (let [first-child (first (:children node))]
                       (and (hooks/keyword-node? first-child)
                            (= (hooks/sexpr first-child) :require))))
            node))
        (:children ns-form-node)))

(defn- lint-require-shapes [ns-form-node]
  (doseq [node (-> ns-form-node
                   ns-form-node->require-node
                   :children
                   rest)]
    (cond
      (not (hooks/vector-node? node))
      (hooks/reg-finding! (assoc (meta node)
                                 :message "All :required namespaces should be wrapped in vectors [:metabase/require-shape-checker]"
                                 :type    :metabase/require-shape-checker))

      (hooks/vector-node? (second (:children node)))
      (hooks/reg-finding! (assoc (meta node)
                                 :message "Don't use prefix forms inside :require [:metabase/require-shape-checker]"
                                 :type    :metabase/require-shape-checker)))))

(defn- lint-requires-on-new-lines [ns-form-node]
  (let [[require-keyword first-require] (-> ns-form-node
                                            ns-form-node->require-node
                                            :children)]
    (when-let [require-keyword-line (:row (meta require-keyword))]
      (when-let [first-require-line (:row (meta first-require))]
        (when (= require-keyword-line first-require-line)
          (hooks/reg-finding! (assoc (meta first-require)
                                     :message "Put your requires on a newline from the :require keyword [:metabase/require-shape-checker]"
                                     :type    :metabase/require-shape-checker)))))))

(defn- require-node->namespace-symb-nodes [require-node]
  (let [[_ns & args] (:children require-node)]
    (into []
          ;; prefixed namespace forms are NOT SUPPORTED!!!!!!!!1
          (keep (fn [node]
                  (cond
                    (hooks/vector-node? node)
                    ;; propagate the metadata attached to this vector in case there's a `:clj-kondo/ignore` form.
                    (let [symbol-node (first (:children node))]
                      (hooks.common/merge-ignored-linters symbol-node require-node node))

                    ;; this should also be dead code since we require requires to be vectors
                    (hooks/token-node? node)
                    (hooks.common/merge-ignored-linters node require-node)

                    :else
                    (printf "Don't know how to figure out what namespace is being required in %s\n" (pr-str node)))))
          args)))

(defn- ns-form-node->ns-symb [ns-form-node]
  (some-> (some (fn [node]
                  (when (and (hooks/token-node? node)
                             (not= (hooks/sexpr node) 'ns))
                    node))
                (:children ns-form-node))
          hooks/sexpr))

(defn- lint-modules [ns-form-node config]
  (let [ns-symb (ns-form-node->ns-symb ns-form-node)]
    (when-not (modules/ignored-namespace? config ns-symb)
      (when-let [current-module (modules/module ns-symb)]
        (let [required-namespace-symb-nodes (-> ns-form-node
                                                ns-form-node->require-node
                                                require-node->namespace-symb-nodes)]
          (doseq [node  required-namespace-symb-nodes
                  :when (not (contains? (hooks.common/ignored-linters node) :metabase/modules))
                  :let  [required-namespace (hooks/sexpr node)
                         error              (modules/usage-error config current-module required-namespace)]
                  :when error]
            (hooks/reg-finding! (assoc (meta node)
                                       :message error
                                       :type    :metabase/modules))))))))

(defn lint-ns [x]
  (doto (:node x)
    lint-require-shapes
    lint-requires-on-new-lines
    (lint-modules (modules/config x)))
  x)
