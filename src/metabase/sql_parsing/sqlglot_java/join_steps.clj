(ns metabase.sql-parsing.sqlglot-java.join-steps
  "The row-count queries of each join in a SELECT, taken one join at a time: the port of `join_steps`."
  (:require
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.sql-parsing.sqlglot-java.references :as references]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.ast Expr Expressions$Identifier Expressions$Lateral Expressions$Parameter
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

(defn- comma-joined
  "For each of the first statement's joins, in order, whether it was written with a comma.
  Some dialects parse a comma join as CROSS, so only the text tells them apart.
  The separators are the commas and JOIN keywords at the bracket depth of the statement's own FROM.
  A join with no separator found counts as a comma.
  The default dialect parses a comma join with no kind, so it never needs this.
  Port of `_comma_joined`."
  [sql dialect join-count]
  (if (nil? dialect)
    (vec (repeat join-count false))
    (let [entries    (loop [tokens (ast/tokenize sql dialect), depth 0, entries []]
                       (if-let [[token-type] (first tokens)]
                         (if (and (= "SEMICOLON" token-type) (zero? depth))
                           entries
                           (let [depth (cond-> depth (= "R_PAREN" token-type) dec)]
                             (recur (next tokens)
                                    (cond-> depth (= "L_PAREN" token-type) inc)
                                    (conj entries [token-type depth]))))
                         entries))
          ;; `IS DISTINCT FROM` is not a FROM clause. A CTE's FROM can share the depth of a bracketed query's, and comes
          ;; first.
          froms      (filterv (fn [i]
                                (and (= "FROM" (first (entries i)))
                                     (not= "DISTINCT" (first (get entries (dec i))))))
                              (range (count entries)))]
      (if (empty? froms)
        (vec (repeat join-count true))
        (let [from-depth (apply min (map #(second (entries %)) froms))
              from-index (apply max (filter #(= from-depth (second (entries %))) froms))
              separators (into []
                               (comp (filter (fn [[token-type depth]]
                                               (and (= from-depth depth)
                                                    (#{"COMMA" "JOIN" "STRAIGHT_JOIN"} token-type))))
                                     (map first)
                                     (take join-count))
                               (subvec entries (inc from-index)))]
          (into (mapv #(= "COMMA" %) separators)
                (repeat (- join-count (count separators)) true)))))))

(defn- upper-arg [join k]
  (u/upper-case-en (ast/text join k)))

(defn- step-strategy
  "The join's strategy: `inner`, `left`, `right`, `full` or `cross`.
  Throws a `comma-join` refusal for a comma join.
  Port of `_join_step_strategy`."
  [join comma?]
  (let [args   (set-args join)
        side   (upper-arg join "side")
        kind   (upper-arg join "kind")
        method (upper-arg join "method")]
    ;; `FROM a, b` has its condition, if any, in the WHERE clause, which the step queries leave out, so they would
    ;; count the whole cross product.
    (when (or (and (= "" side kind method)
                   (not-any? args ["on" "using"]))
              (and (= "CROSS" kind)
                   comma?))
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

(def ^:private marker-dialects
  "The dialects whose databases run the marker join of [[left-join-counts]], the default dialect (nil) among them."
  #{nil "mysql" "postgres"})

(defn- uses-marker-name?
  "Whether any identifier under `nodes` is one of the marker's names."
  [nodes]
  (some #(#{"mb_marker" "mb_matched"} (ast/lower (ast/node-name %)))
        (mapcat #(ast/find-all % Expressions$Identifier) nodes)))

(defn- left-join-counts
  "The output and matched counts of a chain ending in a LEFT join, from one evaluation of it, or nil.
  The joined source is cross joined with a one-row relation holding a marker, which is NULL on a row with no match.
  Port of `_left_join_counts`."
  [from-node chain with-node dialect]
  (let [join (peek chain)]
    (when-not (or (not (contains? marker-dialects dialect))
                  (not (ast/instance-of-any? [Expressions$Table Expressions$Subquery] (ast/this join)))
                  (not-every? #{"this" "on" "using" "side" "kind"} (set-args join))
                  (not (#{"" "OUTER"} (upper-arg join "kind")))
                  (uses-marker-name? (cons from-node chain)))
      (let [one    (ast/create "Literal" {"this" "1", "is_string" false})
            marker (ast/create "Subquery"
                               {"this"  (ast/create "Select"
                                                    {"expressions" [(ast/create "Alias"
                                                                                {"this"  one
                                                                                 "alias" (ast/to-identifier
                                                                                          "mb_matched")})]})
                                "alias" (ast/create "TableAlias" {"this" (ast/to-identifier "mb_marker")})})
            source (doto (ast/copy (ast/this join))
                     (ast/set-arg! "joins" [(ast/create "Join" {"this" marker, "kind" "CROSS"})]))
            last'  (doto (ast/copy join)
                     (ast/set-arg! "this" (ast/create "Subquery" {"this" source})))
            count' (ast/create "Count" {"this" (ast/create "Column" {"this"  (ast/to-identifier "mb_matched")
                                                                     "table" (ast/to-identifier "mb_marker")})})]
        (with-clause
          (ast/create "Select"
                      {"expressions" [(count-star-as-n)
                                      (ast/create "Alias" {"this" count', "alias" (ast/to-identifier "m")})]
                       "from_"       (ast/copy from-node)
                       "joins"       (conj (mapv ast/copy (pop chain)) last')})
          with-node)))))

(defn- merged-with
  "One WITH clause holding the CTEs of `withs`, outermost first, or nil for none."
  [withs dialect]
  (case (count withs)
    0 nil
    1 (first withs)
    ;; One WITH list cannot hold a CTE and the inner one that shadows it, nor one scope's modifiers for all of them.
    (if-not (and (apply distinct? (map #(effective-name (ast/this (ast/arg % "alias")) dialect)
                                       (mapcat ast/expressions withs)))
                 (every? (fn [with-node] (every? #{"expressions" "recursive"} (set-args with-node))) withs))
      (throw (unsupported "not-a-select"))
      (doto (ast/copy (first withs))
        (ast/set-arg! "expressions" (into [] (comp (mapcat ast/expressions) (map ast/copy)) withs))
        (ast/set-arg! "recursive" (boolean (some #(ast/arg % "recursive") withs)))))))

(defn- whole-query
  "`stmt` without brackets around the whole of it, and the WITH clause it runs under, or nil.
  Throws a `not-a-select` refusal for brackets with a clause other than WITH, ORDER BY, LIMIT or OFFSET.
  Port of `_whole_query`."
  [stmt dialect]
  (loop [stmt stmt, withs []]
    (if (and (instance? Expressions$Subquery stmt) (empty? (ast/node-alias stmt)))
      (do
        (when-not (every? #{"this" "with_" "order" "limit" "offset"} (set-args stmt))
          (throw (unsupported "not-a-select")))
        (recur (ast/this stmt) (cond-> withs (ast/arg stmt "with_") (conj (ast/arg stmt "with_")))))
      [stmt (merged-with (cond-> withs
                           (and (instance? Expressions$Select stmt) (ast/arg stmt "with_"))
                           (conj (ast/arg stmt "with_")))
                         dialect)])))

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
                             (some-> with-node ast/expressions))
          commas       (comma-joined sql dialect (count joins))]
      {:status   "ok"
       :from     (step-source (ast/this from-node) cte-names dialect)
       :base_sql (ast/sql (count-select from-node [] with-node) dialect)
       :steps    (vec (map-indexed
                       (fn [i join]
                         (let [source   (step-source (ast/this join) cte-names dialect)
                               strategy (step-strategy join (commas i))
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
