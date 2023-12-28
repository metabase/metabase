(ns hooks.metabase.models.setting
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common :as common]))

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
                                  (with-meta (meta node)))
        ;; (defn my-setting! [_x] ...)
        setter-node           (-> (list
                                   (hooks/token-node 'defn)
                                   (with-meta
                                     (hooks/token-node (symbol (str (hooks/sexpr setting-name) \!)))
                                     (meta setting-name))
                                   (hooks/string-node "Docstring.")
                                   (hooks/vector-node [(hooks/token-node '_value-or-nil)]))
                                  hooks/list-node
                                  (with-meta (update (meta node) :clj-kondo/ignore #(hooks/vector-node (cons :clojure-lsp/unused-public-var (:children %))))))]
    {:node (-> (list
                (hooks/token-node 'let)
                ;; include description and the options map so they can get validated as well.
                (hooks/vector-node (vec (interleave (repeat (common/with-macro-meta (hooks/token-node '_) node))
                                                    args)))
                getter-node
                setter-node)
               hooks/list-node
               (with-meta (meta node)))}))

(comment
  (defn- defsetting* [form]
    (hooks/sexpr
     (:node
      (defsetting
        {:node
         (hooks/parse-string
          (with-out-str
            (clojure.pprint/pprint
             form)))}))))

  (defn- x []
    (defsetting*
      '(defsetting active-users-count
         (deferred-tru "Cached number of active users. Refresh every 5 minutes.")
         :visibility :admin
         :type       :integer
         :default    0
         :getter     (fn []
                       (if-not ((requiring-resolve 'metabase.db/db-is-set-up?))
                         0
                         (cached-active-users-count)))))))
