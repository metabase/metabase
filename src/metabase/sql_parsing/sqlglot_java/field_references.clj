(ns metabase.sql-parsing.sqlglot-java.field-references
  "`field_references`: the fields a query uses and returns, in Macaw's output shape (`FieldReferenceWalker`).

  A source is `{:names :returned_fields :used_fields :errors}`, plus `:is_recursive_cte` for a recursive CTE. `sources`
  is a list of scope levels, innermost first, each a list of the sources in that scope (FROM and JOINs). `withs` maps a
  CTE name to its source."
  (:require
   [clojure.string :as str]
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.ast Expressions$Alias Expressions$Between Expressions$Binary Expressions$Boolean
                             Expressions$Case Expressions$Cast Expressions$Column Expressions$DataType
                             Expressions$Exists Expressions$Func Expressions$Group Expressions$Identifier
                             Expressions$In Expressions$Interval Expressions$Is Expressions$Literal Expressions$Order
                             Expressions$Ordered Expressions$Paren Expressions$Select Expressions$Star
                             Expressions$Subquery Expressions$Table Expressions$UDTF Expressions$Unary
                             Expressions$Union Expressions$Window)
   (com.metabase.sqlglot.reference ParseError)))

(set! *warn-on-reflection* true)

(def ^:private syntax-error {:type "syntax_error"})

(defn- missing-table-alias-error [table-name]
  {:type "missing_table_alias" :table table-name})

(defn- missing-column-error [column-name]
  {:type "missing_column" :column column-name})

(defn- lower [s]
  (some-> s u/lower-case-en))

(defn- not-blank [s]
  (when-not (str/blank? s) s))

;;; ------------------------------------------------------ sources ------------------------------------------------------

(defn- table-matches?
  "Whether `table-name`, a bare name, names the source with `names`: by its alias, or by its table name."
  [table-name names]
  (boolean (and names
                (or (= (:table_alias names) table-name)
                    (= (:table names) table-name)))))

(defn- find-source
  "The first source in `sources` that `table-name` names."
  [table-name sources]
  (some (fn [scope-sources]
          (some #(when (and % (table-matches? table-name (:names %))) %) scope-sources))
        sources))

(defn- source-might-have-column?
  "Whether `source` might hold the column: any source might when the column is unqualified; otherwise only the one
  its qualifier names, ignoring case."
  [source table-ref]
  (boolean (and source
                (or (str/blank? table-ref)
                    (let [{:keys [table_alias table]} (:names source)]
                      (or (and table_alias (= (lower table_alias) (lower table-ref)))
                          (and table (= (lower table) (lower table-ref)))))))))

(defn- recursive-cte-reference
  "A column read from the recursive CTE `source` by its own body: a single column whose source is the CTE itself."
  [source table-ref column-name]
  (let [names (:names source)]
    {:col {:type           "single_column"
           :column         column-name
           :alias          nil
           :source_columns [[{:type  "all_columns"
                              :table (cond-> {:table (get names :table table-ref)}
                                       (:table_alias names) (assoc :table_alias (:table_alias names)))}]]}}))

(defn- get-column
  "The column `column-name`, qualified by `table-ref` (\"\" when unqualified), resolved against `sources`, with the
  sources it might come from as `:source_columns`."
  [sources column-name table-ref return-table-matches?]
  (let [valid-sources  (if (seq table-ref)
                         (if-let [source (find-source table-ref sources)] [[source]] [[]])
                         sources)
        source-columns (vec (for [scope-sources valid-sources
                                  :let  [scope-fields (into []
                                                            (comp (filter #(source-might-have-column? % table-ref))
                                                                  (mapcat :returned_fields))
                                                            scope-sources)]
                                  :when (seq scope-fields)]
                              scope-fields))
        source-column  (some (fn [field]
                               (let [field-name (or (not-blank (:alias field)) (:column field))]
                                 (when (and field-name (= (lower field-name) (lower column-name)))
                                   field)))
                             (first source-columns))
        ;; SELECT o FROM (SELECT * FROM orders) AS o: an unqualified name may name a source rather than a column
        table-match    (when (and (not source-column) (str/blank? table-ref))
                         (some (fn [scope-sources]
                                 (some (fn [{:keys [names] :as source}]
                                         (when (and source
                                                    (some #(and % (= (lower %) (lower column-name)))
                                                          [(:table_alias names) (:table names)]))
                                           source))
                                       scope-sources))
                               valid-sources))]
    (cond
      table-match
      (if return-table-matches?
        [{:col {:type        "custom_field"
                :alias       column-name
                :used_fields (vec (:returned_fields table-match))}}]
        [])

      source-column
      (case (:type source-column)
        "single_column"
        (let [cte-source (when (and (seq table-ref) (not return-table-matches?))
                           (find-source table-ref valid-sources))]
          (if (:is_recursive_cte cte-source)
            [(recursive-cte-reference cte-source table-ref column-name)]
            [{:col (cond-> source-column
                     ;; an unqualified reference seen from several scopes keeps them all
                     (and (str/blank? table-ref) (> (count source-columns) 1))
                     (assoc :source_columns source-columns))}]))

        "custom_field"
        (let [cte-source (when (seq table-ref) (find-source table-ref valid-sources))]
          (if (:is_recursive_cte cte-source)
            [(recursive-cte-reference cte-source table-ref column-name)]
            [{:col source-column}]))

        [{:col source-column}])

      (and (empty? source-columns) (seq table-ref))
      ;; The qualifier names no source: an error only. A column with no sources would make the caller report a
      ;; second, redundant missing column.
      [{:errors #{(missing-table-alias-error table-ref)}}]

      :else
      [{:col    {:type           "single_column"
                 :column         column-name
                 :alias          nil
                 :source_columns source-columns}
        :errors (if (empty? source-columns) #{(missing-column-error column-name)} #{})}])))

;;; ------------------------------------------------------- walk --------------------------------------------------------

(declare process-query)

(defn- cols [results]
  (keep :col results))

(defn- find-used-fields
  "The fields `expr` uses (in WHERE, JOIN ON, GROUP BY, ORDER BY, HAVING, or inside a SELECT expression)."
  [expr sources withs]
  (let [recur-on (fn [e] (find-used-fields e sources withs))]
    (cond
      (nil? expr)
      []

      (instance? Expressions$Column expr)
      (let [column-name (ast/node-name expr)
            table-ref   (ast/text expr "table")]
        (if (and (= column-name "*") (seq table-ref))
          ;; t.* uses the source's fields, but not its all_columns and unknown_columns markers. A qualifier naming no
          ;; source uses nothing; the error is reported for the returned field.
          (if-let [source (find-source table-ref sources)]
            (vec (for [field (:returned_fields source)
                       :when (not (#{"all_columns" "unknown_columns"} (:type field)))]
                   {:col field}))
            [])
          (get-column sources column-name table-ref false)))

      (instance? Expressions$Star expr)
      []

      (instance? Expressions$Subquery expr)
      (mapv (fn [field] {:col field}) (:used_fields (process-query (ast/this expr) sources withs)))

      (instance? Expressions$Select expr)
      (mapv (fn [field] {:col field}) (:used_fields (process-query expr sources withs)))

      ;; An alias names the column it wraps, but not the columns a computed expression reads.
      (instance? Expressions$Alias expr)
      (let [results (recur-on (ast/this expr))]
        (if (instance? Expressions$Column (ast/this expr))
          (mapv #(cond-> % (:col %) (assoc-in [:col :alias] (ast/node-alias expr))) results)
          results))

      (instance? Expressions$Binary expr)
      (into (recur-on (ast/this expr)) (recur-on (ast/arg expr "expression")))

      (instance? Expressions$Unary expr)
      (recur-on (ast/this expr))

      (instance? Expressions$Case expr)
      (-> []
          (into (when (ast/this expr) (recur-on (ast/this expr))))
          (into (mapcat (fn [ifs] (concat (recur-on (ast/this ifs)) (recur-on (ast/arg ifs "true")))))
                (ast/arg expr "ifs"))
          (into (when (ast/arg expr "default") (recur-on (ast/arg expr "default")))))

      (instance? Expressions$Between expr)
      (-> (recur-on (ast/this expr))
          (into (recur-on (ast/arg expr "low")))
          (into (recur-on (ast/arg expr "high"))))

      (instance? Expressions$Is expr)
      (recur-on (ast/this expr))

      (instance? Expressions$In expr)
      (into (recur-on (ast/this expr)) (mapcat recur-on) (ast/expressions expr))

      (instance? Expressions$Exists expr)
      (recur-on (ast/this expr))

      (instance? Expressions$Func expr)
      (into [] (mapcat (fn [value]
                         (cond
                           (sequential? value)         (mapcat recur-on value)
                           (instance? java.util.List value) (mapcat recur-on value)
                           (ast/ast-node? value)       (recur-on value))))
            (vals (ast/args expr)))

      (instance? Expressions$Window expr)
      (-> (recur-on (ast/this expr))
          (into (mapcat recur-on) (ast/arg expr "partition_by"))
          (into (when (ast/arg expr "order") (recur-on (ast/arg expr "order")))))

      (instance? Expressions$Order expr)
      (into [] (mapcat #(recur-on (ast/this %))) (ast/expressions expr))

      (instance? Expressions$Group expr)
      (into [] (mapcat recur-on) (ast/expressions expr))

      (instance? Expressions$Ordered expr)
      (recur-on (ast/this expr))

      (instance? Expressions$Cast expr)
      (recur-on (ast/this expr))

      (instance? Expressions$Paren expr)
      (recur-on (ast/this expr))

      (some #(instance? % expr) [Expressions$Literal Expressions$Interval Expressions$DataType Expressions$Boolean])
      []

      ;; a bare identifier is a column without a table
      (instance? Expressions$Identifier expr)
      (get-column sources (ast/node-name expr) "" false)

      :else
      (into [] (mapcat recur-on) (ast/iter-expressions expr)))))

(defn- find-returned-fields
  "The fields the SELECT expression `expr` returns."
  [expr sources withs]
  (cond
    (instance? Expressions$Alias expr)
    (mapv #(cond-> % (:col %) (assoc-in [:col :alias] (ast/node-alias expr)))
          (find-returned-fields (ast/this expr) sources withs))

    ;; SELECT * returns every field of the innermost scope's sources
    (instance? Expressions$Star expr)
    (vec (for [source (first sources)
               field  (:returned_fields source)]
           {:col field}))

    (instance? Expressions$Column expr)
    (let [column-name (ast/node-name expr)
          table-ref   (ast/text expr "table")]
      (cond
        (and (= column-name "*") (seq table-ref))
        (if-let [source (find-source table-ref sources)]
          (mapv (fn [field] {:col field}) (:returned_fields source))
          [{:errors #{(missing-table-alias-error table-ref)}}])

        (= column-name "*")
        []

        :else
        (get-column sources column-name table-ref true)))

    ;; a scalar subquery returns its first column
    (instance? Expressions$Subquery expr)
    (if-let [field (first (:returned_fields (process-query (ast/this expr) sources withs)))]
      [{:col field}]
      [])

    ;; a function, CASE, arithmetic and the rest compute a field from the ones they use
    :else
    [{:col {:type        "custom_field"
            :alias       (not-blank (ast/node-alias expr))
            :used_fields (vec (cols (find-used-fields expr sources withs)))}}]))

(defn- unknown-columns-source
  "A table function's source: its columns are unknown."
  [source-alias]
  {:names           (when (seq source-alias) {:table_alias source-alias})
   :returned_fields [{:type "unknown_columns"}]
   :used_fields     #{}
   :errors          #{}})

(defn- process-source
  "The source `source-expr` (a table, a CTE reference, a subquery or a table function) in a FROM or JOIN."
  [source-expr outside-sources withs]
  (cond
    (instance? Expressions$UDTF source-expr)
    (unknown-columns-source (ast/node-alias source-expr))

    (instance? Expressions$Table source-expr)
    (let [table-name  (ast/node-name source-expr)
          table-alias (ast/node-alias source-expr)]
      (cond
        (contains? withs table-name)
        (assoc (get withs table-name) :names (cond-> {:table table-name}
                                               (seq table-alias) (assoc :table_alias table-alias)))

        ;; a table function sqlglot did not recognise, named by its alias or wrapping a function call
        (and (str/blank? table-name) (or (seq table-alias) (instance? Expressions$Func (ast/this source-expr))))
        (unknown-columns-source table-alias)

        :else
        (let [table-info (cond-> {:table table-name}
                           (seq (ast/text source-expr "db"))      (assoc :schema (ast/text source-expr "db"))
                           (seq (ast/text source-expr "catalog")) (assoc :database (ast/text source-expr "catalog"))
                           (seq table-alias)                      (assoc :table_alias table-alias))]
          {:names           table-info
           :returned_fields [{:type "all_columns" :table table-info}]
           :used_fields     #{}
           :errors          #{}})))

    (instance? Expressions$Subquery source-expr)
    (assoc (process-query (ast/this source-expr) outside-sources withs)
           :names (when (seq (ast/node-alias source-expr)) {:table_alias (ast/node-alias source-expr)}))))

(defn- build-sources
  "The sources of `select-expr`: its JOINs, then its FROM, the order Macaw expands wildcards in."
  [select-expr outside-sources withs]
  (into []
        (keep #(process-source % outside-sources withs))
        (concat (map ast/this (ast/arg select-expr "joins"))
                (some-> (ast/arg select-expr "from_") ast/this vector))))

(defn- process-ctes
  "`withs` with the CTEs `select-expr` declares added, and the errors their bodies hold."
  [select-expr outside-sources withs]
  (let [with-clause (ast/arg select-expr "with_")
        recursive?  (some-> with-clause (ast/arg "recursive"))]
    (reduce (fn [[withs errors] cte]
              (let [cte-name (ast/node-alias cte)
                    body     (ast/this cte)]
                (if (and recursive? (instance? Expressions$Union body))
                  ;; The base case, the left of the UNION, gives the CTE's fields, so the recursive part can read
                  ;; the CTE while the full body is processed.
                  (let [base   (process-query (ast/this body) outside-sources withs)
                        withs  (assoc withs cte-name (assoc base
                                                            :names            {:table cte-name :table_alias cte-name}
                                                            :is_recursive_cte true))
                        result (process-query body outside-sources withs)]
                    [(assoc withs cte-name (assoc result :names {:table cte-name} :is_recursive_cte true))
                     (into errors (:errors result))])
                  (let [result (process-query body outside-sources withs)]
                    [(assoc withs cte-name (assoc result :names {:table cte-name}))
                     (into errors (:errors result))]))))
            [withs #{}]
            (some-> with-clause ast/expressions))))

(defn- process-select [select-expr outside-sources withs]
  (let [[local-withs cte-errors] (process-ctes select-expr outside-sources withs)
        local-sources            (build-sources select-expr outside-sources local-withs)
        combined-sources         (into [local-sources] outside-sources)
        returned                 (mapcat #(find-returned-fields % combined-sources local-withs)
                                         (ast/expressions select-expr))
        returned-fields          (vec (cols returned))
        ;; SELECT aliases are a scope level of their own, ahead of the tables, for ORDER BY and the like
        select-source            {:names           nil
                                  :returned_fields (filterv #(not-blank (:alias %)) returned-fields)
                                  :used_fields     #{}
                                  :errors          #{}}
        sources-with-select      (into [[select-source] local-sources] outside-sources)
        used                     (concat
                                  (mapcat #(find-used-fields % combined-sources local-withs) (ast/expressions select-expr))
                                  (mapcat #(find-used-fields % sources-with-select local-withs)
                                          (concat [(ast/arg select-expr "where")]
                                                  (map #(ast/arg % "on") (ast/arg select-expr "joins"))
                                                  [(ast/arg select-expr "group")
                                                   (ast/arg select-expr "order")
                                                   (ast/arg select-expr "having")])))]
    {:used_fields     (-> (set (cols used))
                          (into (mapcat :used_fields) local-sources)
                          (into (mapcat :used_fields) (vals local-withs)))
     :returned_fields returned-fields
     :errors          (-> cte-errors
                          (into (mapcat :errors) returned)
                          (into (mapcat :errors) used))}))

(defn- process-union
  "A UNION's fields: each returned field is the composite of the fields both sides return in its place."
  [union-expr outside-sources withs]
  (let [left  (process-query (ast/this union-expr) outside-sources withs)
        right (process-query (ast/arg union-expr "expression") outside-sources withs)
        [left-fields right-fields] (map :returned_fields [left right])]
    {:used_fields     (into (set (:used_fields left)) (:used_fields right))
     :returned_fields (vec (for [i (range (max (count left-fields) (count right-fields)))
                                 :let [left-field  (get left-fields i)
                                       right-field (get right-fields i)
                                       named       (or left-field right-field)]]
                             {:type          "composite_field"
                              :alias         (or (not-blank (:alias named)) (:column named))
                              :member_fields (vec (remove nil? [left-field right-field]))}))
     :errors          (into (set (:errors left)) (:errors right))}))

(defn- process-query
  "The fields of the query `expr`: a SELECT or a UNION. Anything else is a syntax error."
  [expr outside-sources withs]
  (cond
    (instance? Expressions$Select expr) (process-select expr outside-sources withs)
    (instance? Expressions$Union expr)  (process-union expr outside-sources withs)
    :else                               {:used_fields #{} :returned_fields [] :errors #{syntax-error}}))

(defn field-references
  "`{:used_fields :returned_fields :errors}` for `sql`: the fields its clauses use, the fields it returns in order,
  and the qualifiers and columns that resolve to nothing."
  [sql dialect]
  (try
    (let [{:keys [used_fields returned_fields errors]} (process-query (ast/parse-one sql dialect) [] {})]
      {:used_fields     (vec used_fields)
       :returned_fields returned_fields
       :errors          (vec errors)})
    (catch ParseError _
      {:used_fields [] :returned_fields [] :errors [syntax-error]})))
