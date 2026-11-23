(ns metabase.sql-parsing.sqlglot-java.join-steps
  "The row-count queries of each join in a SELECT, taken one join at a time: the port of `join_steps`."
  (:require
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.sql-parsing.sqlglot-java.references :as references]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.ast Expr Expressions$And Expressions$Column Expressions$EQ Expressions$GT Expressions$GTE
                             Expressions$Identifier Expressions$LT Expressions$LTE Expressions$Lateral
                             Expressions$Literal Expressions$NEQ Expressions$Parameter
                             Expressions$Placeholder Expressions$Query Expressions$Select Expressions$SetOperation
                             Expressions$Subquery Expressions$Table Expressions$TableSample Expressions$Values)
   (com.metabase.sqlglot.reference NormalizeIdentifiers ParseError)
   (java.util Collection)))

(set! *warn-on-reflection* true)

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

(defn- alias-or-name [node]
  (let [node-alias (ast/node-alias node)]
    (if (seq node-alias) node-alias (ast/node-name node))))

(defn- effective-name
  "The name `identifier` resolves to in `dialect`, which folds an unquoted name and may keep a quoted one.
  Port of `_effective_name`."
  [identifier dialect]
  ;; H2 has no sqlglot dialect, and it folds unquoted names up where sqlglot's default folds them down.
  (if (nil? dialect)
    (cond-> (ast/node-name identifier)
      (not (ast/quoted? identifier)) u/upper-case-en)
    (ast/node-name (NormalizeIdentifiers/normalizeIdentifiers ^Expr (ast/copy identifier) ^String dialect false))))

(defn- step-source
  "A FROM or JOIN source as its kind (`table`, `cte` or `derived`), its `[catalog schema table]` or nil, and its alias.
  Anything that is not a plain named table is `derived`.
  Throws a refusal for a parenthesized join tree or a LATERAL or APPLY source.
  Port of `_join_step_source`."
  [node cte-names dialect]
  (when (instance? Expressions$Lateral node)
    (throw (unsupported "unsupported-source")))
  (let [parts (when (and (instance? Expressions$Table node)
                         (instance? Expressions$Identifier (ast/this node)))
                (references/table-parts node))]
    (cond
      (and parts
           (empty? (ast/text node "db"))
           (empty? (ast/text node "catalog"))
           (contains? cte-names (effective-name (ast/this node) dialect)))
      {:source "cte", :table nil, :alias (alias-or-name node)}

      parts
      {:source "table", :table parts, :alias (alias-or-name node)}

      ;; `JOIN (b JOIN c ON ...) ON ...` is a Subquery around something that is neither a query nor VALUES.
      (and (instance? Expressions$Subquery node)
           (not (ast/instance-of-any? [Expressions$Query Expressions$Values] (ast/this node))))
      (throw (unsupported "nested-join"))

      :else
      {:source "derived", :table nil, :alias (alias-or-name node)})))

(def ^:private comma-as-cross-dialects
  "The dialects that parse `FROM a, b` as a CROSS join, so a comma cannot be told from one."
  #{"bigquery"
    "clickhouse"
    "databricks"
    "hive"
    "spark"
    "spark2"
    "sqlite"})

(defn- upper-arg [join k]
  (u/upper-case-en (ast/text join k)))

(defn- step-strategy
  "The join's strategy: `inner`, `left`, `right`, `full` or `cross`.
  Throws a `comma-join` refusal for a comma join.
  Port of `_join_step_strategy`."
  [join dialect]
  (let [args   (set-args join)
        side   (upper-arg join "side")
        kind   (upper-arg join "kind")
        method (upper-arg join "method")]
    ;; `FROM a, b` has its condition, if any, in the WHERE clause, which the step queries leave out, so they would
    ;; count the whole cross product.
    (when (or (and (= "" side kind method)
                   (not-any? args ["on" "using"]))
              (and (= "CROSS" kind)
                   (contains? comma-as-cross-dialects dialect)))
      (throw (unsupported "comma-join")))
    (cond
      (= kind "CROSS")           "cross"
      ;; A SEMI or ANTI join filters its left side, so it has no unmatched rows to count, whatever its side.
      (#{"SEMI" "ANTI"} kind)    "inner"
      :else                      (get {"LEFT" "left", "RIGHT" "right", "FULL" "full"} side "inner"))))

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

(def ^:private join-comparisons
  "The comparisons a join condition may be made of for its matches to be counted by evaluating it again."
  [Expressions$EQ Expressions$GT Expressions$GTE Expressions$LT Expressions$LTE Expressions$NEQ])

(defn- conjuncts
  "The operands of the top-level ANDs in `node`."
  [node]
  (if (instance? Expressions$And node)
    (into (conjuncts (ast/this node)) (conjuncts (ast/arg node "expression")))
    [node]))

(defn- source-name
  "The effective name a column calls the source `node` by, or nil for a source with no name.
  Port of `_source_name`."
  [node dialect]
  (let [identifier (or (some-> (ast/arg node "alias") ast/this)
                       (ast/this node))]
    (when (instance? Expressions$Identifier identifier)
      (effective-name identifier dialect))))

(defn- operand-column
  "The source an operand of a join comparison names, `::literal` for a literal, or nil for anything else."
  [operand names dialect]
  (cond
    (instance? Expressions$Literal operand)
    ::literal

    ;; A column with a longer path may be a struct field, as in BigQuery's `a.payload.id`, whose `table` is `payload`,
    ;; so it can't be attributed to a source.
    (and (instance? Expressions$Column operand)
         (instance? Expressions$Identifier (ast/arg operand "table"))
         (nil? (ast/arg operand "db")))
    ;; A qualifier that names no source is a struct field too.
    (names (effective-name (ast/arg operand "table") dialect))))

(defn- on-counts-matches?
  "Whether counting the rows where the last join's ON clause holds counts exactly the rows that found a match.
  The clause must be an AND of comparisons between literals and columns that each name one source in the chain, and
  compare a column from each side that can be NULL-extended.
  ClickHouse fills unmatched columns with defaults rather than NULL.
  Port of `_on_counts_matches`."
  [from-node chain strategy dialect]
  (let [on    (ast/arg (peek chain) "on")
        names (mapv #(source-name % dialect) (cons (ast/this from-node) (map ast/this chain)))]
    (when (and on
               (not= "clickhouse" dialect)
               (every? some? names)
               (apply distinct? names))
      (let [parts    (conjuncts on)
            operands (when (every? #(ast/instance-of-any? join-comparisons %) parts)
                       (mapcat (fn [part]
                                 [(operand-column (ast/this part) (set names) dialect)
                                  (operand-column (ast/arg part "expression") (set names) dialect)])
                               parts))]
        (when (and (seq operands) (every? some? operands))
          (let [joined       (peek names)
                columns      (remove #{::literal} operands)
                from-joined  (boolean (some #{joined} columns))
                from-earlier (boolean (some #(not= joined %) columns))]
            (case strategy
              "left"  from-joined
              "right" from-earlier
              "full"  (and from-joined from-earlier))))))))

(defn- on-counts
  "`SELECT COUNT(*) AS n, COUNT(CASE WHEN <last join's ON> THEN 1 END) AS m FROM <from-node> <chain>`.
  Port of `_on_counts`."
  [from-node chain with-node]
  (let [one     (ast/create "Literal" {"this" "1", "is_string" false})
        matched (ast/create "Case" {"ifs" [(ast/create "If" {"this" (ast/copy (ast/arg (peek chain) "on"))
                                                             "true" one})]})]
    (with-clause
      (ast/create "Select"
                  {"expressions" [(count-star-as-n)
                                  (ast/create "Alias" {"this"  (ast/create "Count" {"this" matched})
                                                       "alias" (ast/to-identifier "m")})]
                   "from_"       (ast/copy from-node)
                   "joins"       (mapv ast/copy chain)})
      with-node)))

(defn- whole-query
  "`stmt` without brackets around the whole of it, and the WITH clause it runs under, or nil.
  Throws a `not-a-select` refusal for brackets with a clause other than WITH, ORDER BY, LIMIT or OFFSET, or for several
  WITH scopes.
  Port of `_whole_query`."
  [stmt dialect]
  (loop [stmt stmt, withs []]
    (if (and (instance? Expressions$Subquery stmt) (empty? (ast/node-alias stmt)))
      (do
        (when-not (every? #{"this" "with_" "order" "limit" "offset"} (set-args stmt))
          (throw (unsupported "not-a-select")))
        (recur (ast/this stmt) (cond-> withs (ast/arg stmt "with_") (conj (ast/arg stmt "with_")))))
      (let [withs     (cond-> withs
                        (and (instance? Expressions$Select stmt) (ast/arg stmt "with_"))
                        (conj (ast/arg stmt "with_")))
            with-node (first withs)
            names     (map #(effective-name (ast/this (ast/arg % "alias")) dialect)
                           (some-> with-node ast/expressions))]
        ;; One WITH list cannot stand in for several scopes. sqlglot flattens some of them itself, leaving a repeated
        ;; name.
        (when (or (next withs)
                  (and (seq names) (not (apply distinct? names))))
          (throw (unsupported "not-a-select")))
        [stmt with-node]))))

(defn- parse-statement
  "The first statement in `sql`, without brackets around the whole of it, and its WITH clause, as `[stmt with-node]`.
  Throws an `unparseable` refusal if there is none."
  [dialect sql]
  (let [stmts (try
                (ast/nonempty-statements (ast/parse sql dialect))
                (catch ParseError _
                  (throw (unsupported "unparseable"))))]
    (if (seq stmts)
      (whole-query (first stmts) dialect)
      (throw (unsupported "unparseable")))))

(defn- statement-refusal
  "Why the parsed statement `stmt` cannot have its join steps rebuilt, before its sources are looked at, or nil."
  [stmt]
  (cond
    (instance? Expressions$SetOperation stmt)     "set-operation"
    (not (instance? Expressions$Select stmt))     "not-a-select"
    ;; Hive's `LATERAL VIEW` hangs off the SELECT, not a join.
    (contains? (set-args stmt) "laterals")        "unsupported-join"
    ;; ClickHouse's SETTINGS and T-SQL's OPTION can change what a join returns or whether it runs at all, and the step
    ;; queries would leave them out.
    (some (set-args stmt) ["settings" "options"]) "unsupported-join"))

(defn- steps
  "The `ok` result of [[join-steps]].
  Throws a refusal, an `ex-info` with its reason under `::reason`, for a query whose joins cannot be rebuilt."
  [dialect sql]
  (let [[stmt with-node] (parse-statement dialect sql)]
    (when-let [reason (statement-refusal stmt)]
      (throw (unsupported reason)))
    (let [from-node    (ast/arg stmt "from_")
          _            (when-not (and from-node (ast/this from-node))
                         (throw (unsupported "no-from")))
          _            (when (seq (ast/expressions from-node))
                         (throw (unsupported "comma-join")))
          joins        (vec (ast/arg stmt "joins"))
          ;; A placeholder is a value the step queries would have to be handed again, and nothing passes them on. One
          ;; in a clause the steps leave out does not matter.
          _            (when (some #(seq (ast/find-all % Expressions$Placeholder Expressions$Parameter))
                                   (cond-> (cons from-node joins) with-node (conj with-node)))
                         (throw (unsupported "parameters")))
          ;; A sample in anything the steps keep would pick different rows in each step query.
          _            (when (some #(seq (ast/find-all % Expressions$TableSample))
                                   (cond-> (cons from-node joins) with-node (conj with-node)))
                         (throw (unsupported "unsupported-source")))
          cte-names    (into #{}
                             (keep #(when (seq (ast/node-alias %))
                                      (effective-name (ast/this (ast/arg % "alias")) dialect)))
                             (some-> with-node ast/expressions))]
      {:status   "ok"
       :from     (step-source (ast/this from-node) cte-names dialect)
       :base_sql (ast/sql (count-select from-node [] with-node) dialect)
       :steps    (vec (map-indexed
                       (fn [i join]
                         (let [source   (step-source (ast/this join) cte-names dialect)
                               strategy (step-strategy join dialect)
                               chain    (subvec joins 0 (inc i))
                               query    (if (#{"left" "right" "full"} strategy)
                                          (if (on-counts-matches? from-node chain strategy dialect)
                                            (on-counts from-node chain with-node)
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
