(ns hooks.clojure.core.with-redefs
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]))

(def ^:private dynamic-redefs-prohibited-vars
  "Functions that are cheap and called frequently enough that permanently installing the
   `with-dynamic-fn-redefs` proxy would measurably tax the rest of the test JVM.

   Keep this list intentionally narrow. Add a var only when a concrete test needs to
   redefine it and it is known to be a hot path; the `with-redefs` lint message prompts
   callers to make that assessment."
  '#{clojure.java.io/file
     clojure.java.io/resource
     clojure.tools.logging/log*
     java-time.api/zoned-date-time
     metabase.analytics-interface.core/inc!
     metabase.analytics-interface.core/observe!
     metabase.analytics-interface.core/set-gauge!
     metabase.lib.metadata.protocols/table
     metabase.lib.util.unique-name-generator/truncate-alias})

(defn- resolved-lhs-symbol [lhs]
  (when (and (hooks/token-node? lhs)
             (symbol? (hooks/sexpr lhs)))
    (let [{:keys [ns name]} (hooks/resolve {:name (hooks/sexpr lhs)})]
      (when (and (symbol? ns) ; not :clj-kondo/unknown-namespace
                 (symbol? name))
        (symbol (str ns) (clojure.core/name name))))))

(defn- dynamic-redefs-prohibited-lhs? [lhs]
  (contains? dynamic-redefs-prohibited-vars (resolved-lhs-symbol lhs)))

(defn- defn-arity?
  "Look up `var-sym` in `analysis` (the result of `hooks/ns-analysis`, keyed by language)
   and return true iff kondo recorded a non-empty arity for it. clj-kondo only emits
   arities for `defn`-style fns — `defmulti` and plain `def` have neither `:fixed-arities`
   nor `:varargs-min-arity`, so the presence of either is a clean, dynamic signal that
   the var is a regular function we can safely nudge.

   We coerce to boolean and `seq`-check `:fixed-arities` so a hypothetical empty set
   doesn't leak through as truthy. The smoke test in `with-redefs-test` empirically
   verifies the \"arities iff `defn`\" invariant against a real `clj-kondo` run — if a
   future kondo release starts emitting arities for `defmulti` it will fail there
   rather than silently producing wrong nudges."
  [analysis var-sym]
  (boolean
   (some (fn [lang-vars]
           (when-let [v (get lang-vars var-sym)]
             (or (seq (:fixed-arities v))
                 (:varargs-min-arity v))))
         (vals analysis))))

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
  (when-let [resolved (resolved-lhs-symbol lhs)]
    (defn-arity? (hooks/ns-analysis (symbol (namespace resolved)))
      (symbol (name resolved)))))

(defn lint-with-redefs
  "Suggest `with-dynamic-fn-redefs` when every LHS is known to be a `defn`-style var.

   We don't gate on the RHS — `with-dynamic-fn-redefs` accepts any `IFn` replacement
   (fns, keywords, colls), and the LHS check alone is enough to know the form is
   migratable as a whole. The `every?` keeps it whole-form: mixed bindings that include
   a non-defn LHS (defmulti, plain `def`, unresolved) can't be split usefully — the
   leftover `with-redefs` still does a global root-swap, so the form remains thread-unsafe.

   The LHS check uses kondo's own analysis cache rather than a hand-maintained list of
   multimethod names — adding a new `defmulti` doesn't require touching this hook."
  [{:keys [node]}]
  (let [[_with-redefs bindings-vec] (:children node)]
    (when (hooks/vector-node? bindings-vec)
      (let [pairs (partition-all 2 (:children bindings-vec))]
        (when (and (seq pairs)
                   (not-any? (comp dynamic-redefs-prohibited-lhs? first) pairs)
                   (every? (fn [[lhs rhs]]
                             (and rhs (safely-nudgeable-lhs? lhs)))
                           pairs))
          (hooks/reg-finding!
           (assoc (meta node)
                  :message (str "Every binding here redefines a defn-style var. Before converting, "
                                "consider whether any target is a cheap, frequently called test hot "
                                "path; if so, add it to `dynamic-redefs-prohibited-vars` in "
                                "`hooks.clojure.core.with-redefs` and keep synchronized `with-redefs`. "
                                "Otherwise prefer `metabase.test/with-dynamic-fn-redefs` for "
                                "thread-safe redefs. [:metabase/prefer-with-dynamic-fn-redefs]")
                  :type    :metabase/prefer-with-dynamic-fn-redefs))))))
  {:node node})

(defn lint-with-dynamic-fn-redefs
  "Reject dynamic redefs of functions whose permanently installed proxy would impose
   meaningful suite-wide overhead."
  [{:keys [node]}]
  (let [[_with-dynamic-fn-redefs bindings-vec] (:children node)]
    (when (hooks/vector-node? bindings-vec)
      (let [prohibited-vars (->> (:children bindings-vec)
                                 (take-nth 2)
                                 (keep resolved-lhs-symbol)
                                 (filter dynamic-redefs-prohibited-vars)
                                 distinct
                                 sort
                                 vec)]
        (when (seq prohibited-vars)
          (hooks/reg-finding!
           (assoc (meta node)
                  :message (format (str "Do not use `with-dynamic-fn-redefs` with %s: its proxy "
                                        "would add suite-wide overhead to a hot path. Use `with-redefs` "
                                        "in a `^:synchronized` test instead. "
                                        "[:metabase/no-dynamic-fn-redefs-on-hot-path]")
                                   (str/join ", " (map #(str "`" % "`") prohibited-vars)))
                  :type :metabase/no-dynamic-fn-redefs-on-hot-path))))))
  {:node node})
