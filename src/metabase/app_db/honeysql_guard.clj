(ns metabase.app-db.honeysql-guard
  (:require
   [honey.sql :as sql]
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [toucan2.honeysql2 :as t2.honeysql]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.identity-query :as t2.identity-query])
  (:import
   (toucan2.tools.identity_query IdentityQuery)))

(set! *warn-on-reflection* true)

(comment t2.identity-query/keep-me)

;;; --------------------------------------------- structural markers ---------------------------------------------------
;;;
;;; JSON decoding keywordizes object keys, so a request body can arrive shaped like a HoneySQL map (`{:select ...}`,
;;; `{:raw ...}`), which HoneySQL would honor as query syntax. A JSON array cannot: its elements are never
;;; keywordized. These checks are position-free -- a `{:raw ...}` map or a `[:raw ...]` form is unsafe wherever it
;;; appears -- so the walk that applies them needs no per-clause knowledge.

(defn- allow-subquery?  [x] (boolean (some-> x meta :allow-subquery)))
(defn- allow-raw-sql?   [x] (boolean (some-> x meta :allow-raw-sql)))

(defn- raw-honeysql-map?    [x] (and (map? x) (contains? x :raw)))
(defn- inline-honeysql-map? [x] (and (map? x) (contains? x :inline)))
(defn- raw-honeysql-form?   [x] (and (sequential? x) (= :raw (first x))))
(defn- inline-honeysql-form? [x] (and (sequential? x) (= :inline (first x))))

(defn- safe-inline-value?
  "True if `x` may be rendered inside an *unmarked* `[:inline ...]`: `nil`, a boolean, or a number, or a collection of
  those. A string, keyword, or symbol renders verbatim, so it needs `^:allow-raw-sql`."
  [x]
  (cond
    (coll? x) (every? safe-inline-value? x)
    :else     (or (nil? x) (boolean? x) (number? x))))

(declare safe-structure? safe-structure-map safe-row?)

(defn- safe-structure?
  "True unless `v` embeds a forbidden nested HoneySQL map or splice. A `{:raw ...}`/`{:inline ...}` map is always
  refused; any other nested map is refused unless marked `^:allow-subquery` (then traversed). A `[:raw ...]` form is
  refused unless marked `^:allow-raw-sql`; an `[:inline ...]` form is refused unless its argument is a scalar or the
  form is marked. This walk checks *shape*, not position, and does not check form heads."
  [v]
  (cond
    (or (raw-honeysql-map? v) (inline-honeysql-map? v))
    false

    (raw-honeysql-form? v)
    (allow-raw-sql? v)

    (inline-honeysql-form? v)
    (and (= 2 (count v))
         (or (safe-inline-value? (second v))
             (allow-raw-sql? v)))

    (h2x/typed? v)
    (safe-structure? (second v))

    (map? v)
    (and (allow-subquery? v) (safe-structure-map v))

    (coll? v)
    (every? safe-structure? v)

    :else true))

(defn- safe-structure-map
  "Walk the values of a HoneySQL map for markers. INSERT `:values` rows and the UPDATE `:set` map are a request body
  being written: their container map is allowed, but each column value is still walked."
  [m]
  (every? (fn [[clause v]]
            (if (contains? #{:values :set} clause)
              (safe-row? v)
              (safe-structure? v)))
          m))

(defn- safe-row?
  "Walk an INSERT `:values` list, an UPDATE `:set` map, or a single row for markers, allowing the container map."
  [row]
  (cond
    (map? row)  (every? safe-structure? (vals row))
    (coll? row) (every? safe-row? row)
    :else       (safe-structure? row)))

;;; --------------------------------------------------- form heads -----------------------------------------------------
;;;
;;; HoneySQL renders an unregistered keyword form head as a function call, emitting the name unquoted via `sql-kw`.
;;; `sql-kw` turns each `-` into a space, so `[:a-b-c 1]` renders `A B C(?)` -- more than one SQL token. A head built
;;; from a runtime string is therefore raw SQL, not a bound parameter. HoneySQL decides *which* keywords are heads:
;;; a keyword reaches `sql-kw` exactly when it is rendered unquoted (a head, an ORDER BY direction, a clause word);
;;; a column or alias is rendered quoted via `format-entity` and never reaches `sql-kw`. So instrumenting `sql-kw`
;;; classifies position for us, with no per-clause modeling.

(def ^:private single-token-head #"[A-Za-z0-9_.*%]+")

;; Fixed HoneySQL vocabulary rendered unquoted via `sql-kw` that HoneySQL does not carry in a registry, so it does
;; not reach the guard through `registered-clause?`/`registered-fn?`/`registered-op?`. Each renders more than one SQL
;; word (`:desc-nulls-last` -> `DESC NULLS LAST`, `:distinct-on` -> `DISTINCT ON`, `:is-not-null` -> `IS NOT NULL`)
;; and is a HoneySQL keyword, never a runtime string. The `:in` family, the `FOR UPDATE`/`FOR SHARE` lock strengths
;; and modifiers (`:for`/`:lock`), the ORDER BY null-ordering directions, `SELECT DISTINCT ON`, and the null
;; predicates.
(def ^:private allowed-clause-words
  #{:in :not-in :exists :not-exists :if-exists :if-not-exists
    :update :no-update :share :no-key-update :key-share :nowait :skip-locked :wait
    :nulls-first :nulls-last
    :asc-nulls-first :asc-nulls-last :desc-nulls-first :desc-nulls-last
    :distinct-on :is-null :is-not-null})

(defn- allowed-head?
  "Whether `f`, a keyword HoneySQL is about to render unquoted, is allowed. A registered clause, function, or operator
  may render several fixed words (`:drop-table`, `:insert-into`, `:order-by`, `:not-in`, `:left-join`); its formatter
  controls the output. A few HoneySQL keywords are handled inline rather than registered ([[allowed-clause-words]]).
  Any other name must be a single SQL token [[single-token-head]] -- HoneySQL has no closed set of functions, so
  ordinary calls like `:count` are unregistered and pass on the single-token rule."
  [f]
  (or (sql/registered-clause? f)
      (sql/registered-fn? f)
      (sql/registered-op? f)
      (contains? allowed-clause-words (keyword f))
      (some? (re-matches single-token-head (name f)))))

(def ^:private ^:dynamic *checking-heads?*
  "Bound true only around the app-DB head-check format call, so the instrumented `sql-kw` enforces on this thread and
  nowhere else. Driver and query-processor HoneySQL formatting on other threads is unaffected."
  false)

(defn- install-sql-kw-check!
  "Wrap `honey.sql/sql-kw` so it refuses a disallowed head while `*checking-heads?*` is bound, and passes through
  otherwise. Idempotent: a re-wrap is a no-op, so calling this on every namespace load is safe."
  []
  (alter-var-root #'sql/sql-kw
                  (fn [orig]
                    (if (::wrapped (meta orig))
                      orig
                      (with-meta
                       (fn wrapped-sql-kw [k]
                         (when (and *checking-heads?* (or (keyword? k) (string? k)) (not (allowed-head? k)))
                           (throw (ex-info "forbidden HoneySQL form head" {::bad-head k})))
                         (orig k))
                       {::wrapped true})))))

;; Install the head check once, at load. The wrapper is a passthrough unless `*checking-heads?*` is bound on the
;; current thread, so it only enforces during the app-DB head check.
(install-sql-kw-check!)

(def ^:private ddl-clauses
  "DDL statements manage the schema and are built by trusted code, never from a request body. Their column-type and
  constraint keywords (`:timestamp-with-time-zone`, `:not-null`, `:auto-increment`) render via `sql-kw` but are a
  fixed SQL vocabulary, not multi-token heads, so the head check does not apply to a DDL query."
  #{:create-table :create-table-as :with-columns :alter-table :add-column :drop-column :add-index :drop-index
    :rename-table :rename-column :create-view :create-or-replace-view :create-materialized-view
    :refresh-materialized-view :drop-view :drop-materialized-view :drop-extension :create-extension
    :create-index :truncate})

(defn- ddl-query? [query]
  (and (map? query)
       (some ddl-clauses (keys query))))

(defn- refused-head
  "The head `query` renders that the check refuses, or nil if none. Format with the instrumented `sql-kw` enforcing,
  using the same options the app-DB compile step uses so a head renders here exactly as it will when the query runs.
  A non-head HoneySQL error is not this guard's concern, so it counts as head-safe and the real compile step surfaces
  it. The head check does not apply to a DDL query."
  [query]
  (when-not (ddl-query? query)
    (try
      (binding [*checking-heads?* true]
        (sql/format query @t2.honeysql/global-options))
      nil
      (catch clojure.lang.ExceptionInfo e
        (get (ex-data e) ::bad-head))
      (catch Throwable _ nil))))

(defn- heads-safe? [query]
  (nil? (refused-head query)))

;;; ---------------------------------------------------- the guard -----------------------------------------------------

(defn safe-syntax?
  "Whether compiled `query` is safe to hand to HoneySQL. Two independent checks: a position-free structural walk refuses
  unmarked nested maps and `:raw`/`:inline` splices, and a head check formats the query with an instrumented `sql-kw`
  that refuses a form head which is neither registered nor a single SQL token."
  [query]
  (and (if (map? query)
         ;; the top-level query map is the query itself, allowed without a marker; a nested map still needs one
         (and (not (or (raw-honeysql-map? query) (inline-honeysql-map? query)))
              (safe-structure-map query))
         (safe-structure? query))
       (heads-safe? query)))

(defn check-syntax!
  "Throw if `query` is not safe to hand to HoneySQL, else return it. The entry point for a caller that formats a
  HoneySQL map outside the Toucan2 pipeline (e.g. [[metabase.app-db.query/query]]) and so does not reach the
  `compile :before` fence. `ex-data` context (`:model`, extra keys) is merged into the thrown map."
  ([query] (check-syntax! query nil))
  ([query context]
   (when-not (safe-syntax? query)
     (let [bad-head (refused-head query)]
       (throw (ex-info (if bad-head
                         (str "A forbidden HoneySQL form head reached the app-DB compile step: " (pr-str bad-head)
                              ". A form head must be a registered clause, function, or operator, or a single-token "
                              "name.")
                         (str "A forbidden HoneySQL clause reached the app-DB compile step. Mark a deliberate subquery "
                              "with ^:allow-subquery, a deliberate [:raw ...] splice with ^:allow-raw-sql, and use "
                              "[:inline ...] only with a scalar literal."))
                       (cond-> (assoc context :type (if bad-head ::forbidden-head ::unmarked-nested-map)
                                      :query query)
                         bad-head (assoc ::bad-head bad-head))))))
   query))

(methodical/defmethod t2.pipeline/build :around [:toucan.query-type/select.exists :default clojure.lang.IPersistentMap]
  [query-type model parsed-args resolved-query]
  (update-in (next-method query-type model parsed-args resolved-query)
             [:select 0 0 1] vary-meta assoc :allow-subquery true))

(methodical/defmethod t2.pipeline/compile :before :default
  [_query-type model built-query]
  (when-not (instance? IdentityQuery built-query)
    (check-syntax! built-query {:model model}))
  built-query)
