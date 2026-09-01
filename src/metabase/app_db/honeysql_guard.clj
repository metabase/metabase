(ns metabase.app-db.honeysql-guard
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.identity-query :as t2.identity-query])
  (:import
   (toucan2.tools.identity_query IdentityQuery)))

(set! *warn-on-reflection* true)

(comment t2.identity-query/keep-me)

(defn- list-head
  "The head of Honey SQL form `x` as a keyword, or `nil` if `x` isn't a form with an ident head. Honey SQL accepts
  a symbol everywhere it accepts a keyword, so `['raw \"...\"]` is the same form as `[:raw \"...\"]`."
  [x]
  (when (sequential? x)
    (let [head (first x)]
      (when (ident? head)
        (sql/sym->kw head)))))

(defn- map-clause?
  "Whether `x` is a Honey SQL map with clause `k`. Honey SQL looks each clause up under a symbol key as well."
  [x k]
  (and (map? x)
       (or (contains? x k)
           (contains? x (symbol (name k))))))

(defn- list-clause?
  "Whether `x` is a Honey SQL form headed by `k`."
  [x k]
  (= k (list-head x)))

(defn- clause
  "The value of clause `k` in Honey SQL map `m`, which -- like Honey SQL itself -- may use a symbol key."
  [m k]
  (or (get m k)
      (get m (symbol (name k)))))

(defn- has-meta?
  [x k]
  (boolean (some-> x meta k)))

(defn- safe-literal?
  "Whether `v` is safe to render inline. `[:inline x]` puts `x` into the SQL text through `honey.sql.protocols/sqlize`,
  whose `Object` fallback is a bare `(str x)` and whose string handling, on the MySQL dialect, escapes `'` with a
  lookbehind that a preceding backslash defeats. Only values that render as a self-contained SQL literal qualify."
  [v]
  (or (nil? v)
      (boolean? v)
      (number? v)))

(defn- safe-literal-or-list?
  "[[safe-literal?]], for a value Honey SQL renders inline as either a literal or a list of them."
  [v]
  (if (coll? v)
    (every? safe-literal? v)
    (safe-literal? v)))

(defn- safe-parameter?
  "Whether `v` is a value Honey SQL binds as a `?` parameter rather than rendering into the SQL. Enumerated rather
  than assumed, so a value shape nobody considered is rejected instead of trusted."
  [v]
  (or (safe-literal? v)
      (string? v)
      (char? v)
      (uuid? v)
      (inst? v)
      (bytes? v)
      (instance? java.time.temporal.Temporal v)
      (instance? java.time.temporal.TemporalAmount v)))

(def ^:private plain-identifier-pattern
  "A bare SQL identifier, qualified with `.` or `/` as Honey SQL splits on both (`:core_user/login_attributes`
  renders as `\"core_user\".\"login_attributes\"`), with `*` allowed as a whole segment (`:*`, `:metabase_table.*`).
  Deliberately excludes `-`, which Honey SQL renders as a space in a form head and as `_` in a `:%fn` name, along
  with everything else that could turn one ident into several SQL tokens."
  #"(?:[A-Za-z_][A-Za-z_0-9]*|\*)(?:[./](?:[A-Za-z_][A-Za-z_0-9]*|\*))*")

(def ^:private function-var-pattern
  "The tail of a `:%fn.arg` ident. Honey SQL renders `fn` unquoted, so unlike [[plain-identifier-pattern]] this
  allows no `/`: a namespace would land inside the function name rather than qualify it."
  #"[A-Za-z_][A-Za-z_0-9]*(?:\.(?:[A-Za-z_][A-Za-z_0-9]*|\*))*")

(defn- plain-identifier?
  [s]
  (boolean (re-matches plain-identifier-pattern s)))

(defn- function-var?
  [s]
  (boolean (re-matches function-var-pattern s)))

(def ^:private allowed-keywords
  "Keywords Honey SQL renders as a fixed piece of SQL, which is why [[plain-identifier-pattern]] isn't what clears
  them: none of the ident reaches the query, so the shape of the ident doesn't matter. Every operator and special
  form Honey SQL knows that the pattern rejects is listed here, along with the modifiers its clause formatters
  match by name. A head that appears in neither is rendered as a function name, spliced in as written."
  (into #{;; operators and special syntax -- `honey.sql/registered-op?` / `registered-fn?`
          :!= :% :& :&& :+ :- :. :.:. :/ :< :<-> :<= :<> := :> :>=
          :at-time-zone :case-expr :foreign-key :get-in :ignore-nulls :is-distinct-from :is-not
          :is-not-distinct-from :not-between :not-ilike :not-like :not-similar-to :not=
          :order-by :primary-key :respect-nulls :similar-to :with-ordinality :within-group :| :||
          ;; the Postgres JSON, array and regex operators our drivers register globally with `register-op!`
          :#- :#> :#>> :-> :->> :=> :? :?& :?|
          ;; handled inline by `honey.sql/format-expr`, so in neither registry
          :in :not-in
          ;; the forms we register ourselves, in [[metabase.util.honey-sql-2]]
          ::h2x/typed ::h2x/literal ::h2x/identifier ::h2x/extract ::h2x/collate ::h2x/distinct-count
          ::h2x/percentile-cont ::h2x/at-time-zone ::h2x/postgres-interval ::h2x/mysql-interval
          ;; DDL modifiers and multi-word column types
          :if-exists :if-not-exists :or-replace :materialized :not-materialized
          :not-null :auto-increment :generated-always
          :timestamp-with-time-zone :timestamp-without-time-zone :time-with-time-zone :time-without-time-zone
          :double-precision :character-varying
          ;; ORDER BY directions
          :asc :desc :nulls-first :nulls-last
          :asc-nulls-first :asc-nulls-last :desc-nulls-first :desc-nulls-last}
        ;; operators that aren't readable as keyword literals
        (map keyword ["^" "~" "~*" "!~" "!~*" "<@" "@>" "@?" "@@"])))

(defn- ident-string
  "The string Honey SQL renders ident `x` from. As in `honey.sql/format-var`, the namespace is part of it:
  `:%foo/bar` renders `foo/bar` as the function name."
  [x]
  (if-let [ns-part (namespace x)]
    (str ns-part "/" (name x))
    (name x)))

(defn- safe-ident?
  "Whether ident `x` is safe. Honey SQL renders an ident as bare, unquoted SQL in more places than it quotes one --
  a form head, an ORDER BY direction, a DDL modifier -- and the `:%fn.arg` prefix makes `fn` a bare function name
  wherever it appears. Rather than track which of those positions we're in, hold every ident to the shape that is
  inert in all of them."
  [x]
  (or (contains? allowed-keywords (sql/sym->kw x))
      (let [s (ident-string x)]
        (if (str/starts-with? s "%")
          (function-var? (subs s 1))
          (plain-identifier? s)))))

(defn- safe-value?
  [v]
  (cond
    (or (map-clause? v :raw) (map-clause? v :inline))
    false

    (list-clause? v :raw)
    (has-meta? v :allow-raw-sql)

    (list-clause? v :inline)
    (and (= 2 (count v))
         (or (safe-literal-or-list? (second v))
             (has-meta? v :allow-raw-sql)))

    (h2x/typed? v)
    (safe-value? (second v))

    (ident? v)
    (safe-ident? v)

    (map? v)
    (and (has-meta? v :allow-subquery) (every? safe-value? (vals v)))

    (coll? v)
    (every? safe-value? v)

    :else
    (safe-parameter? v)))

(defn- unsafe-node
  "The smallest sub-form of `v` that [[safe-value?]] rejects, to name in the error rather than leaving the reader
  to find it in a large query."
  [v]
  (when-not (safe-value? v)
    (or (when (coll? v)
          (some unsafe-node (if (map? v) (vals v) v)))
        v)))

(defn- safe-row?
  [row]
  (cond
    (map? row)  (every? safe-value? (vals row))
    (coll? row) (every? safe-value? row)
    :else       (safe-value? row)))

(defn safe-syntax?
  "Whether the compiled `query` map contains only allowed HoneySQL forms."
  [query]
  (if (map? query)
    (and (not (or (map-clause? query :raw) (map-clause? query :inline)))
         (every? safe-value? (vals (dissoc query :values :set 'values 'set)))
         (every? safe-row? (clause query :values))
         (safe-row? (clause query :set)))
    (safe-value? query)))

(methodical/defmethod t2.pipeline/build :around [:toucan.query-type/select.exists :default clojure.lang.IPersistentMap]
  [query-type model parsed-args resolved-query]
  (update-in (next-method query-type model parsed-args resolved-query)
             [:select 0 0 1] vary-meta assoc :allow-subquery true))

(methodical/defmethod t2.pipeline/compile :before :default
  [_query-type model built-query]
  (when-not (or (instance? IdentityQuery built-query)
                (safe-syntax? built-query))
    (throw (ex-info (str "A forbidden HoneySQL clause reached the app-DB compile step. Mark a deliberate subquery "
                         "with ^:allow-subquery, a deliberate [:raw ...] splice with ^:allow-raw-sql, use "
                         "[:inline ...] only with a scalar literal, and keep form heads to plain identifiers or "
                         "Honey SQL operators.")
                    {:type ::unmarked-nested-map, :model model, :query built-query
                     :unsafe-node (unsafe-node built-query)})))
  built-query)
