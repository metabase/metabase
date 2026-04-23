(ns hooks.clojure.core.with-redefs
  (:require
   [clj-kondo.hooks-api :as hooks]))

(def ^:private fn-building-heads
  "Head symbols that reliably produce a function value. If every RHS in a `with-redefs`
   form uses one of these, the user is mocking functions and would be better served by
   `metabase.test.util.dynamic-redefs/with-dynamic-fn-redefs` (thread-safe). We deliberately
   keep this set small to minimise false positives — unrecognised shapes are left alone."
  '#{fn fn* constantly partial comp complement identity})

(def ^:private multimethod-targets
  "Unqualified names of vars known to be multimethods. with-dynamic-fn-redefs refuses to proxy
   these at runtime (dispatch breaks and the JVM is polluted for other tests), so the nudge
   would be wrong. Hook can only see unqualified names reliably, so we match on name alone —
   this is a small, hand-curated list; extend it as new multimethod targets appear in tests."
  '#{send! can-read? can-query?})

(defn- multimethod-lhs?
  "Does any LHS in this binding list name a known multimethod?"
  [pairs]
  (some (fn [[lhs _rhs]]
          (and (hooks/token-node? lhs)
               (symbol? (hooks/sexpr lhs))
               (contains? multimethod-targets
                          (symbol (name (hooks/sexpr lhs))))))
        pairs))

(defn- fn-shaped?
  "Heuristic: does this rewrite-clj node look like it evaluates to a function?

   Conservative — returns true only for cases we're confident about. A bare symbol (e.g. a
   previously-bound local or a var reference) is NOT considered fn-shaped because we can't
   tell without full resolution whether it's a function or a value. `#(...)` literals are
   parsed as `(fn* [...] ...)` so they land in the list-node branch."
  [node]
  (and (hooks/list-node? node)
       (let [[head] (:children node)]
         (and (hooks/token-node? head)
              (symbol? (hooks/sexpr head))
              ;; Match unqualified name — `(clojure.core/fn ...)` also qualifies.
              (contains? fn-building-heads (symbol (name (hooks/sexpr head))))))))

(defn lint-with-redefs
  "Suggest `with-dynamic-fn-redefs` when every RHS in `with-redefs` is obviously a function.

   We fire only when all bindings look fn-shaped so we don't badger users mocking value defs
   (hierarchies, settings, maps) — those genuinely need `with-redefs`."
  [{:keys [node]}]
  (let [[_with-redefs bindings-vec] (:children node)]
    (when (hooks/vector-node? bindings-vec)
      (let [pairs (partition-all 2 (:children bindings-vec))]
        (when (and (seq pairs)
                   (every? (fn [[_lhs rhs]] (and rhs (fn-shaped? rhs))) pairs)
                   (not (multimethod-lhs? pairs)))
          (hooks/reg-finding!
           (assoc (meta node)
                  :message (str "Every binding here replaces a function — prefer "
                                "metabase.test/with-dynamic-fn-redefs for thread-safe "
                                "redefs. [:metabase/prefer-with-dynamic-fn-redefs]")
                  :type    :metabase/prefer-with-dynamic-fn-redefs))))))
  {:node node})
