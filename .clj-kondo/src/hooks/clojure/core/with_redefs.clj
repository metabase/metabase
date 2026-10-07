(ns hooks.clojure.core.with-redefs
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn- ns-analysis
  "Like `hooks/ns-analysis`, but nil when kondo can't read the namespace's cache entry."
  [ns-sym]
  ;; kondo throws on the cache of a cljc namespace with `:deprecated` metadata, e.g. `metabase.legacy-mbql.util`.
  (try
    (hooks/ns-analysis ns-sym)
    (catch Exception _ nil)))

(defn- defn-arity?
  "Look up `var-sym` in the `:clj` side of `analysis` (the result of `hooks/ns-analysis`, keyed by language)
   and return true iff kondo recorded a non-empty arity for it. clj-kondo only emits
   arities for `defn`-style fns — `defmulti` and plain `def` have neither `:fixed-arities`
   nor `:varargs-min-arity`, so the presence of either is a clean, dynamic signal that
   the var is a regular function we can safely nudge.
   Follows `potemkin/import-vars` re-exports to the defining namespace; false if that is ambiguous.

   We coerce to boolean and `seq`-check `:fixed-arities` so a hypothetical empty set
   doesn't leak through as truthy. The smoke test in `with-redefs-test` empirically
   verifies the \"arities iff `defn`\" invariant against a real `clj-kondo` run — if a
   future kondo release starts emitting arities for `defmulti` it will fail there
   rather than silently producing wrong nudges."
  ([analysis var-sym]
   (defn-arity? analysis var-sym #{}))
  ([analysis var-sym seen]
   (boolean
    (or (when-let [v (get-in analysis [:clj var-sym])]
          (or (seq (:fixed-arities v))
              (:varargs-min-arity v)))
        ;; Kondo's `hooks/ns-analysis` strips each var's `:imported-ns`, so search every namespace this one re-exports
        ;; from. Any of them could be the one the var was imported from, so all must be readable, and all that define
        ;; the name must be defns.
        ;; Only the namespaces on the current path are in `seen`, so a source reached by two routes is still followed.
        (let [proxied (into {} (for [ns-sym (get-in analysis [:clj :proxied-namespaces])
                                     :when  (not (seen ns-sym))]
                                 [ns-sym (:clj (ns-analysis ns-sym))]))
              ;; Skip private vars: a renamed import can share its name with an unrelated private var in a source.
              sources (for [[ns-sym vars] proxied
                            :let  [v (get vars var-sym)]
                            :when (and v (not (:private v)))]
                        ns-sym)]
          (and (every? some? (vals proxied))
               (seq sources)
               (every? #(defn-arity? {:clj (proxied %)} var-sym (conj seen %)) sources)))))))

(defn- safely-nudgeable-lhs?
  "Is this LHS a regular function (defn) according to kondo's analysis?

   Returns false for:
     - unresolved symbols (e.g. namespace alias not in scope, ns not yet analysed)
     - vars defined by `defmulti` (no arity recorded)
     - vars defined by `def` (no arity recorded)
   Returns true only when kondo has arity info for the var, which is the case for `defn`
   and `defn-`. This means the nudge fires only when we're sure the target is a plain
   function — no manual list of multimethod targets to maintain.

   We deliberately bias toward false (skip the nudge) when uncertain. The cost of a missed
   nudge is small; the cost of a wrong nudge is a runtime error from
   `with-dynamic-fn-redefs` refusing to proxy a multimethod."
  [lhs]
  (and (hooks/token-node? lhs)
       (symbol? (hooks/sexpr lhs))
       (let [resolved (hooks/resolve {:name (hooks/sexpr lhs)})
             ns-sym   (:ns resolved)]
         (and (symbol? ns-sym) ; not :clj-kondo/unknown-namespace
              (defn-arity? (ns-analysis ns-sym) (:name resolved))))))

(defn lint-with-redefs
  "Suggest `with-dynamic-fn-redefs` when every LHS is known to be a `defn`-style var.

   We don't gate on the RHS — `with-dynamic-fn-redefs` accepts any `IFn` replacement
   (fns, keywords, colls), and the LHS check alone is enough to know the form is
   migratable as a whole. The `every?` keeps it whole-form: mixed bindings that include
   a non-defn LHS (defmulti, plain `def`, unresolved) can't be split usefully — the
   leftover `with-redefs` still does a global root-swap, so the form remains thread-unsafe.

   The LHS check uses kondo's own analysis cache rather than a hand-maintained list of
   multimethod names — adding a new `defmulti` doesn't require touching this hook."
  [{:keys [node lang]}]
  (let [[_with-redefs bindings-vec] (:children node)]
    ;; The `with-dynamic-fn-redefs` macro is clj-only, so a var only counts as a defn by its clj definition.
    (when (and (= :clj lang) (hooks/vector-node? bindings-vec))
      (let [pairs (partition-all 2 (:children bindings-vec))]
        (when (and (seq pairs)
                   (every? (fn [[lhs rhs]]
                             (and rhs (safely-nudgeable-lhs? lhs)))
                           pairs))
          (hooks/reg-finding!
           (assoc (meta node)
                  :message (str "Every binding here redefines a defn-style var — prefer "
                                "metabase.test/with-dynamic-fn-redefs for thread-safe "
                                "redefs. [:metabase/prefer-with-dynamic-fn-redefs]")
                  :type    :metabase/prefer-with-dynamic-fn-redefs))))))
  {:node node})
