(ns hooks.clojure.core.require
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common.modules :as modules]))

(defn- lint* [node current-ns config required-namespaces]
  {:pre [(map? node)
         (simple-symbol? current-ns)
         (map? config)
         (sequential? required-namespaces)
         (every? simple-symbol? required-namespaces)]}
  (when-not (modules/ignored-namespace? config current-ns)
    ;; ignore namespaces outside of the module system
    (when-let [current-module (modules/module current-ns)]
      (doseq [required-namespace required-namespaces]
        ;; ignore namespaces outside of the module system.
        (when (modules/module required-namespace)
          (when-let [error (modules/usage-error config current-module required-namespace)]
            (hooks/reg-finding! (assoc (meta node)
                                       :message error
                                       :type    :metabase/modules))))))))

(defn- lint-dynamic-require* [node current-ns config]
  (when (and (not (modules/ignored-namespace? config current-ns))
             (modules/module current-ns))
    (hooks/reg-finding! (assoc (meta node)
                               :message "Module dependency cannot be statically determined from a dynamic require"
                               :type    :metabase/modules))))

(defn- quoted-require? [node]
  (or (= (hooks/tag node) :quote)
      (and (= (hooks/tag node) :list)
           (let [[x] (:children node)]
             (and (hooks/token-node? x)
                  (= (hooks/sexpr x) 'quote))))))

(defn- keyword-node? [node]
  (keyword? (hooks/sexpr node)))

(defn- unwrap-require [node]
  (case (hooks/tag node)
    ;; some.namespace of some.namespace/some-var
    :token
    (let [sexpr (hooks/sexpr node)]
      (if (qualified-symbol? sexpr)
        (symbol (namespace sexpr))
        sexpr))

    ;; (quote some.namespace)
    :list
    (let [[x y] (:children node)]
      (when (and (hooks/token-node? x)
                 (= (hooks/sexpr x) 'quote))
        (recur y)))

    ;; 'some.namespace
    :quote
    (recur (first (:children node)))

    ;; something like [some.namespace :as whatever]
    :vector
    (recur (first (:children node)))

    ;; anything else -- e.g. a runtime expression like `(requiring-resolve (:failing-test-var opts))` --
    ;; has no statically-known namespace
    nil))

(comment
  (unwrap-require (-> "(requiring-resolve 'metabase.notification.payload.execute/execute-dashboard)"
                      hooks/parse-string
                      :children
                      second)))

(defn- lint-require* [node current-ns config]
  (let [[_require & args]    (:children node)
        namespace-nodes     (remove keyword-node? args)
        static-nodes        (filter quoted-require? namespace-nodes)
        required-namespaces (->> (keep unwrap-require static-nodes)
                                 (filter simple-symbol?))]
    (lint* node current-ns config required-namespaces)
    (when (or (not= (count static-nodes) (count namespace-nodes))
              (not= (count required-namespaces) (count static-nodes)))
      (lint-dynamic-require* node current-ns config))))

(defn- lint-requiring-resolve* [node current-ns config]
  (let [[_requiring-resolve symb-node] (:children node)
        required-namespace             (unwrap-require symb-node)]
    (if (and (quoted-require? symb-node)
             (simple-symbol? required-namespace))
      (lint* node current-ns config [required-namespace])
      (lint-dynamic-require* node current-ns config))))

(defn lint-require [x]
  (lint-require* (:node x) (:ns x) (modules/config x))
  x)

(defn lint-requiring-resolve [x]
  (lint-requiring-resolve* (:node x) (:ns x) (modules/config x))
  x)
