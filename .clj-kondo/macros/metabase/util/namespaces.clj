(ns macros.metabase.util.namespaces)

(defn- re-export
  "A `def` of `new-name` re-exporting `sym`. The `:metabase/imports` metadata names the source var for the ratchet
  tooling (mage.kondo-ratchet/alias-edges)."
  [sym new-name]
  `(def ~(vary-meta new-name assoc :metabase/imports (str sym)) "docstring" ~sym))

(defmacro import-fn
  "Kondo macro replacement for [[metabase.util.namespaces/import-fn]]."
  ([sym]
   (re-export sym (-> sym name symbol)))
  ([sym name]
   (re-export sym name)))

(defmacro import-macro
  "Kondo macro replacement for [[metabase.util.namespaces/import-macro]]."
  [sym]
  (re-export sym (-> sym name symbol)))
