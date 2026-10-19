(ns metabase.sql-parsing.sqlglot-java.rewrite
  "Rewrites that return SQL: `add_into_clause` and `replace_names`."
  (:require
   [clojure.string :as str]
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.sql-parsing.sqlglot-java.references :as references])
  (:import
   (com.metabase.sqlglot.ast Expressions$Column Expressions$CTE Expressions$Select
                             Expressions$Subquery Expressions$Table)
   (com.metabase.sqlglot.reference Scope)
   (java.util Collections IdentityHashMap Set)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- add-into-clause -------------------------------------------------

(defn- select-star-from ^com.metabase.sqlglot.ast.Expr [table]
  (ast/create "Select" {"expressions" [(ast/create "Star")]
                        "from_"       (ast/create "From" {"this" table})}))

(defn- wrap-base-table
  "A self-UNION subquery, aliased `table-alias`, that scans `table` once but strips any IDENTITY property inherited
  from it (see [[add-into-clause]])."
  [table table-alias]
  (let [bare-table (ast/set-arg! (ast/copy table) "alias" nil)
        empty-side (ast/set-arg! (select-star-from (ast/copy bare-table))
                                 "where"
                                 (ast/create "Where" {"this" (ast/create "EQ" {"this"       (ast/create "Literal" {"this" "1" "is_string" false})
                                                                               "expression" (ast/create "Literal" {"this" "0" "is_string" false})})}))
        self-union (ast/create "Union" {"this"       (select-star-from (ast/copy bare-table))
                                        "expression" empty-side
                                        "distinct"   false})]
    (ast/create "Subquery" {"this"  self-union
                            "alias" (ast/create "TableAlias" {"this" (ast/to-identifier table-alias)})})))

(defn add-into-clause
  "`sql`, a SELECT, as a SQL Server `SELECT ... INTO table-name`, with every base table read through a self-UNION
  subquery so the new table does not inherit a source column's IDENTITY property.

  A plain `SELECT ... INTO` copies a directly-projected IDENTITY column onto the new table, which later breaks an
  incremental append with SQL Server error 8101. The UNION's second branch is always empty and SQL Server elides it,
  so each table is still scanned once. CTEs, derived tables, table functions and `#`/`##` temp tables are left
  alone. A column that reached a wrapped table by a schema-qualified name loses the qualifier, since a derived table
  is only reachable by its alias."
  [sql table-name dialect]
  (let [stmt      (ast/parse-one sql dialect)
        _         (when-not (instance? Expressions$Select stmt)
                    (throw (ast/python-error "ValueError" "SQL must be a SELECT statement")))
        cte-names (references/cte-names stmt)
        ^Set seen (Collections/newSetFromMap (IdentityHashMap.))]
    (doseq [^Scope scope (.traverse (Scope/build stmt))
            :let  [replacements (vec (for [[source-alias source] (references/real-table-sources scope cte-names)
                                           ;; A temp table has no IDENTITY lineage worth breaking, and its
                                           ;; derived-table alias would lose the prefix qualified columns keep.
                                           :when (and (empty? (references/temp-table-prefix source))
                                                      (.add seen source))]
                                       [source source-alias]))]
            [table table-alias] replacements]
      (doseq [column (.sourceColumns scope table-alias)]
        (ast/set-arg! column "db" nil)
        (ast/set-arg! column "catalog" nil))
      (ast/replace! table (wrap-base-table table table-alias)))
    (ast/set-arg! stmt "into" (ast/create "Into" {"this" (ast/to-table table-name)}))
    (ast/sql stmt dialect)))

;;; -------------------------------------------------- replace-names --------------------------------------------------

(defn- parse-identifier
  "`ident` read as a column alias, `SELECT 1 AS <ident>`: the identifier node, nil when `ident` is empty, or the
  exception when it does not parse."
  [ident dialect]
  (when (seq ident)
    (try
      (ast/arg (first (ast/expressions (ast/parse-one (str "SELECT 1 AS " ident) dialect))) "alias")
      (catch Exception e
        e))))

(defn- needs-quoting?
  "Whether the identifier `ident` must be quoted because it holds a dash or a space, or starts with a digit."
  [^String ident]
  (and (seq ident)
       (or (str/includes? ident "-")
           (str/includes? ident " ")
           (Character/isDigit (.charAt ident 0)))))

(defn- fold-keys
  "A case-insensitive view of `mapping`, whose keys are tuples of name parts. Keys that differ only in case and map
  to different values have no single answer, so they are dropped: an exact match still finds them."
  [mapping]
  (let [{:keys [folded ambiguous]}
        (reduce (fn [{:keys [folded] :as acc} [k v]]
                  (let [folded-key (mapv #(if (string? %) (ast/lower %) %) k)]
                    (cond-> (assoc-in acc [:folded folded-key] v)
                      (and (contains? folded folded-key) (not= (get folded folded-key) v))
                      (update :ambiguous conj folded-key))))
                {:folded {} :ambiguous #{}}
                mapping)]
    (apply dissoc folded ambiguous)))

(defn- fold-lookup [folded k]
  (get folded (mapv #(if (string? %) (ast/lower %) %) k)))

(defn- part-matches?
  "Whether one part of a replacement key names the same thing as the reference's. A quoted reference part is case
  significant to the engine (Postgres \"Orders\" is not orders), so it matches only as written."
  [key-part ref-part quoted?]
  (if (or (nil? key-part) (nil? ref-part))
    (and (nil? key-part) (nil? ref-part))
    (if quoted?
      (= key-part ref-part)
      (= (ast/lower key-part) (ast/lower ref-part)))))

(defn- find-table-replacement
  "The replacement for the table `[db schema table]`, most specific key shape first. Each shape is tried as written
  before it is tried part by part, so an exact key wins, and keys that differ only in the case of an unquoted part
  answer nothing rather than one of them arbitrarily."
  [table-map db schema table quoted]
  (let [shapes [[db schema table] [nil schema table] [nil nil table]]]
    (or (some #(not-empty (get table-map %)) shapes)
        (some (fn [shape]
                (let [matched (for [[map-key v] table-map
                                    :when (every? true? (map part-matches? map-key shape quoted))]
                                v)]
                  (when (seq matched)
                    (if (apply = matched) (first matched) ::ambiguous))))
              shapes))))

(defn- quoted-parts
  "Which parts of a table reference the query quoted, in replacement-key order."
  [node table-arg]
  (mapv #(ast/quoted? (ast/arg node %)) ["catalog" "db" table-arg]))

(defn- set-identifier!
  "Set `arg` of `node` to the identifier `ident-name`: quoted if the identifier it replaces was, if `ident-name`
  comes quoted, or if it needs quoting."
  [node arg ident-name dialect]
  (let [parsed      (parse-identifier ident-name dialect)
        was-quoted? (ast/quoted? parsed)
        quoted?     (or (ast/quoted? (ast/arg node arg))
                        was-quoted?
                        (needs-quoting? ident-name)
                        ;; A name that does not parse fails here, as the second parse in sql_tools.py does.
                        (when (instance? Exception parsed)
                          (throw parsed)))]
    (ast/set-arg! node arg (ast/identifier (if was-quoted? (ast/node-name parsed) ident-name) quoted?))))

(defn- replace-table!
  "Apply a table replacement to the name parts `node` keeps under `catalog`, `db` and `table-arg`. A string renames
  the table; a `{db? schema? table?}` map sets each part it names, and a nil db or schema clears that qualifier."
  [node replacement table-arg dialect]
  (let [replacement (if (string? replacement) {"table" replacement} replacement)]
    (doseq [[k arg] [["db" "catalog"] ["schema" "db"] ["table" table-arg]]]
      (cond
        (seq (get replacement k))
        (set-identifier! node arg (get replacement k) dialect)

        (and (not= k "table") (contains? replacement k) (nil? (get replacement k)))
        (ast/set-arg! node arg nil)))))

(defn- ordered-entries
  "`entries` as a map would hold them in insertion order: a repeated key keeps its first place and its last value."
  [entries]
  (let [values (into {} entries)]
    (mapv (fn [k] [k (get values k)]) (distinct (map first entries)))))

(defn- usable [replacement]
  (when (and replacement (not= replacement ::ambiguous) (seq replacement))
    replacement))

(defn- rewrite-statement [stmt {:keys [schemas folded-schemas table-map column-map]} dialect]
  ;; Names a bare column qualifier may refer to instead of a table: table and subquery aliases and CTE names.
  (let [aliases (into #{}
                      (keep #(ast/lower (not-empty (ast/node-alias %))))
                      (ast/find-all stmt Expressions$Table Expressions$Subquery Expressions$CTE))]
    ;; Mutated in place, not through a transform whose copy detaches a node from its parents: a CTE only shadows a
    ;; table for the query that declares it, which is a question about ancestors.
    (doseq [table (vec (ast/find-all stmt Expressions$Table))]
      (let [db         (not-empty (ast/text table "catalog"))
            schema     (ast/text table "db")
            table-name (ast/node-name table)
            new-schema (when (seq schema)
                         (or (not-empty (get schemas schema)) (fold-lookup folded-schemas [schema])))]
        (when (seq new-schema)
          (set-identifier! table "db" new-schema dialect))
        ;; A CTE name shadows a real table of the same name, so an unqualified reference to one declared in an
        ;; enclosing query names the CTE and is left alone.
        (when-not (and (nil? db) (empty? schema)
                       (contains? (references/shadowing-cte-names table) (ast/lower table-name)))
          ;; The schema is "" when the reference has none, as in sqlglot, so it only matches a key without one
          ;; through the bare-table shape.
          (when-let [replacement (usable (find-table-replacement table-map db schema table-name
                                                                 (quoted-parts table "this")))]
            (replace-table! table replacement "this" dialect)))))
    (doseq [column (vec (ast/find-all stmt Expressions$Column))]
      (let [column-name (ast/node-name column)
            table-ref   (ast/text column "table")
            column-db   (ast/text column "db")]
        ;; A qualifier naming a replaced table follows the table. One without a schema may name an alias instead,
        ;; which is left alone.
        (when (and (seq table-ref) (or (seq column-db) (not (contains? aliases (ast/lower table-ref)))))
          (when-let [replacement (usable (find-table-replacement table-map (not-empty (ast/text column "catalog"))
                                                                 column-db table-ref
                                                                 (quoted-parts column "table")))]
            (replace-table! column replacement "table" dialect)))
        ;; A column key matches a column qualified by the key's table, or an unqualified column with any table. The
        ;; first matching key decides.
        (let [[_ new-column] (first (filter (fn [[[_ key-table key-column]]]
                                              (and (= (ast/lower key-column) (ast/lower column-name))
                                                   (or (empty? table-ref)
                                                       (= (ast/lower (or key-table "")) (ast/lower table-ref)))))
                                            column-map))]
          (when (seq new-column)
            (ast/set-arg! column "this" (ast/identifier new-column (ast/quoted? (ast/this column))))))))
    (ast/sql stmt dialect)))

(defn replace-names
  "`sql` with the schema, table and column names in `replacements` replaced:

    {:schemas {old new}
     :tables  [[{:db? :schema? :table} new-name-or-parts] ...]
     :columns [[{:schema? :table? :column} new-name] ...]}

  with string keys, as `sql_tools.py` reads them. Replacement values go into the AST unsanitized; callers pass
  system-generated names."
  [sql replacements dialect]
  (let [{:strs [schemas tables columns]} replacements
        schemas  (or schemas {})
        context  {:schemas        schemas
                  :folded-schemas (fold-keys (map (fn [[k v]] [[k] v]) schemas))
                  ;; (db schema table) -> replacement; db is the catalog (BigQuery project, ClickHouse database)
                  :table-map      (into {} (for [[k new-name] tables]
                                             [[(get k "db") (get k "schema") (get k "table")] new-name]))
                  ;; (schema table column) -> new name, in the order the keys came: the first matching key wins
                  :column-map     (ordered-entries (for [[k new-name] columns]
                                                     [[(get k "schema") (get k "table") (get k "column")] new-name]))}
        rewritten (mapv #(rewrite-statement % context dialect) (references/statements sql dialect))]
    (if (seq rewritten)
      (str/join "; " rewritten)
      sql)))
