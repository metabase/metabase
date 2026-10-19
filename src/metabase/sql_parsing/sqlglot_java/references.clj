(ns metabase.sql-parsing.sqlglot-java.references
  "The tables and fields a query reads: `referenced_tables`, `referenced_fields`, and the table helpers they share
  with the rewrites."
  (:require
   [clojure.string :as str]
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.ast Expressions$Column Expressions$CTE Expressions$Identifier Expressions$Select
                             Expressions$Star Expressions$Table Expressions$With)
   (com.metabase.sqlglot.reference Scope)))

(set! *warn-on-reflection* true)

(defn- blank->nil [s]
  (when-not (str/blank? s) s))

(defn temp-table-prefix
  "The T-SQL temp table prefix of `table`: \"##\" for a global temp table, \"#\" for a local one, \"\" otherwise.
  sqlglot keeps the prefix as a flag on the identifier rather than in its name."
  [table]
  (let [identifier (ast/this table)]
    (cond
      (not (instance? Expressions$Identifier identifier)) ""
      (ast/arg identifier "global_")                       "##"
      (ast/arg identifier "temporary")                     "#"
      :else                                                "")))

(defn table-parts
  "`[catalog schema table]` of a Table node, or nil when it has no name (a table function)."
  [table]
  (let [table-name (ast/node-name table)]
    (when-not (str/blank? table-name)
      [(blank->nil (ast/text table "catalog"))
       (blank->nil (ast/text table "db"))
       (str (temp-table-prefix table) table-name)])))

(defn shadowing-cte-names
  "The CTE names, lower-cased, that shadow a table at `node`: those declared by a query `node` sits inside. A CTE does
  not shadow the table its own body reads, unless it is recursive."
  [node]
  (loop [current node, names #{}, own #{}]
    (if-not current
      (reduce disj names own)
      (let [declaration (ast/parent current)
            own         (cond-> own
                          (and (instance? Expressions$CTE current)
                               (seq (ast/node-alias current))
                               (not (and (instance? Expressions$With declaration)
                                         (ast/arg declaration "recursive"))))
                          (conj (u/lower-case-en (ast/node-alias current))))
            names       (into names
                              (for [value (vals (ast/args current))
                                    :when (instance? Expressions$With value)
                                    cte   (ast/expressions value)
                                    :let  [cte-alias (ast/node-alias cte)]
                                    :when (seq cte-alias)]
                                (u/lower-case-en cte-alias)))]
        (recur (ast/parent current) names own)))))

(defn statements
  "Every statement in `sql`, without the empty ones a stray semicolon leaves behind."
  [sql dialect]
  (remove nil? (ast/parse sql dialect)))

(defn table-references
  "Every Table node in the statement `stmt` that names a table: CTE references, derived tables and table functions
  are left out, and the table a statement writes is kept. This is the walk the rewrites replace by."
  [stmt]
  (for [table (ast/find-all stmt Expressions$Table)
        :when (table-parts table)
        :when (not (and (str/blank? (ast/text table "db"))
                        (str/blank? (ast/text table "catalog"))
                        (contains? (shadowing-cte-names table) (u/lower-case-en (ast/node-name table)))))]
    table))

(defn- sort-key [parts]
  (mapv #(or % "") parts))

(defn referenced-tables
  "`[catalog schema table]` of every table `sql` reads, sorted."
  [sql dialect]
  (->> (for [stmt  (statements sql dialect)
             table (table-references stmt)]
         (table-parts table))
       distinct
       (sort-by sort-key)
       vec))

(defn- scope-table-parts
  "`{alias [catalog schema table]}` for the sources of `scope` that are real tables, not CTEs."
  [^Scope scope cte-names]
  (into {}
        (for [[source-alias source] (.sources scope)
              :when (instance? Expressions$Table source)
              :let  [table-name (ast/node-name source)]
              :when (and (seq table-name)
                         (not (contains? cte-names table-name))
                         (not (contains? cte-names source-alias)))
              :let  [parts (table-parts source)]
              :when parts]
          [source-alias parts])))

(defn- unqualified-wildcard? [^Scope scope]
  (let [expression (.expression scope)]
    (and (instance? Expressions$Select expression)
         (some #(instance? Expressions$Star %) (ast/expressions expression)))))

(defn- scope-fields
  "The `[catalog schema table field]` references in `scope`, its unqualified `*` included."
  [^Scope scope cte-names]
  (let [alias->parts (scope-table-parts scope cte-names)]
    (concat
     (for [column (ast/find-all (.expression scope) Expressions$Column)
           :let   [column-name (ast/node-name column)
                   table-ref   (ast/text column "table")
                   parts       (cond
                                 (seq table-ref)          (get alias->parts table-ref)
                                 (= column-name "*")      nil
                                 (= 1 (count alias->parts)) (val (first alias->parts)))]
           :when  parts]
       (conj parts column-name))
     (when (unqualified-wildcard? scope)
       (for [parts (vals alias->parts)]
         (conj parts "*"))))))

(defn- attribute-error
  "The error Python raises calling `method` on None."
  [method]
  (ast/python-error "AttributeError" (str "'NoneType' object has no attribute '" method "'")))

(defn referenced-fields
  "`[catalog schema table field]` of every field `sql` reads from a real table, sorted; `*` for a wildcard."
  [sql dialect]
  (let [stmt        (ast/parse-one sql dialect)
        ;; `build_scope`: the last scope `traverse_scope` yields, none for a statement that holds no query (a
        ;; DELETE without a subquery), which Python fails on.
        ^Scope root (or (last (Scope/traverseScope stmt)) (throw (attribute-error "traverse")))
        cte-names   (into #{}
                          (keep #(not-empty (ast/node-alias %)))
                          (ast/find-all stmt Expressions$CTE))]
    (->> (.traverse root)
         (mapcat #(scope-fields % cte-names))
         distinct
         (sort-by sort-key)
         vec)))
