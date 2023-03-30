(ns metabase.shared.util.namespaces
  "Potemkin is Java-only, so here's a basic function-importing macro that works for both CLJS and CLJ."
  (:require
   [net.cgrand.macrovich :as macros]
   [potemkin :as p]))

(defn- arity-form
  "Generate the form for a given arity with `arglist` for a `defn` form created by [[-redef]]."
  [imported-symbol arglist]
  (let [variadic?          (some (partial = '&) arglist)
        simplified-arglist (mapv (fn [arg]
                                   (if (symbol? arg)
                                     arg
                                     (gensym "arg-")))
                                 arglist)]
    (list simplified-arglist
          (cond->> (list* imported-symbol (remove (partial = '&) simplified-arglist))
            variadic? (cons 'apply)))))

(defn- defn-form
  "Generate the `defn` form for [[-redef]]."
  [imported-symbol defn-name docstring arglists]
  `(defn ~defn-name
     ~docstring
     ;; ClojureScript seems to ignore this metadata anyway, oh well. Make sure we re-quote arglists so the reader
     ;; doesn't try to evaluate them.
     {:arglists '~arglists}
     ~@(for [arglist arglists]
         (arity-form imported-symbol arglist))))

(defmacro -redef
  "Impl for [[import-fn]] and [[import-fns]]."
  [imported-symbol created-symbol]
  {:pre [(qualified-symbol? imported-symbol)
         ((some-fn nil? simple-symbol?) created-symbol)]}
  ;; In ClojureScript compilation, `imported-symbol` will come in like `u/format-seconds` instead of
  ;; `metabase.util/format-seconds`, thus we'll need to use [[cljs.analyzer/resolve-symbol]] to resolve it to the real
  ;; unaliased version.
  (let [resolve-symbol    (macros/case
                            :cljs (requiring-resolve 'cljs.analyzer/resolve-symbol)
                            :clj  identity)
        imported-var      (requiring-resolve (resolve-symbol imported-symbol))
        imported-metadata (meta imported-var)
        metadata          (merge
                           {:doc      "docstring"
                            :arglists '([& args])}
                           ;; preserve important metadata from the imported var.
                           imported-metadata
                           ;; preserve metadata attached to the symbol(s) passed in to import-fn(s).
                           (meta created-symbol)
                           (meta imported-symbol))
        defn-name         (-> (or created-symbol (symbol (name imported-symbol)))
                              ;; attach everything except for `:doc` and `:arglists` to the symbol we're deffing; we'll
                              ;; deal with `:doc` and `:arglists` separately.
                              (with-meta (dissoc metadata :doc :arglists)))]
    (defn-form imported-symbol defn-name (:doc metadata) (:arglists metadata))))

(defmacro import-fn
  "Imports a single defn from another namespace.
  This creates a new local function that calls through to the original, so that it reloads nicely in the REPL.
  `(import-fn ns/b)          => (defn b [& args] (apply ns/b args))`
  `(import-fn ns/b alt-name) => (defn alt-name [& args] (apply ns/b args))`"
  ;; Heavily inspired by Potemkin.
  ([target]
   `(import-fn ~target nil))
  ([target sym]
   `(-redef ~target ~sym)))

(defmacro import-fns
  "Imports defns from other namespaces.
  This uses [[import-fn]] to create pass-through local functions that reload nicely.
  `(import-fns [ns1 f1 f2 f3] [ns2 f4 f5])` creates `f1` that calls `ns1/f1`, `f2` that calls `ns1/f2`, etc.
  If you need to rename a function, instead of just the function name, pass `[original new-name]`."
  [& spaces]
  (macros/case
    :cljs `(do
             ~@(for [[target-ns & fns] spaces
                     f                 fns
                     :let [target-sym (if (vector? f) (first f)  f)
                           new-sym    (if (vector? f) (second f) f)
                           target     (symbol (name target-ns) (name target-sym))]]
                 `(-redef ~target ~new-sym)))
    :clj  `(p/import-vars ~@spaces)))
