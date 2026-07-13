(ns metabase.sql-parsing.references
  "Table and field reference extraction over the polyglot AST.

  [[field-references]] is a scope-tracking walker that produces Macaw-compatible field specs:
  every returned/used field is one of

  - `{:type :single-column, :column .., :alias .., :source-columns [scope ...]}` where each scope
    is a vector of candidate fields the column may resolve to
  - `{:type :all-columns, :table {:table .. :schema? .. :database? .. :table-alias? ..}}`
  - `{:type :custom-field, :alias .., :used-fields #{..}}` for computed expressions
  - `{:type :composite-field, :alias .., :member-fields [..]}` for set-operation columns
  - `{:type :unknown-columns}` for sources whose output cannot be known (table functions)

  Errors are `{:type :syntax-error}`, `{:type :missing-column :name ..}` or
  `{:type :missing-table-alias :name ..}`, matching `metabase.lib.validate` constructors."
  (:require
   [metabase.sql-parsing.ast :as ast]
   [metabase.sql-parsing.ffi :as ffi]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- referenced tables -------------------------------------------

(defn- with-clause-cte-names
  [query-content]
  (into #{} (keep #(get-in % [:alias :name])) (get-in query-content [:with :ctes])))

(defn- collect-tables
  "All `[catalog schema table]` tuples for real table sources under `node`, excluding references to
  CTEs visible at that point."
  [node visible-ctes]
  (cond
    (map? node)
    (let [t (ast/tag node)]
      (cond
        (ast/query-tags t)
        (let [content (ast/content node)]
          (collect-tables content (into visible-ctes (with-clause-cte-names content))))

        (= t :table)
        (let [parts (ast/table-parts (ast/content node))]
          (if (and parts (not (contains? visible-ctes (peek parts))))
            #{parts}
            #{}))

        :else
        (transduce (map #(collect-tables % visible-ctes)) into #{} (vals node))))

    (sequential? node)
    (transduce (map #(collect-tables % visible-ctes)) into #{} node)

    :else
    #{}))

(defn- sort-tuples
  [tuples]
  (vec (sort-by #(mapv (fnil identity "") %) tuples)))

(defn referenced-tables
  "Extract `[catalog schema table]` tuples for every real table referenced in `sql`, sorted.
  CTE references and table functions are excluded. Throws on unparseable SQL."
  [dialect sql]
  (sort-tuples (collect-tables (ffi/parse dialect sql) #{})))

;;; ------------------------------------------- referenced fields -------------------------------------------

(defn- all-nodes-of-tag
  "All tagged nodes with tag `t` anywhere under `node` (including nested queries). Does not
  descend into UPDATE statements, whose FROM clauses contribute no field references."
  [node t]
  (cond
    (map? node) (cond
                  (= (ast/tag node) :update) nil
                  (= (ast/tag node) t) (cons node (mapcat #(all-nodes-of-tag % t) (vals node)))
                  :else (mapcat #(all-nodes-of-tag % t) (vals node)))
    (sequential? node) (mapcat #(all-nodes-of-tag % t) node)
    :else nil))

(defn- select-source-nodes
  "Source nodes of a select content map: JOIN sources first, then FROM entries with the first FROM
  entry last (comma-separated FROM tables behave like joins for wildcard ordering)."
  [select-content]
  (let [from-exprs (get-in select-content [:from :expressions])]
    (concat (map :this (:joins select-content))
            (rest from-exprs)
            (when (seq from-exprs) [(first from-exprs)]))))

(defn- scope-table-mapping
  "Map of source key (alias, or table name when unaliased) -> `[catalog schema table]` for the real
  table sources of one select scope."
  [select-content cte-names]
  (into {}
        (keep (fn [source]
                (when (= (ast/tag source) :table)
                  (let [c          (ast/content source)
                        table-name (get-in c [:name :name])
                        alias      (get-in c [:alias :name])
                        parts      (ast/table-parts c)]
                    (when (and parts
                               (not (contains? cte-names table-name))
                               (not (contains? cte-names alias)))
                      [(or alias table-name) parts])))))
        (select-source-nodes select-content)))

(defn- scope-fields
  "Field tuples contributed by one select scope, resolving column and wildcard references against
  the scope's own table sources (mirroring how single-scope resolution worked in sqlglot)."
  [select-content cte-names]
  (let [mapping     (scope-table-mapping select-content cte-names)
        select-node {:select select-content}
        star-fields (keep (fn [star]
                            (when-let [table-ref (get-in (ast/content star) [:table :name])]
                              (when-let [parts (get mapping table-ref)]
                                (conj parts "*"))))
                          (all-nodes-of-tag select-node :star))
        col-fields  (keep (fn [c]
                            (let [col-name  (get-in c [:name :name])
                                  table-ref (get-in c [:table :name])]
                              (cond
                                table-ref            (some-> (get mapping table-ref) (conj col-name))
                                (= 1 (count mapping)) (conj (val (first mapping)) col-name))))
                          (concat (map ast/content (all-nodes-of-tag select-node :column))
                                  (keep (comp ast/dot-column-content ast/content)
                                        (all-nodes-of-tag select-node :dot))))
        ;; a bare `SELECT *` references every column of every source in the scope
        bare-star?  (some #(and (= (ast/tag %) :star)
                                (nil? (:table (ast/content %))))
                          (:expressions select-content))
        wildcard    (when bare-star?
                      (map #(conj % "*") (vals mapping)))]
    (concat star-fields col-fields wildcard)))

(defn referenced-fields
  "Extract `[catalog schema table field]` tuples for column references that resolve to real
  database tables, sorted. Wildcards appear as `\"*\"` fields; CTE/subquery columns are excluded.
  Throws on unparseable SQL."
  [dialect sql]
  (let [root      (ffi/parse-one dialect sql)
        cte-names (into #{}
                        (mapcat #(with-clause-cte-names (ast/content %)))
                        (concat (all-nodes-of-tag root :select)
                                (mapcat #(all-nodes-of-tag root %) ast/set-op-tags)))
        fields    (into #{}
                        (mapcat #(scope-fields (ast/content %) cte-names))
                        (all-nodes-of-tag root :select))]
    (sort-tuples fields)))

;;; ------------------------------------------- field references walker -------------------------------------------

;; A "source" is a map of
;;   :names           {:table .. :schema? .. :database? .. :table-alias? ..} or nil
;;   :returned-fields [field-spec ...]
;;   :used-fields     #{field-spec ...}
;;   :errors          #{error ...}
;;   :recursive-cte?  optionally true for sources backed by a recursive CTE
;; `sources` arguments are vectors of scopes, each scope a vector of sources; the first scope is
;; the innermost.

(declare process-query find-used-fields)

(def ^:private unknown-columns-field {:type :unknown-columns})

(defn- unknown-source
  [alias]
  {:names           (when alias {:table-alias alias})
   :returned-fields [unknown-columns-field]
   :used-fields     #{}
   :errors          #{}})

(defn- table-matches?
  [{search-table :table search-schema :schema search-database :database} names]
  (boolean
   (when names
     (or (and search-table (not search-schema) (not search-database)
              (= search-table (:table-alias names)))
         (and (or (nil? search-table) (= search-table (:table names)))
              (or (nil? search-schema) (= search-schema (:schema names)))
              (or (nil? search-database) (= search-database (:database names)))
              (= search-table (:table names)))))))

(defn- find-source
  [search sources]
  (some (fn [scope]
          (when (sequential? scope)
            (some #(when (and % (table-matches? search (:names %))) %) scope)))
        sources))

(defn- source-might-have-column?
  [source _column-name table-ref]
  (boolean
   (when source
     (if table-ref
       (let [{:keys [table-alias table]} (:names source)
             table-ref (u/lower-case-en table-ref)]
         (or (some-> table-alias u/lower-case-en (= table-ref))
             (some-> table u/lower-case-en (= table-ref))))
       true))))

(defn- field-display-name
  [field]
  (or (:alias field) (:column field)))

(defn- table-match-field
  "A `:custom-field` standing in for a whole source when a bare column reference matches a source's
  alias or table name (e.g. `SELECT o FROM (SELECT ...) AS o`)."
  [column-name source]
  {:type        :custom-field
   :alias       column-name
   :used-fields (set (:returned-fields source))})

(defn- recursive-cte-column
  "When a column qualifier resolves to a recursive CTE, reference it through the CTE itself rather
  than through the CTE's (self-referential) output fields."
  [column-name source table-ref]
  (let [names      (:names source)
        table-info (cond-> {:table (or (:table names) table-ref)}
                     (:table-alias names) (assoc :table-alias (:table-alias names)))]
    {:type           :single-column
     :column         column-name
     :alias          nil
     :source-columns [[{:type :all-columns :table table-info}]]}))

(defn- matched-column-result
  "Resolve a direct match of `column-name` against a field a source already returns."
  [source-column source-columns valid-sources column-name table-ref return-table-matches?]
  (case (:type source-column)
    :single-column
    (if-let [source (and table-ref
                         (not return-table-matches?)
                         (let [source (find-source {:table table-ref} valid-sources)]
                           (when (:recursive-cte? source) source)))]
      [{:col (recursive-cte-column column-name source table-ref)}]
      (let [result-col (cond-> source-column
                         (and (nil? table-ref) (> (count source-columns) 1))
                         (assoc :source-columns source-columns))]
        [{:col result-col}]))

    :custom-field
    (if-let [source (and table-ref
                         (let [source (find-source {:table table-ref} valid-sources)]
                           (when (:recursive-cte? source) source)))]
      [{:col (recursive-cte-column column-name source table-ref)}]
      [{:col source-column}])

    [{:col source-column}]))

(defn- get-column
  "Resolve a column reference against the visible sources, returning a seq of
  `{:col field}` / `{:errors #{..}}` results."
  [sources column-content return-table-matches?]
  (let [column-name    (get-in column-content [:name :name])
        table-ref      (not-empty (get-in column-content [:table :name]))
        valid-sources  (if table-ref
                         (if-let [source (find-source {:table table-ref} sources)]
                           [[source]]
                           [[]])
                         sources)
        source-columns (into []
                             (keep (fn [scope]
                                     (when (sequential? scope)
                                       (not-empty
                                        (into []
                                              (comp (filter #(source-might-have-column? % column-name table-ref))
                                                    (mapcat :returned-fields))
                                              scope)))))
                             valid-sources)
        lower-name     (u/lower-case-en column-name)
        source-column  (some (fn [field]
                               (when (some-> (field-display-name field) u/lower-case-en (= lower-name))
                                 field))
                             (first source-columns))
        alias-match    (when (and (not source-column) (not table-ref))
                         (some (fn [scope]
                                 (when (sequential? scope)
                                   (some (fn [source]
                                           (let [{:keys [table-alias table]} (:names source)]
                                             (when (or (some-> table-alias u/lower-case-en (= lower-name))
                                                       (some-> table u/lower-case-en (= lower-name)))
                                               source)))
                                         scope)))
                               valid-sources))]
    (cond
      source-column
      (matched-column-result source-column source-columns valid-sources
                             column-name table-ref return-table-matches?)

      alias-match
      (if return-table-matches?
        [{:col (table-match-field column-name alias-match)}]
        [])

      (empty? source-columns)
      (if table-ref
        ;; unknown table qualifier: the error is enough, a column spec with no candidate sources
        ;; would only produce a redundant missing-column error downstream
        [{:errors #{{:type :missing-table-alias :name table-ref}}}]
        [{:col    {:type           :single-column
                   :column         column-name
                   :alias          nil
                   :source-columns []}
          :errors #{{:type :missing-column :name column-name}}}])

      :else
      [{:col {:type           :single-column
              :column         column-name
              :alias          nil
              :source-columns source-columns}}])))

(defn- expand-qualified-star
  "Results for `t.*`: in returned position all of the source's fields, in used position only the
  concrete ones."
  [table-ref sources returned-position?]
  (if-let [source (find-source {:table table-ref} sources)]
    (for [field (:returned-fields source)
          :when (or returned-position?
                    (not (#{:all-columns :unknown-columns} (:type field))))]
      {:col field})
    (if returned-position?
      [{:errors #{{:type :missing-table-alias :name table-ref}}}]
      [])))

(defn- find-returned-fields
  "Fields a select item contributes to the query output, as `{:col field}` / `{:errors #{..}}`."
  [expr sources withs]
  (let [expr (ast/unwrap-annotated expr)]
    (case (ast/tag expr)
      :alias
      (let [{inner :this alias-ident :alias} (ast/content expr)
            alias-name (:name alias-ident)]
        (map (fn [result]
               (cond-> result
                 (:col result) (update :col assoc :alias alias-name)))
             (find-returned-fields inner sources withs)))

      :star
      (let [table-ref (get-in (ast/content expr) [:table :name])]
        (if table-ref
          (expand-qualified-star table-ref sources true)
          (for [source (first sources)
                field  (:returned-fields source)]
            {:col field})))

      :column
      (get-column sources (ast/content expr) true)

      :dot
      (if-let [column-content (ast/dot-column-content (ast/content expr))]
        (get-column sources column-content true)
        [])

      :subquery
      (let [result (process-query (:this (ast/content expr)) sources withs)]
        (if-let [field (first (:returned-fields result))]
          [{:col field}]
          []))

      ;; anything else is a computed expression
      (let [used (into [] (keep :col) (find-used-fields expr sources withs))]
        [{:col {:type        :custom-field
                :alias       nil
                :used-fields (set used)}}]))))

(defn- find-used-fields
  "Fields referenced by an expression, as `{:col field}` / `{:errors #{..}}` results. Descends
  generically into any node shape, giving query nodes their own scope."
  [expr sources withs]
  (cond
    (nil? expr) []
    (sequential? expr) (mapcat #(find-used-fields % sources withs) expr)
    (not (map? expr)) []
    :else
    (let [t (ast/tag expr)]
      (cond
        (= t :column)
        (get-column sources (ast/content expr) false)

        (= t :dot)
        (if-let [column-content (ast/dot-column-content (ast/content expr))]
          (get-column sources column-content false)
          (mapcat #(find-used-fields % sources withs) (vals expr)))

        (= t :star)
        (if-let [table-ref (get-in (ast/content expr) [:table :name])]
          (expand-qualified-star table-ref sources false)
          [])

        (= t :alias)
        (let [{inner :this alias-ident :alias} (ast/content expr)
              results (find-used-fields inner sources withs)]
          ;; the alias names the expression result; it only belongs on the referenced column when
          ;; the alias directly wraps a column reference
          (if (#{:column :dot} (ast/tag (ast/unwrap-annotated inner)))
            (map (fn [result]
                   (cond-> result
                     (:col result) (update :col assoc :alias (:name alias-ident))))
                 results)
            results))

        (ast/query-tags t)
        (map (fn [field] {:col field})
             (:used-fields (process-query expr sources withs)))

        (= t :subquery)
        (map (fn [field] {:col field})
             (:used-fields (process-query (:this (ast/content expr)) sources withs)))

        :else
        (mapcat #(find-used-fields % sources withs) (vals expr))))))

(defn- process-source
  "Turn a FROM/JOIN source node into a source map, or nil for unsupported source kinds."
  [source-node outside-sources withs]
  (case (ast/tag source-node)
    :table
    (let [c          (ast/content source-node)
          table-name (get-in c [:name :name])
          alias      (get-in c [:alias :name])]
      (cond
        (contains? withs table-name)
        (let [names (cond-> {:table table-name}
                      alias (assoc :table-alias alias))]
          (assoc (get withs table-name) :names names))

        (empty? table-name)
        (when alias (unknown-source alias))

        :else
        (let [names (cond-> {:table table-name}
                      (get-in c [:schema :name])  (assoc :schema (get-in c [:schema :name]))
                      (get-in c [:catalog :name]) (assoc :database (get-in c [:catalog :name]))
                      alias                       (assoc :table-alias alias))]
          {:names           names
           :returned-fields [{:type :all-columns :table names}]
           :used-fields     #{}
           :errors          #{}})))

    :subquery
    (let [c     (ast/content source-node)
          alias (get-in c [:alias :name])]
      (if (= (ast/tag (:this c)) :values)
        (unknown-source alias)
        (assoc (process-query (:this c) outside-sources withs)
               :names (when alias {:table-alias alias}))))

    ;; aliased table function, e.g. `FROM generate_series(1, 10) AS g`
    :alias
    (unknown-source (get-in (ast/content source-node) [:alias :name]))

    (:function :values)
    (unknown-source nil)

    nil))

(defn- build-sources
  [select-content outside-sources withs]
  (into [] (keep #(process-source % outside-sources withs)) (select-source-nodes select-content)))

(defn- process-ctes
  "Process a WITH clause, returning `[withs' errors]` with each CTE added as a named source."
  [with-clause outside-sources withs]
  (let [recursive? (:recursive with-clause)]
    (reduce
     (fn [[withs errors] cte]
       (let [cte-name (get-in cte [:alias :name])
             body     (:this cte)
             cte-entry (fn [result extra]
                         (merge (select-keys result [:returned-fields :used-fields :errors])
                                {:names {:table cte-name}}
                                extra))
             result   (if (and recursive? (ast/set-op-tags (ast/tag body)))
                        ;; seed the recursive CTE with its base case so the recursive branch can
                        ;; resolve self-references, then process the full body
                        (let [base   (process-query (:left (ast/content body)) outside-sources withs)
                              seeded (assoc withs cte-name
                                            (cte-entry base {:names {:table cte-name :table-alias cte-name}
                                                             :recursive-cte? true}))]
                          (assoc (process-query body outside-sources seeded) :recursive-cte? true))
                        (process-query body outside-sources withs))]
         [(assoc withs cte-name (cte-entry result (when (:recursive-cte? result) {:recursive-cte? true})))
          (into errors (:errors result))]))
     [withs #{}]
     (:ctes with-clause))))

(defn- collect-results
  "Fold walker results into `{:cols [..] :errors #{..}}`."
  [results]
  (reduce (fn [acc {:keys [col errors]}]
            (cond-> acc
              col    (update :cols conj col)
              errors (update :errors into errors)))
          {:cols [] :errors #{}}
          results))

(defn- process-select
  [select-content outside-sources withs]
  (let [[withs' cte-errors]  (if-let [with-clause (:with select-content)]
                               (process-ctes with-clause outside-sources withs)
                               [withs #{}])
        local-sources        (build-sources select-content outside-sources withs')
        combined-sources     (into [local-sources] outside-sources)
        returned             (collect-results
                              (mapcat #(find-returned-fields % combined-sources withs')
                                      (:expressions select-content)))
        returned-fields      (:cols returned)
        select-source        {:names           nil
                              :returned-fields (filterv :alias returned-fields)
                              :used-fields     #{}
                              :errors          #{}}
        ;; SELECT aliases get their own scope so ORDER BY etc. resolve through them first
        sources-with-select  (into [[select-source] local-sources] outside-sources)
        used-in-select       (collect-results
                              (mapcat #(find-used-fields % combined-sources withs')
                                      (:expressions select-content)))
        used-in-clauses      (collect-results
                              (mapcat #(find-used-fields % sources-with-select withs')
                                      (concat [(:where_clause select-content)]
                                              (keep :on (:joins select-content))
                                              [(:group_by select-content)
                                               (:order_by select-content)
                                               (:having select-content)])))
        source-used-fields   (into #{}
                                   (mapcat :used-fields)
                                   (concat local-sources (vals withs')))]
    {:used-fields     (-> (set (:cols used-in-select))
                          (into (:cols used-in-clauses))
                          (into source-used-fields))
     :returned-fields returned-fields
     :errors          (-> cte-errors
                          (into (:errors returned))
                          (into (:errors used-in-select))
                          (into (:errors used-in-clauses)))}))

(defn- process-set-op
  [node outside-sources withs]
  (let [{:keys [left right]} (ast/content node)
        left-result  (process-query left outside-sources withs)
        right-result (process-query right outside-sources withs)
        left-fields  (:returned-fields left-result)
        right-fields (:returned-fields right-result)
        returned     (mapv (fn [i]
                             (let [lf (get left-fields i)
                                   rf (get right-fields i)]
                               {:type          :composite-field
                                :alias         (field-display-name (or lf rf))
                                :member-fields (into [] (keep identity) [lf rf])}))
                           (range (max (count left-fields) (count right-fields))))]
    {:used-fields     (into (set (:used-fields left-result)) (:used-fields right-result))
     :returned-fields returned
     :errors          (into (set (:errors left-result)) (:errors right-result))}))

(defn- process-query
  [node outside-sources withs]
  (let [t (ast/tag node)]
    (cond
      (= t :select)       (process-select (ast/content node) outside-sources withs)
      (ast/set-op-tags t) (process-set-op node outside-sources withs)
      :else               {:used-fields     #{}
                           :returned-fields []
                           :errors          #{{:type :syntax-error}}})))

(defn field-references
  "Extract used and returned field specs from `sql`. Returns
  `{:used-fields #{..} :returned-fields [..] :errors #{..}}`; unparseable SQL yields an empty
  result with a syntax error rather than throwing."
  [dialect sql]
  (let [root (try
               (ffi/parse-one dialect sql)
               (catch Exception e
                 (when-not (ffi/parse-error? e)
                   (throw e))
                 nil))]
    (if (nil? root)
      {:used-fields #{} :returned-fields [] :errors #{{:type :syntax-error}}}
      (let [{:keys [used-fields returned-fields errors]} (process-query root [] {})]
        {:used-fields     (set used-fields)
         :returned-fields (vec returned-fields)
         :errors          (set errors)}))))
