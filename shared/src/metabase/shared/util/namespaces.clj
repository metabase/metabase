(ns metabase.shared.util.namespaces
  "Potemkin is Java-only, so here's a basic function-importing macro that works for both CLJS and CLJ.")

(defmacro import-fn
  "Imports a single defn from another namespace.
  This creates a new local function that calls through to the original, so that it reloads nicely in the REPL.
  `(import-fn ns b) => (defn b [& args] (apply ns/b args))`"
  ;; Heavily inspired by Potemkin.
  ([target]
   `(import-fn ~target nil))
  ([target sym]
   (let [defn-name (or sym (symbol (name target)))
         args      (gensym)]
     `(def ~defn-name (fn [& ~args] (apply ~target ~args))))))
