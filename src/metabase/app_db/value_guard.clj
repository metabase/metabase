(ns metabase.app-db.value-guard
  "Enforces that every user-supplied value reaching the app DB is a bound `?` parameter.

  HoneySQL compiles a map in a value slot into SQL *structure*, so a value that arrives
  from a request can become SQL text. `[:param k]` is the only unambiguous way to say
  \"this is data, not syntax\" -- it always binds as `?`.

  Three pieces:
    - `auto-param` lets callers write the value inline as `[:param* v]` instead of keeping
      a separate `{:params ...}` map in sync.
    - `long*`/`longs` are coercions that are provably safe without `[:param]`, so the very
      common id/FK lookup stays readable.
    - `assert-values-wrapped!` is the guarantee: at the compile chokepoint, a value slot
      holding anything else throws.

  This is an allowlist, and deliberately separate from `metabase.app-db.honeysql-guard`,
  which is a blocklist of known-dangerous shapes and is backported to older versions."
  (:refer-clojure :exclude [longs])
  (:require
   [clojure.walk :as walk]
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- auto-param (GHY-4473) --------------------------------------------

(defn auto-param
  "Rewrite `[:param* v]` markers into HoneySQL's `[:param :kN]` plus the params map they refer to.
  Returns `[rewritten-form params-map]`, ready for `(sql/format form {:params params})`.

  Only acts on values that were explicitly marked. The guarantee that nothing was *missed* is
  `assert-values-wrapped!`, not this."
  [form]
  (let [params  (atom {})
        counter (atom 0)]
    [(walk/postwalk
      (fn [x]
        (if (and (vector? x) (= :param* (first x)))
          (let [k (keyword (str "p" (swap! counter inc)))]
            (swap! params assoc k (second x))
            [:param k])
          x))
      form)
     @params]))

;;; ------------------------------------------ coercions (GHY-4475) ----------------------------------------------

(defn long*
  "Coerce `x` to a long. Throws on anything that is not already a number, so a hostile
  non-scalar cannot reach a value slot through it. Named `long*` to avoid shadowing `clojure.core/long`."
  ^long [x]
  (long x))

(defn longs
  "Coerce a seq of ids to longs. Throws if any element is not a number."
  [xs]
  (into [] (map long*) xs))

;;; --------------------------------------- reject-unwrapped (GHY-4474) ------------------------------------------

;; Only these clause keys hold user values. `:select`/`:from`/`:order-by`/`:group-by` are
;; structure and are never inspected -- structure safety is the safe-app-db-layer's job
;; (Initiative 2), not this guard's.
(def ^:private value-clauses
  #{:where :having :set :values :join-by})

;; Operator -> which argument indexes are VALUE slots (0-based, after the op itself).
;; `nil` means "no direct values, recurse into every arg" (boolean connectives).
;; An operator absent from this table fails closed.
(def ^:private op-value-slots
  {:and nil, :or nil, :not nil
   :=  #{1}, :not= #{1}, :<> #{1}, :!= #{1}
   :<  #{1}, :>    #{1}, :<= #{1}, :>= #{1}
   :in #{1}, :not-in #{1}
   :like #{1}, :not-like #{1}, :ilike #{1}, :not-ilike #{1}
   :between #{1 2}
   :is #{1}, :is-not #{1}})

(defn- scalar?
  [x]
  (or (number? x) (string? x) (boolean? x) (nil? x)
      (inst? x) (uuid? x)))

(defn- param-form?
  [x]
  (and (sequential? x) (= :param (first x))))

(defn- allow-column-ref?
  [x]
  (boolean (some-> x meta :allow-column-ref)))

;; HoneySQL's `:%fn.col` shorthand compiles to a SQL function call, so the function name comes from
;; the keyword rather than from data. That is only true while the keyword is written literally in
;; source -- `(keyword (str "%" user-input))` would produce the same shape from user input -- so this
;; is a closed set enumerated from the codebase, not a `%`-prefix test. A new function call has to be
;; added here deliberately, which keeps the set auditable.
(def ^:private allowed-fn-call-keywords
  #{:%avg.running_time
    :%count.* :%count.id
    :%current_database :%current_schema :%database
    :%isnull.last_edit_first_name :%isnull.last_edit_last_name :%isnull.last_edit_timestamp
    :%lower.description :%lower.display_name :%lower.email :%lower.engine
    :%lower.first_name :%lower.last_name :%lower.metabase_field :%lower.name
    :%lower.schema :%lower.x
    :%max.collection_position :%max.id :%max.position :%max.started_at :%max.timestamp
    :%min.date_joined :%min.executor_id :%min.id
    :%now
    :%sum.total_tokens})

(defn- fn-call-keyword?
  "Whether `x` is a whitelisted HoneySQL `:%fn-name` function-call keyword."
  [x]
  (contains? allowed-fn-call-keywords x))

(defn- h2x-wrapper?
  "Whether `v` is an h2x value wrapper -- `[::h2x/typed expr info]` or `[::h2x/literal s]`.
  Both carry their payload at index 1."
  [v]
  (and (vector? v)
       (or (h2x/typed? v)
           (= ::h2x/literal (first v)))))

(defn- value-ok?
  "Whether `v` is acceptable in a value slot.

  `strict?` demands the project's full promise: a bound `[:param]` or a coercion result.
  Non-strict still rejects everything that can become SQL structure -- maps, `{:raw}`,
  `{:inline}`, subqueries, and bare keywords -- while letting plain scalars through, so
  the guard can run globally before the call-site sweep finishes."
  [v strict?]
  (cond
    (param-form? v)      true
    (allow-column-ref? v) true
    ;; `h2x/literal` splices an escaped string straight into SQL rather than binding it, so it
    ;; is only safe for the hardcoded constants its own docstring restricts it to. Check the
    ;; payload rather than trusting the wrapper.
    (h2x-wrapper? v)     (value-ok? (second v) strict?)
    (fn-call-keyword? v) true
    ;; Any other keyword in a value slot is indistinguishable from a column reference, which is
    ;; how a user-supplied keyword becomes an identifier. Always rejected.
    (keyword? v)         false
    (map? v)             false
    (sequential? v)      (every? #(value-ok? % strict?) v)
    (set? v)             (every? #(value-ok? % strict?) v)
    (scalar? v)          (not strict?)
    :else                false))

(declare ^:private check-clause!)

(defn- bad!
  [v ctx]
  (throw (ex-info (str "Unwrapped value in a SQL value slot: " (pr-str v)
                       ". Wrap it with [:param ...] or coerce it with (long* ...).")
                  (assoc ctx :type ::unwrapped-value, :value v))))

(defn- check-op!
  "Check one operator form, e.g. `[:= :id 5]`."
  [form ctx strict?]
  (let [[op & args] form]
    (if-not (contains? op-value-slots op)
      ;; Fail closed: an operator we have not classified might place a value anywhere.
      (throw (ex-info (str "Unrecognized SQL operator in a value clause: " (pr-str op)
                           ". Add it to op-value-slots with its value positions.")
                      (assoc ctx :type ::unknown-operator, :op op)))
      (if-let [slots (op-value-slots op)]
        (doseq [[i arg] (map-indexed vector args)]
          (if (contains? slots i)
            (when-not (value-ok? arg strict?)
              (bad! arg ctx))
            (check-clause! arg ctx strict?)))
        ;; Boolean connective: no direct values, every arg is another clause.
        (doseq [arg args]
          (check-clause! arg ctx strict?))))))

(defn- check-clause!
  [form ctx strict?]
  (when (and (sequential? form) (keyword? (first form)) (not (param-form? form)))
    (check-op! form ctx strict?)))

(defn assert-values-wrapped!
  "Throw if any value slot in the compiled `query` holds something that could become SQL.
  Inspects only the clauses that carry user values; structure clauses are left alone."
  ([query] (assert-values-wrapped! query {} false))
  ([query ctx strict?]
   (when (map? query)
     (doseq [k value-clauses
             :when (contains? query k)]
       (let [clause (get query k)
             ctx    (assoc ctx :clause k)]
         (case k
           ;; :set is a column->value map; :values is a seq of such maps or rows.
           :set    (doseq [v (vals clause)]
                     (when-not (value-ok? v strict?) (bad! v ctx)))
           :values (doseq [row clause, v (if (map? row) (vals row) row)]
                     (when-not (value-ok? v strict?) (bad! v ctx)))
           (check-clause! clause ctx strict?)))))
   query))

;; Modules that have completed the value-slot sweep and are held to the full promise:
;; every value is a bound param or a coercion. Grows as GHY-4477 lands modules.
(def ^:private strict-modules #{})

(defn- strict-model?
  [model]
  (contains? strict-modules (some-> model namespace)))

(methodical/defmethod t2.pipeline/compile :before :default
  [_query-type model built-query]
  (assert-values-wrapped! built-query {:model model} (strict-model? model))
  built-query)

(defn keep-me
  "No-op so requiring namespaces can reference this ns without the linter pruning it."
  [])
