(ns hooks.metabase.models.setting
  (:require [clj-kondo.hooks-api :as hooks]))

(defn defsetting
  "Rewrite a [[metabase.models.defsetting]] form like

    (defsetting my-setting \"Description\" :type :boolean)

  as

    (let [_ \"Description\"
          _ :type 
          _ :boolean]
      (defn my-setting \"Docstring.\" [])
      (defn my-setting! \"Docstring.\" [_value-or-nil]))

  for linting purposes."
  [{:keys [node]}]
  (let [[setting-name & args] (rest (:children node))
        ;; (defn my-setting [] ...)
        getter-node           (-> (list
                                   (hooks/token-node 'defn)
                                   setting-name
                                   (hooks/string-node "Docstring.")
                                   (hooks/vector-node []))
                                  hooks/list-node
                                  (with-meta (meta setting-name)))
        ;; (defn my-setting! [_x] ...)
        setter-node           (-> (list
                                   (hooks/token-node 'defn)
                                   (with-meta
                                     (hooks/token-node (symbol (str (:string-value setting-name) \!)))
                                     (meta setting-name))
                                   (hooks/string-node "Docstring.")
                                   (hooks/vector-node [(hooks/token-node '_value-or-nil)]))
                                  hooks/list-node
                                  (with-meta (meta setting-name)))]
    {:node (-> (list
                (hooks/token-node 'let)
                ;; include description and the options map so they can get validated as well.
                (hooks/vector-node (vec (interleave (repeat (hooks/token-node '_))
                                                    args)))
                getter-node
                setter-node)
               hooks/list-node
               (with-meta (meta node)))}))
