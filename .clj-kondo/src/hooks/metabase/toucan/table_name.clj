(ns hooks.metabase.toucan.table-name
  "Lint that toucan2 model namespaces (those defining `t2/table-name`) live
  under `metabase[-enterprise]/<module>/models[/…]`.

  This wraps the methodical `defmethod` hook: we delegate to
  `hooks.methodical.macros/defmethod` for the actual analysis (so arg bindings
  etc. still work), and additionally check the file location when the
  multimethod being defined is `t2/table-name`."
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn- models-file? [filename]
  (boolean
   (and filename
        (re-find #"/(?:metabase|metabase_enterprise)/[^/]+/models(?:/|\.clj[cs]?$)"
                 filename))))

(defn- table-name-dispatch? [sym]
  (and (symbol? sym)
       (= (name sym) "table-name")
       (#{"t2" "toucan2.core"} (namespace sym))))

(defn lint-defmethod
  "Hook registered at the project level on `methodical.core/defmethod` (and
  `methodical.macros/defmethod`). Performs the table-name check, then
  delegates to the vendored methodical hook so kondo's normal analysis of the
  defmethod body still runs."
  [{:keys [filename node] :as input}]
  (let [[_defmethod multimethod & _args] (:children node)
        dispatch (when multimethod
                   (try (hooks/sexpr multimethod) (catch Exception _ nil)))]
    (when (and (table-name-dispatch? dispatch)
               (not (models-file? filename)))
      (hooks/reg-finding!
       (assoc (meta multimethod)
              :message (format "Toucan2 `table-name` defmethods must live under `<module>/models[/…]` (got %s)"
                               filename)
              :type :metabase/toucan-model-ns))))
  ;; Delegate to the vendored methodical defmethod hook so kondo's normal
  ;; analysis of the defmethod body still runs. Resolved lazily because
  ;; `hooks.methodical.macros` isn't on the classpath during `.clj-kondo/test`
  ;; unit-test runs.
  ((requiring-resolve 'hooks.methodical.macros/defmethod) input))
