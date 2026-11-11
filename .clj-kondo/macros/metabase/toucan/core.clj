(ns macros.metabase.toucan.core)

(defmacro define-batched-hydrate
  [& args]
  `(methodical.core/defmethod toucan2.core/batched-hydrate ~@args))

(defmacro define-model-for-automagic-hydration
  [& args]
  `(methodical.core/defmethod toucan2.core/model-for-automagic-hydration ~@args))

(defmacro define-primary-keys
  [& args]
  `(methodical.core/defmethod toucan2.core/primary-keys ~@args))

(defmacro define-simple-hydrate
  [& args]
  `(methodical.core/defmethod toucan2.core/simple-hydrate ~@args))

(defmacro define-table-name
  [& args]
  `(methodical.core/defmethod toucan2.core/table-name ~@args))
