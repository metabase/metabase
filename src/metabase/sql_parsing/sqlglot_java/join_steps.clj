(ns metabase.sql-parsing.sqlglot-java.join-steps
  "`join_steps`: the row-count queries of each join in a SELECT, taken one join at a time."
  (:require
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.sql-parsing.sqlglot-java.references :as references]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.ast Expr Expressions$Identifier Expressions$Parameter Expressions$Placeholder
                             Expressions$Query Expressions$Select Expressions$SetOperation Expressions$Subquery
                             Expressions$Table)
   (com.metabase.sqlglot.reference ParseError)
   (java.util Collection)))

(set! *warn-on-reflection* true)

(def ^:private table-args
  "The arguments a FROM or JOIN table may carry. Anything else (a PIVOT, a time-travel clause, a sample) changes what
  the source yields, so the query is refused rather than rebuilt without it."
  #{"this" "db" "catalog" "alias"})

(def ^:private subquery-args
  "The arguments a derived-table source may carry."
  #{"this" "alias"})

(def ^:private join-args
  "The arguments a join may carry."
  #{"this" "on" "using" "side" "kind" "method"})

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

(defn- step-source
  "The description of a FROM or JOIN source: its kind (`table`, `cte` or `derived`), its `[catalog schema table]` when
  it is a table, and its alias. Port of `_join_step_source`."
  [node cte-names]
  (cond
    (instance? Expressions$Table node)
    (let [parts (references/table-parts node)]
      (when-not (and (only-args? table-args node)
                     (instance? Expressions$Identifier (ast/this node))
                     parts)
        (throw (unsupported "unsupported-source")))
      (if (and (empty? (ast/text node "db"))
               (empty? (ast/text node "catalog"))
               (contains? cte-names (ast/lower (ast/node-name node))))
        {:source "cte" :table nil :alias (alias-or-name node)}
        {:source "table" :table parts :alias (alias-or-name node)}))

    (instance? Expressions$Subquery node)
    (do
      (when-not (only-args? subquery-args node)
        (throw (unsupported "unsupported-source")))
      ;; A parenthesized join tree, `JOIN (b JOIN c ON ...) ON ...`, is a Subquery around something that is not a
      ;; query.
      (when-not (instance? Expressions$Query (ast/this node))
        (throw (unsupported "nested-join")))
      {:source "derived" :table nil :alias (alias-or-name node)})

    :else
    (throw (unsupported "unsupported-source"))))

(defn- upper-arg [join k]
  (u/upper-case-en (ast/text join k)))

(defn- step-strategy
  "The join's strategy (`inner`, `left`, `right`, `full` or `cross`). Port of `_join_step_strategy`."
  [join]
  (when-not (only-args? join-args join)
    (throw (unsupported "unsupported-join")))
  (let [side   (upper-arg join "side")
        kind   (upper-arg join "kind")
        method (upper-arg join "method")]
    (when-not (and (#{"" "NATURAL"} method) (#{"" "INNER" "OUTER" "CROSS"} kind))
      (throw (unsupported "unsupported-join")))
    (cond
      (= kind "CROSS")
      "cross"

      ;; `FROM a, b` parses as a join with no side, kind or condition. Its condition, if any, is in the WHERE clause,
      ;; which the step queries leave out, so they would count the whole cross product.
      (and (= "" side kind method)
           (not (contains? (set-args join) "on"))
           (not (contains? (set-args join) "using")))
      (throw (unsupported "comma-join"))

      :else
      (get {"LEFT" "left" "RIGHT" "right" "FULL" "full"} side "inner"))))

(defn- with-clause [^Expr select with-node]
  (cond-> select
    with-node (ast/set-arg! "with_" (ast/copy with-node))))

(defn- count-select
  "`SELECT COUNT(*) AS n FROM <from-node> <joins>`, with `with-node` as its WITH clause. Port of `_count_select`."
  ([from-node joins]
   (count-select from-node joins nil))
  ([from-node joins with-node]
   (with-clause (ast/create "Select" {"expressions" [(ast/create "Alias" {"this"  (ast/create "Count" {"this" (ast/create "Star")})
                                                                          "alias" (ast/to-identifier "n")})]
                                      "from_"       (ast/copy from-node)
                                      "joins"       (mapv ast/copy joins)})
     with-node)))

(defn- derived [select table-alias]
  (ast/create "Subquery" {"this"  select
                          "alias" (ast/create "TableAlias" {"this" (ast/to-identifier table-alias)})}))

(defn- two-counts
  "`SELECT w.n, m.n FROM (<first>) AS w CROSS JOIN (<second>) AS m`: both one-row counts in one row, with a FROM
  clause, which some databases require. Port of `_two_counts`."
  [first-select second-select with-node]
  (let [column (fn [table-alias]
                 (ast/create "Column" {"this" (ast/to-identifier "n") "table" (ast/to-identifier table-alias)}))]
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

(defn- parse-statement
  [dialect sql]
  (let [stmts (try
                (ast/nonempty-statements (ast/parse sql dialect))
                (catch ParseError _
                  (throw (unsupported "unparseable"))))]
    (case (count stmts)
      0 (throw (unsupported "unparseable"))
      1 (first stmts)
      (throw (unsupported "multiple-statements")))))

(defn- steps
  [dialect sql]
  (let [stmt (parse-statement dialect sql)]
    (cond
      (instance? Expressions$SetOperation stmt)       (throw (unsupported "set-operation"))
      (not (instance? Expressions$Select stmt))       (throw (unsupported "not-a-select"))
      ;; A placeholder is a value the step queries would have to be handed again, and nothing passes them on.
      (seq (ast/find-all stmt Expressions$Placeholder Expressions$Parameter))
      (throw (unsupported "parameters"))
      ;; Hive's `LATERAL VIEW` hangs off the SELECT, not a join.
      (contains? (set-args stmt) "laterals")         (throw (unsupported "unsupported-join")))
    (let [from-node (ast/arg stmt "from_")
          _         (when-not (and from-node (ast/this from-node))
                      (throw (unsupported "no-from")))
          _         (when (seq (ast/expressions from-node))
                      (throw (unsupported "comma-join")))
          with-node (ast/arg stmt "with_")
          cte-names (into #{}
                          (keep #(not-empty (ast/lower (ast/node-alias %))))
                          (some-> with-node ast/expressions))
          joins     (vec (ast/arg stmt "joins"))]
      {:status   "ok"
       :from     (step-source (ast/this from-node) cte-names)
       :base_sql (ast/sql (count-select from-node [] with-node) dialect)
       :steps    (vec (map-indexed
                       (fn [i join]
                         (let [n        (inc i)
                               ;; The source first: a LATERAL or APPLY source looks like a comma join to the
                               ;; strategy check.
                               source   (step-source (ast/this join) cte-names)
                               strategy (step-strategy join)
                               query    (if (#{"left" "right" "full"} strategy)
                                          (two-counts (count-select from-node (subvec joins 0 n))
                                                      (count-select from-node (conj (subvec joins 0 i) (inner-variant join)))
                                                      with-node)
                                          (count-select from-node (subvec joins 0 n) with-node))]
                           (assoc source :strategy strategy :sql (ast/sql query dialect))))
                       joins))})))

(defn join-steps
  "The row-count queries of each join in `sql`, a SELECT, taken one join at a time: `{:status \"ok\" :from <source>
  :base_sql <sql> :steps [<source> + {:strategy <s> :sql <sql>}]}`, or `{:status \"unsupported\" :reason <r>}`.
  A two-count step query returns the rows of the chain as written and the rows with its last join made INNER.
  Port of `join_steps`."
  [dialect sql]
  (try
    (steps dialect sql)
    (catch clojure.lang.ExceptionInfo e
      (if-let [reason (::reason (ex-data e))]
        {:status "unsupported" :reason reason}
        (throw e)))))
