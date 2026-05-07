(ns hooks.clojure.core.with-redefs
  (:require
   [clj-kondo.hooks-api :as hooks]))

(def ^:private fn-building-heads
  "Head symbols that reliably produce a function value. We only use this on the *RHS* —
   if every binding's RHS is fn-shaped, the user is mocking functions and would be better
   served by `metabase.test.util.dynamic-redefs/with-dynamic-fn-redefs` (thread-safe). The
   set is deliberately small to minimise false positives — unrecognised shapes are left
   alone."
  '#{fn fn* constantly partial comp complement identity})

(defn- fn-shaped?
  "Heuristic: does this rewrite-clj node look like it evaluates to a function?

   Conservative — returns true only for cases we're confident about. A bare symbol (e.g. a
   previously-bound local or a var reference) is NOT considered fn-shaped because we can't
   tell without full resolution whether it's a function or a value.

   Two shapes match: `#(...)` reader literals (parsed by rewrite-clj as a distinct node
   with tag `:fn`, *not* a list node) and explicit list calls whose head is a known
   fn-building symbol (`fn`, `constantly`, `partial`, …)."
  [node]
  (or
   ;; `#(...)` reader literal — always a function by construction.
   (= :fn (hooks/tag node))
   ;; `(fn …)`, `(constantly …)`, `(partial …)`, etc.
   (and (hooks/list-node? node)
        (let [[head] (:children node)]
          (and (hooks/token-node? head)
               (symbol? (hooks/sexpr head))
               ;; Match unqualified name — `(clojure.core/fn ...)` also qualifies.
               (contains? fn-building-heads (symbol (name (hooks/sexpr head)))))))))

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
  (and (hooks/token-node? lhs)
       (symbol? (hooks/sexpr lhs))
       (let [resolved (hooks/resolve {:name (hooks/sexpr lhs)})
             ns-sym   (:ns resolved)]
         (and (symbol? ns-sym) ; not :clj-kondo/unknown-namespace
              (defn-arity? (hooks/ns-analysis ns-sym) (:name resolved))))))

(defn lint-with-redefs
  "Suggest `with-dynamic-fn-redefs` when every RHS is obviously a function AND every LHS
   is known to be a `defn`-style var.

   The LHS check uses kondo's own analysis cache rather than a hand-maintained list of
   multimethod names — adding a new `defmulti` doesn't require touching this hook."
  [{:keys [node]}]
  (let [[_with-redefs bindings-vec] (:children node)]
    (when (hooks/vector-node? bindings-vec)
      (let [pairs (partition-all 2 (:children bindings-vec))]
        (when (and (seq pairs)
                   (every? (fn [[lhs rhs]]
                             (and rhs
                                  (fn-shaped? rhs)
                                  (safely-nudgeable-lhs? lhs)))
                           pairs))
          (hooks/reg-finding!
           (assoc (meta node)
                  :message (str "Every binding here replaces a function — prefer "
                                "metabase.test/with-dynamic-fn-redefs for thread-safe "
                                "redefs. [:metabase/prefer-with-dynamic-fn-redefs]")
                  :type    :metabase/prefer-with-dynamic-fn-redefs))))))
  {:node node})
