(ns metabase.sql-parsing.sqlglot-java.join-steps
  "The row-count queries of each join in a SELECT, taken one join at a time: the port of `join_steps`."
  (:require
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.sql-parsing.sqlglot-java.references :as references]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.ast Expr Expressions$Column Expressions$Identifier Expressions$Parameter
                             Expressions$Placeholder Expressions$Query Expressions$Select Expressions$SetOperation Expressions$Subquery
                             Expressions$Table)
   (com.metabase.sqlglot.reference NormalizeIdentifiers ParseError)
   (java.util Collection)))

(set! *warn-on-reflection* true)

;; Any other argument on a source (a PIVOT, a time-travel clause, a sample) changes what it yields, so the query is
;; refused rather than rebuilt without it.

(def ^:private table-args
  "The arguments a FROM or JOIN table may carry."
  #{"alias"
    "catalog"
    "db"
    "this"})

(def ^:private subquery-args
  "The arguments a derived-table source may carry."
  #{"this" "alias"})

(def ^:private join-args
  "The arguments a join may carry."
  #{"kind"
    "method"
    "on"
    "side"
    "this"
    "using"})

(def ^:private join-kinds
  "The join kinds a step can be rebuilt for. A SEMI or ANTI join is not one."
  #{""
    "CROSS"
    "INNER"
    "OUTER"})

(defn- unsupported [reason]
  (ex-info reason {::reason reason}))

(defn- set-args
  "The names of `node`'s arguments that hold a value, as Python's `if v` reads one: not nil, false, empty or blank."
  [^Expr node]
  (into #{}
        (keep (fn [[k v]]
                (when-not (or (nil? v)
                              (false? v)
                              (and (string? v) (empty? v))
                              (and (instance? Collection v) (.isEmpty ^Collection v)))
                  k)))
        (ast/args node)))

(defn- only-args? [allowed node]
  (every? allowed (set-args node)))

(defn- alias-or-name [node]
  (let [node-alias (ast/node-alias node)]
    (if (seq node-alias) node-alias (ast/node-name node))))

(defn- effective-name
  "The name `identifier` resolves to in `dialect`, which folds an unquoted name and may keep a quoted one.
  Port of `_effective_name`."
  [identifier dialect]
  (ast/node-name (NormalizeIdentifiers/normalizeIdentifiers ^Expr (ast/copy identifier) ^String dialect false)))

(defn- step-source
  "A FROM or JOIN source as its kind (`table`, `cte` or `derived`), its `[catalog schema table]` or nil, and its alias.
  Port of `_join_step_source`."
  [node cte-names dialect]
  (cond
    (instance? Expressions$Table node)
    (let [parts (references/table-parts node)]
      (when-not (and (only-args? table-args node)
                     (instance? Expressions$Identifier (ast/this node))
                     parts)
        (throw (unsupported "unsupported-source")))
      (if (and (empty? (ast/text node "db"))
               (empty? (ast/text node "catalog"))
               (contains? cte-names (effective-name (ast/this node) dialect)))
        {:source "cte", :table nil, :alias (alias-or-name node)}
        {:source "table", :table parts, :alias (alias-or-name node)}))

    (instance? Expressions$Subquery node)
    (do
      (when-not (only-args? subquery-args node)
        (throw (unsupported "unsupported-source")))
      ;; A parenthesized join tree, `JOIN (b JOIN c ON ...) ON ...`, is a Subquery around something that is not a
      ;; query.
      (when-not (instance? Expressions$Query (ast/this node))
        (throw (unsupported "nested-join")))
      {:source "derived", :table nil, :alias (alias-or-name node)})

    :else
    (throw (unsupported "unsupported-source"))))

(defn- upper-arg [join k]
  (u/upper-case-en (ast/text join k)))

(defn- step-strategy
  "The join's strategy: `inner`, `left`, `right`, `full` or `cross`.
  Port of `_join_step_strategy`."
  [join]
  (let [args   (set-args join)
        side   (upper-arg join "side")
        kind   (upper-arg join "kind")
        method (upper-arg join "method")]
    (when-not (and (every? join-args args)
                   (#{"" "NATURAL"} method)
                   (join-kinds kind))
      (throw (unsupported "unsupported-join")))
    (cond
      (= kind "CROSS")
      "cross"

      ;; `FROM a, b` parses as a join with no side, kind or condition. Its condition, if any, is in the WHERE clause,
      ;; which the step queries leave out, so they would count the whole cross product.
      (and (= "" side kind method)
           (not-any? args ["on" "using"]))
      (throw (unsupported "comma-join"))

      :else
      (get {"LEFT" "left", "RIGHT" "right", "FULL" "full"} side "inner"))))

(defn- with-clause [^Expr select with-node]
  (cond-> select
    with-node (ast/set-arg! "with_" (ast/copy with-node))))

(defn- count-star-as-n
  "The select expression `COUNT(*) AS n`."
  []
  (ast/create "Alias" {"this"  (ast/create "Count" {"this" (ast/create "Star")})
                       "alias" (ast/to-identifier "n")}))

(defn- count-select
  "The query `SELECT COUNT(*) AS n FROM <from-node> <joins>`, with `with-node` as its WITH clause.
  Port of `_count_select`."
  ([from-node joins]
   (count-select from-node joins nil))
  ([from-node joins with-node]
   (with-clause (ast/create "Select" {"expressions" [(count-star-as-n)]
                                      "from_"       (ast/copy from-node)
                                      "joins"       (mapv ast/copy joins)})
     with-node)))

(defn- derived [select table-alias]
  (ast/create "Subquery" {"this"  select
                          "alias" (ast/create "TableAlias" {"this" (ast/to-identifier table-alias)})}))

(defn- two-counts
  "Both one-row counts in one row: `SELECT w.n, m.n FROM (<first>) AS w CROSS JOIN (<second>) AS m`.
  Port of `_two_counts`."
  [first-select second-select with-node]
  ;; Each count is a derived table rather than a scalar subquery so the query has a FROM clause, which some databases
  ;; (Oracle before 23c) require.
  (let [column (fn [table-alias]
                 (ast/create "Column" {"this"  (ast/to-identifier "n")
                                       "table" (ast/to-identifier table-alias)}))]
    (with-clause (ast/create "Select" {"expressions" [(column "w") (column "m")]
                                       "from_"       (ast/create "From" {"this" (derived first-select "w")})
                                       "joins"       [(ast/create "Join" {"this" (derived second-select "m")
                                                                          "kind" "CROSS"})]})
      with-node)))

(defn- inner-variant
  "A copy of the outer `join` made an INNER join."
  [join]
  (let [inner (ast/copy join)]
    (ast/set-arg! inner "side" nil)
    (when (= "OUTER" (upper-arg inner "kind"))
      (ast/set-arg! inner "kind" nil))
    inner))

(defn- source-identifier
  "The identifier a join's ON clause calls the source `node` by, or nil for a source with no name.
  Port of `_source_identifier`."
  [node]
  (or (some-> (ast/arg node "alias") ast/this)
      (when (instance? Expressions$Table node)
        (ast/this node))))

(defn- schema-qualified-column?
  "Whether `on`, a join condition or nil, references a column through its schema or catalog."
  [on]
  (and on
       (some #(or (seq (ast/text % "db")) (seq (ast/text % "catalog")))
             (ast/find-all on Expressions$Column))))

(defn- left-join-counts
  "The output and matched counts of a chain ending in a LEFT join, from one evaluation of it, or nil.
  The joined source is wrapped to carry a marker column, which is NULL on a row that found no match.
  Port of `_left_join_counts`."
  [from-node chain with-node dialect]
  (let [join (peek chain)
        node (ast/this join)
        id   (source-identifier node)]
    ;; ClickHouse fills unmatched columns with defaults by default, so its marker would not be NULL.
    ;; A wrapped source no longer answers to a schema-qualified column reference.
    (when-not (or (= "clickhouse" dialect)
                  (nil? id)
                  (schema-qualified-column? (ast/arg join "on")))
      (let [column (fn [this] (ast/create "Column" {"this" this, "table" (ast/copy id)}))
            marker (column (ast/to-identifier "mb_matched"))
            marked (ast/create "Select"
                               {"expressions" [(column (ast/create "Star"))
                                               (ast/create "Alias" {"this"  (ast/create "Literal" {"this"      "1"
                                                                                                   "is_string" false})
                                                                    "alias" (ast/to-identifier "mb_matched")})]
                                "from_"       (ast/create "From" {"this" (ast/copy node)})})
            last'  (doto (ast/copy join)
                     (ast/set-arg! "this" (ast/create "Subquery"
                                                      {"this"  marked
                                                       "alias" (ast/create "TableAlias" {"this" (ast/copy id)})})))]
        (with-clause
          (ast/create "Select"
                      {"expressions" [(count-star-as-n)
                                      (ast/create "Alias"
                                                  {"this"  (ast/create "Count" {"this" marker})
                                                   "alias" (ast/to-identifier "m")})]
                       "from_"       (ast/copy from-node)
                       "joins"       (conj (mapv ast/copy (pop chain)) last')})
          with-node)))))

(defn- whole-query
  "`stmt` without brackets around the whole of it.
  Throws a `not-a-select` refusal for brackets with a clause of their own, such as an outer WITH or ORDER BY.
  Port of `_whole_query`."
  [stmt]
  (if (and (instance? Expressions$Subquery stmt) (empty? (ast/node-alias stmt)))
    (if (only-args? #{"this"} stmt)
      (recur (ast/this stmt))
      (throw (unsupported "not-a-select")))
    stmt))

(defn- parse-statement
  "The one statement in `sql`, without brackets around the whole of it.
  Throws an `unparseable` or `multiple-statements` refusal otherwise."
  [dialect sql]
  (let [stmts (try
                (ast/nonempty-statements (ast/parse sql dialect))
                (catch ParseError _
                  (throw (unsupported "unparseable"))))]
    (case (count stmts)
      0 (throw (unsupported "unparseable"))
      1 (whole-query (first stmts))
      (throw (unsupported "multiple-statements")))))

(defn- statement-refusal
  "Why the parsed statement `stmt` cannot have its join steps rebuilt, before its sources are looked at, or nil."
  [stmt]
  (cond
    (instance? Expressions$SetOperation stmt)                              "set-operation"
    (not (instance? Expressions$Select stmt))                              "not-a-select"
    ;; A placeholder is a value the step queries would have to be handed again, and nothing passes them on.
    (seq (ast/find-all stmt Expressions$Placeholder Expressions$Parameter)) "parameters"
    ;; Hive's `LATERAL VIEW` hangs off the SELECT, not a join.
    (contains? (set-args stmt) "laterals")                                 "unsupported-join"
    ;; ClickHouse's SETTINGS can change what a join returns, and the step queries would leave them out.
    (contains? (set-args stmt) "settings")                                 "unsupported-join"))

(defn- steps
  "The `ok` result of [[join-steps]].
  Throws a refusal, an `ex-info` with its reason under `::reason`, for a query whose joins cannot be rebuilt."
  [dialect sql]
  (let [stmt (parse-statement dialect sql)]
    (when-let [reason (statement-refusal stmt)]
      (throw (unsupported reason)))
    (let [from-node (ast/arg stmt "from_")
          _         (when-not (and from-node (ast/this from-node))
                      (throw (unsupported "no-from")))
          _         (when (seq (ast/expressions from-node))
                      (throw (unsupported "comma-join")))
          with-node (ast/arg stmt "with_")
          cte-names (into #{}
                          (keep #(when (seq (ast/node-alias %))
                                   (effective-name (ast/this (ast/arg % "alias")) dialect)))
                          (some-> with-node ast/expressions))
          joins     (vec (ast/arg stmt "joins"))]
      {:status   "ok"
       :from     (step-source (ast/this from-node) cte-names dialect)
       :base_sql (ast/sql (count-select from-node [] with-node) dialect)
       :steps    (vec (map-indexed
                       (fn [i join]
                         (let [;; The source first: a LATERAL or APPLY source looks like a comma join to the
                               ;; strategy check.
                               source   (step-source (ast/this join) cte-names dialect)
                               strategy (step-strategy join)
                               chain    (subvec joins 0 (inc i))
                               query    (if (#{"left" "right" "full"} strategy)
                                          (or (when (= "left" strategy)
                                                (left-join-counts from-node chain with-node dialect))
                                              (two-counts (count-select from-node chain)
                                                          (count-select from-node
                                                                        (conj (pop chain) (inner-variant join)))
                                                          with-node))
                                          (count-select from-node chain with-node))]
                           (assoc source :strategy strategy :sql (ast/sql query dialect))))
                       joins))})))

(defn join-steps
  "The row-count queries of each join in `sql`, a SELECT, taken one join at a time.
  Returns the result [[metabase.sql-parsing.core/join-steps]] describes.
  Port of `join_steps`."
  [dialect sql]
  (try
    (steps dialect sql)
    (catch clojure.lang.ExceptionInfo e
      (if-let [reason (::reason (ex-data e))]
        {:status "unsupported", :reason reason}
        (throw e)))))
