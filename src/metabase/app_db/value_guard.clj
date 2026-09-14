(ns metabase.app-db.value-guard
  "Enforces that every user-supplied value reaching the app DB is a bound `?` parameter.

  HoneySQL compiles a map in a value slot into SQL *structure*, so a value that arrives
  from a request can become SQL text. `[:param k]` is the only unambiguous way to say
  \"this is data, not syntax\" -- it always binds as `?`.

  Three pieces:
    - `auto-param` lets callers write the value inline as `[:param* v]` instead of keeping
      a separate `{:params ...}` map in sync.
    - `assert-values-wrapped!` is the check: a value slot holding anything else throws.
      It is not yet installed at the Toucan compile step -- see the rollout note at the
      bottom of this namespace.

  This is an allowlist, and deliberately separate from `metabase.app-db.honeysql-guard`,
  which is a blocklist of known-dangerous shapes and is backported to older versions."
  (:require
   [clojure.walk :as walk]
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [toucan2.honeysql2 :as t2.honeysql]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- auto-param (GHY-4473) --------------------------------------------

(defn auto-param
  "Rewrite `[:auto/param v]` markers into HoneySQL's `[:param :kN]` plus the params map they refer to.

  The marker only protects a value once this has run. HoneySQL itself does not recognise it and
  compiles it as a function call over its argument, so a marker handed straight to `sql/format`
  splices its payload into the SQL rather than binding it. Queries that go through Toucan are
  rewritten here at the compile step; `assert-values-wrapped!` rejects a marker that arrives
  anywhere else.
  Returns `[rewritten-form params-map]`.

  Called by the compile step, so a caller writes `[:auto/param v]` inline and never handles the
  params map. Only acts on values that were explicitly marked; the guarantee that nothing was
  *missed* is `assert-values-wrapped!`."
  [form]
  (let [params  (atom {})
        counter (atom 0)]
    [(walk/postwalk
      (fn [x]
        (if (and (vector? x) (= :auto/param (first x)))
          (let [k (keyword (str "p" (swap! counter inc)))]
            (swap! params assoc k (second x))
            [:param k])
          x))
      form)
     @params]))

;;; --------------------------------------- reject-unwrapped (GHY-4474) ------------------------------------------

;; Only these clause keys hold user values. `:select`/`:from`/`:order-by`/`:group-by` are
;; structure and are never inspected -- structure safety is the safe-app-db-layer's job
;; (Initiative 2), not this guard's.
;; Clauses that hold only SQL structure -- table names, column references, orderings. Everything
;; else in a query may hold a value, so it is checked.
;;
;; Listing the structure clauses rather than the value clauses is deliberate: HoneySQL has ~92
;; clauses and gains more over time, and a clause nobody classified should be inspected rather than
;; skipped. Getting this backwards means a value slot is silently unchecked.
(def ^:private structure-only-clauses
  #{:select :select-distinct :select-distinct-on :select-top :select-distinct-top
    :from :into :bulk-collect-into :table :columns :exclude :rename
    :order-by :group-by :partition-by
    :limit :offset :fetch
    :distinct :for :lock :with-data
    :alter-table :add-column :drop-column :alter-column :modify-column :rename-column
    :add-index :drop-index :rename-table :create-table :create-table-as :with-columns
    :create-view :create-or-replace-view :create-materialized-view :create-extension
    :drop-table :drop-view :drop-materialized-view :drop-extension :refresh-materialized-view
    :create-index :truncate :delete :delete-from :erase-from :update :insert-into
    :patch-into :replace-into :on-constraint :do-nothing :returning})

;; `:set`, `:values` and `:do-update-set` map a column to a value rather than holding a clause, so
;; they are checked as rows instead of walked as operator forms.
(def ^:private value-map-clauses
  #{:set :do-update-set :on-duplicate-key-update})

(defn- value-bearing-clauses
  "The keys of `query` that may hold a value."
  [query]
  (remove structure-only-clauses (keys query)))

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
   :is #{1}, :is-not #{1}
   ;; Takes a subquery rather than a value. Its argument is checked as a value like any other,
   ;; so an unmarked subquery is still rejected and a marked one has its own values checked.
   :exists #{0}})

;; `inst?` only covers java.util.Date and Instant, but Toucan hands java.time values
;; (ZonedDateTime for hook-added timestamps, LocalDate, ...) straight through to JDBC.
;; All of them bind as parameters rather than compiling to SQL.
(defn- temporal?
  [x]
  (instance? java.time.temporal.Temporal x))

(defn- scalar?
  [x]
  (or (number? x) (string? x) (boolean? x) (nil? x)
      (inst? x) (temporal? x) (uuid? x)
      (bytes? x)))

(defn- param-form?
  [x]
  (and (sequential? x) (= :param (first x))))

(defn- auto-param-form?
  [x]
  (and (sequential? x) (= :auto/param (first x))))

(declare ^:private check-nested!)

(defn- allow-column-ref?
  [x]
  (boolean (some-> x meta :allow-column-ref)))

;; `honeysql-guard` already requires a deliberate subquery or raw splice to be marked, and ~217
;; sites carry those markers. Honour the same vocabulary rather than inventing a second one.
(defn- marked-dev-authored?
  [x]
  (let [m (meta x)]
    (boolean (or (:allow-subquery m) (:allow-raw-sql m)))))

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
    ;; The compile step lifts these, so one still present here reached the database another way.
    ;; HoneySQL does not know the marker and compiles it as a function call over its argument --
    ;; `[:auto/param {:raw "(SELECT ...)"}]` becomes `PARAM ((SELECT ...))`, splicing the payload
    ;; into the SQL. An unlifted marker is therefore an injection, not merely wrong SQL.
    (auto-param-form? v) (throw (ex-info "[:auto/param ...] reached the database unresolved."
                                         {:type ::unresolved-auto-param, :value v}))
    (allow-column-ref? v) true
    ;; A marker asserts the *structure* is dev-authored. It says nothing about the values inside,
    ;; which are just as reachable, so descend into the subquery rather than passing it wholesale.
    ;; `check-nested!` throws on the offending leaf so the error names it rather than this container.
    (marked-dev-authored? v) (do (check-nested! v strict?) true)
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
                       ". Mark it with [:auto/param ...] so it is bound as a parameter.")
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

(defn- join-clause?
  "Whether `k` is a join, whose value is `[target on-condition]` -- only the condition holds values."
  [k]
  (and (keyword? k) (re-find #"join" (name k))))

(defn- check-one-clause!
  "Check whatever `clause` holds, according to the shape the clause key implies."
  [k clause ctx strict?]
  (cond
    (contains? value-map-clauses k)
    (doseq [v (vals clause)]
      (when-not (value-ok? v strict?) (bad! v ctx)))

    (= :values k)
    (doseq [row clause, v (if (map? row) (vals row) row)]
      (when-not (value-ok? v strict?) (bad! v ctx)))

    ;; `{:left-join [[:collection :c] [:= :c.id ...]]}` -- a flat sequence alternating join target
    ;; and ON condition. A target is `[table alias]`, a condition starts with an operator, so the
    ;; operator table is what tells them apart; anything else here is a table name.
    (join-clause? k)
    (doseq [part clause
            :when (and (sequential? part) (contains? op-value-slots (first part)))]
      (check-clause! part ctx strict?))

    :else
    (check-clause! clause ctx strict?)))

(defn- check-nested!
  "Check the value slots of a nested query, throwing on the first bad leaf. Used for subqueries
  carrying a dev-authored marker -- the marker blesses the SQL, not the values inside it."
  [query strict?]
  (doseq [k (value-bearing-clauses query)]
    (check-one-clause! k (get query k) {:clause k} strict?)))

(defn assert-values-wrapped!
  "Throw if any value slot in the compiled `query` holds something that could become SQL.
  Inspects only the clauses that carry user values; structure clauses are left alone."
  ([query] (assert-values-wrapped! query {} false))
  ([query ctx strict?]
   (when (map? query)
     (doseq [k (value-bearing-clauses query)]
       (check-one-clause! k (get query k) (assoc ctx :clause k) strict?)))
   query))

;;; ----------------------------------------------- adoption ----------------------------------------------------

;; Namespaces that have wrapped their own value slots and want the check enforced. A query issued
;; from anywhere else compiles exactly as before, so this rolls out one `db.clj` at a time rather
;; than as a single global switch. Entries are namespace prefixes, so `metabase.collections.` covers
;; a whole module once it is ready.
;;
;; The set is the audit surface: it is the list of namespaces where a value slot is known to hold
;; only values. Keeping it here rather than in a per-file marker means one place to read.
(def enforcing-namespace-prefixes
  "Namespace prefixes whose app-DB queries are checked. Referenced by the clj-kondo hook so a call
  site inside these namespaces can also be checked at author time."
  #{"metabase.content-translation.db"})

;; Clojure munges `-` to `_` in class names, so match against the munged form.
(def ^:private enforcing-class-prefixes
  (into #{} (map #(.replace ^String % "-" "_")) enforcing-namespace-prefixes))

(defn- enforcing-caller?
  "Whether this query was issued from a namespace that has adopted the check.

  Reads the call stack rather than an ambient binding: the check runs inside Toucan's compile step,
  which is several frames below the caller, and a dynamic var would have to be threaded through
  Toucan internals and would not survive a thread hand-off. The stack already carries the answer."
  []
  (let [frames (.getStackTrace (Throwable.))]
    (loop [i 0]
      (if (>= i (alength frames))
        false
        (let [cls (.getClassName ^StackTraceElement (aget frames i))]
          (if (some #(.startsWith cls ^String %) enforcing-class-prefixes)
            true
            (recur (inc i))))))))

(methodical/defmethod t2.pipeline/compile :around :default
  [query-type model built-query]
  (let [[query params] (auto-param built-query)]
    (when (enforcing-caller?)
      (assert-values-wrapped! query {:model model} false))
    (if (seq params)
      ;; HoneySQL takes params as a format option rather than a query clause, so hand them over
      ;; the same channel Toucan uses for the rest of its formatting options.
      (binding [t2.honeysql/*options* (assoc (t2.honeysql/options) :params params)]
        (next-method query-type model query))
      (next-method query-type model built-query))))

(defn keep-me
  "No-op so a requiring namespace can reference this one without the linter pruning the require."
  [])

;; A note on `[:param ...]`, which is the form the coercions above are a fallback for.
;;
;; HoneySQL binds a `[:param :k]` against a separate `{:params {:k v}}` map, and that map cannot
;; currently reach HoneySQL through Toucan: `honeysql-guard` walks the query map and rejects any
;; unmarked nested map, so a `:params` key is refused before the query compiles. Verified against a
;; real query -- `(t2/select :model/X {:where [:= :k [:param :p]] :params {:p "v"}})` throws
;; "A forbidden HoneySQL clause reached the app-DB compile step".
;;
;; So `[:param]` is not usable through Toucan today, and an adopting namespace coerces instead.
;; Making `[:param]` work needs `honeysql-guard` taught to allow a `:params` map, which is a change
;; to a namespace that is backported to older versions and is therefore left alone here.
