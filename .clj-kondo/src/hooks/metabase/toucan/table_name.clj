(ns hooks.metabase.toucan.table-name
  "Lint that toucan2 model namespaces live under
  `metabase[-enterprise].<module>.models[.<model>]`.

  This wraps the methodical `defmethod` hook: we delegate to
  `hooks.methodical.macros/defmethod` for the actual analysis (so arg bindings
  etc. still work), and additionally check the containing namespace when the
  multimethod is `t2/table-name`.

  Hooks don't otherwise have access to the containing namespace, so
  [[capture-current-ns!]] is called from the `ns` hook to stash the ns of the
  file currently being linted."
  (:require
   [clj-kondo.hooks-api :as hooks]))

(def ^:private current-ns
  "Populated by `hooks.clojure.core.ns/lint-ns` with the namespace symbol of
  the file currently being linted."
  (atom nil))

(defn capture-current-ns! [ns-symb]
  (reset! current-ns ns-symb))

(defn- models-namespace?
  "True if `ns-symb` lives under a `.models` namespace of some module, i.e.
  matches `metabase[-enterprise].<module>.models` or
  `metabase[-enterprise].<module>.models.<anything>`."
  [ns-symb]
  (let [s (str ns-symb)]
    (boolean
     (or (re-find #"^metabase\.[^.]+\.models(?:\..+)?$" s)
         (re-find #"^metabase-enterprise\.[^.]+\.models(?:\..+)?$" s)))))

(defn- table-name-dispatch? [sym]
  (and (symbol? sym)
       (= (name sym) "table-name")
       (#{"t2" "toucan2.core"} (namespace sym))))

(defn- check-multimethod! [multimethod-node]
  (when multimethod-node
    (let [dispatch (try (hooks/sexpr multimethod-node) (catch Exception _ nil))]
      (when (table-name-dispatch? dispatch)
        (let [ns-symb @current-ns]
          (when (and ns-symb (not (models-namespace? ns-symb)))
            (hooks/reg-finding!
             (assoc (meta multimethod-node)
                    :message (format (str "Toucan2 model namespace `%s` should live under "
                                          "`metabase[-enterprise].<module>.models[.<model>]` "
                                          "[:metabase/toucan-model-ns]")
                                     ns-symb)
                    :type :metabase/toucan-model-ns))))))))

(defn lint-defmethod
  "Hook registered at the project level on `methodical.core/defmethod` (and
  `methodical.macros/defmethod`). Performs the table-name check, then
  delegates to the vendored methodical hook so kondo's normal analysis of the
  defmethod body still runs."
  [{{[_defmethod multimethod & _args] :children} :node, :as input}]
  (check-multimethod! multimethod)
  ;; Delegate to the vendored methodical defmethod hook so kondo's normal
  ;; analysis of the defmethod body still runs. Resolved lazily because
  ;; `hooks.methodical.macros` isn't on the classpath during `.clj-kondo/test`
  ;; unit-test runs.
  ((requiring-resolve 'hooks.methodical.macros/defmethod) input))
