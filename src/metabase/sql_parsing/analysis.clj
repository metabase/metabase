(ns metabase.sql-parsing.analysis
  "Query analysis: schema validation, column lineage, and statement-shape checks."
  (:require
   [metabase.sql-parsing.ast :as ast]
   [metabase.sql-parsing.ffi :as ffi]
   [metabase.sql-parsing.references :as references]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- simple-query? -------------------------------------------

(defn simple-query?
  "Check whether `sql` is a simple SELECT: no set operations, CTEs, LIMIT, or OFFSET. Returns
  `{:is_simple true}` or `{:is_simple false :reason ..}`."
  [dialect sql]
  (try
    (let [parsed  (ffi/parse-one dialect sql)
          t       (ast/tag parsed)
          content (when t (ast/content parsed))]
      (cond
        (not (ast/query-tags t))  {:is_simple false :reason "Not a simple SELECT"}
        (:with content)           {:is_simple false :reason "Contains a CTE"}
        (not= t :select)          {:is_simple false :reason "Not a simple SELECT"}
        (:limit content)          {:is_simple false :reason "Contains a LIMIT"}
        (:offset content)         {:is_simple false :reason "Contains an OFFSET"}
        :else                     {:is_simple true}))
    (catch Exception e
      (if (ffi/parse-error? e)
        {:is_simple false :reason (ex-message e)}
        {:is_simple false :reason (str "Unexpected error: " (ex-message e))}))))

;;; ------------------------------------------- is-single-stmt-of-type? -------------------------------------------

(defn is-single-stmt-of-type?
  "Check that `sql` is a single statement of the given kind (`\"read\"` allows SELECT and set
  operations, anything else allows INSERT/UPDATE/DELETE) and reconstruct it from the AST. Returns
  `{:is-single-stmt? .. :allowed-stmt-type? .. :sql? .. :error? ..}`."
  [dialect sql stmt-type]
  (try
    (let [stmts   (ffi/parse dialect sql)
          allowed (if (= (name stmt-type) "read")
                    ast/query-tags
                    #{:insert :update :delete})]
      (if (= 1 (count stmts))
        {:is-single-stmt?    true
         :allowed-stmt-type? (contains? allowed (ast/tag (first stmts)))
         :sql                (ffi/generate-one dialect (first stmts))}
        {:is-single-stmt? false :allowed-stmt-type? false}))
    (catch Exception e
      {:is-single-stmt? false :allowed-stmt-type? false :error (ex-message e)})))

;;; ------------------------------------------- validate-query -------------------------------------------

(defn- schema-lookup
  "Normalize a `{schema {table {column type}}}` map into
  `{lower-schema {lower-table #{lower-column}}}`; a nil schema key stays nil."
  [sqlglot-schema]
  (into {}
        (map (fn [[schema tables]]
               [(some-> schema u/lower-case-en)
                (into {}
                      (map (fn [[table columns]]
                             [(u/lower-case-en table)
                              (into #{} (map (comp u/lower-case-en key)) columns)]))
                      tables)]))
        sqlglot-schema))

(defn- table-columns
  "The known column set for an `:all-columns` table reference, or nil when the table is not in the
  schema (in which case nothing can be validated against it)."
  [lookup default-schema table-info]
  (let [schema (or (:schema table-info) default-schema)]
    (get-in lookup [(some-> schema u/lower-case-en)
                    (u/lower-case-en (:table table-info))])))

(defn- field-provides-column?
  "Whether a candidate source field can provide `column-name` given the known schema."
  [lookup default-schema column-name field]
  (case (:type field)
    :all-columns     (let [columns (table-columns lookup default-schema (:table field))]
                       (or (nil? columns)
                           (contains? columns column-name)))
    :unknown-columns true
    ;; a projected field provides the column when its output name matches
    (= column-name (some-> (or (:alias field) (:column field)) u/lower-case-en))))

(defn- single-columns
  "All `:single-column` specs referenced by a field spec, including those nested in computed and
  composite fields."
  [field]
  (case (:type field)
    :single-column    [field]
    :custom-field     (mapcat single-columns (:used-fields field))
    :composite-field  (mapcat single-columns (:member-fields field))
    []))

(defn- unresolved-column
  "The first column reference that cannot be resolved against the schema, or nil."
  [lookup default-schema field-refs]
  (let [fields (mapcat single-columns (concat (:returned-fields field-refs)
                                              (:used-fields field-refs)))]
    (some (fn [{:keys [column source-columns]}]
            (let [column-lower (u/lower-case-en column)
                  candidates   (apply concat source-columns)]
              (when (and (seq candidates)
                         (not-any? #(field-provides-column? lookup default-schema column-lower %)
                                   candidates))
                column)))
          fields)))

(defn- walker-error->validation-error
  [{:keys [type name]}]
  (case type
    :syntax-error        {:status  "error"
                          :type    "invalid_expression"
                          :message "Invalid expression / Unexpected token."}
    :missing-column      {:status  "error"
                          :type    "column_not_resolved"
                          :message (str "Column '" name "' could not be resolved.")
                          :column  name}
    :missing-table-alias {:status  "error"
                          :type    "unknown_table"
                          :message (str "Unknown table: " name)
                          :table   name}
    {:status "error" :type "unhandled" :message (pr-str type)}))

(defn validate-query
  "Validate `sql`, returning `{:status \"ok\"}` or
  `{:status \"error\" :type .. :message .. & details}`.

  With a non-empty `sqlglot-schema` (`{schema {table {column type}}}`), column references are also
  resolved against the schema (strict mode); unqualified tables default to `default-table-schema`.
  Tables absent from the schema are not reported — unknown-table detection happens in the
  sql-tools layer against actual database metadata. Without a schema only the syntax is checked."
  [dialect sql default-table-schema & [sqlglot-schema]]
  (try
    (ffi/parse dialect sql)
    (if (empty? sqlglot-schema)
      {:status "ok"}
      (let [field-refs (references/field-references dialect sql)
            lookup     (schema-lookup sqlglot-schema)]
        (or (some-> (first (:errors field-refs)) walker-error->validation-error)
            (when-let [column (unresolved-column lookup default-table-schema field-refs)]
              {:status  "error"
               :type    "column_not_resolved"
               :message (str "Column '" column "' could not be resolved.")
               :column  column})
            {:status "ok"})))
    (catch Exception e
      (if (ffi/parse-error? e)
        {:status  "error"
         :type    "invalid_expression"
         :message (ex-message e)}
        {:status "error" :type "unhandled" :message (ex-message e)}))))

;;; ------------------------------------------- returned-columns-lineage -------------------------------------------

(defn- select-item-name
  [item]
  (case (ast/tag item)
    :alias  (get-in (ast/content item) [:alias :name])
    :column (get-in (ast/content item) [:name :name])
    :dot    (get-in (ast/content item) [:field :name])
    nil))

(declare query-select-names)

(defn- schema-table-columns
  "Column names for `table-name` anywhere in the user-supplied schema map, or nil."
  [sqlglot-schema table-name]
  (some (fn [[_schema tables]]
          (some (fn [[table columns]]
                  (when (= (u/lower-case-en table) (u/lower-case-en table-name))
                    (mapv key columns)))
                tables))
        sqlglot-schema))

(defn- source-select-names
  "Output column names of a FROM/JOIN source, or `[\"*\"]` when they cannot be determined."
  [source cte-env sqlglot-schema]
  (case (ast/tag source)
    :table    (let [table-name (get-in (ast/content source) [:name :name])]
                (or (get cte-env table-name)
                    (schema-table-columns sqlglot-schema table-name)
                    ["*"]))
    :subquery (query-select-names (:this (ast/content source)) cte-env sqlglot-schema)
    ["*"]))

(defn- source-matches-ref?
  [source table-ref]
  (let [c (when (= (ast/tag source) :table) (ast/content source))]
    (or (= table-ref (get-in c [:alias :name]))
        (= table-ref (get-in c [:name :name]))
        (and (= (ast/tag source) :subquery)
             (= table-ref (get-in (ast/content source) [:alias :name]))))))

(defn- query-select-names
  "Output column names of a query node, expanding `*` through subqueries, CTEs, and the provided
  schema where possible (an unexpandable star stays `\"*\"`). For set operations, the left side
  names the columns."
  ([node] (query-select-names node {} nil))
  ([node cte-env sqlglot-schema]
   (case (ast/tag node)
     :select
     (let [content  (ast/content node)
           cte-env  (reduce (fn [env cte]
                              (assoc env
                                     (get-in cte [:alias :name])
                                     (query-select-names (:this cte) env sqlglot-schema)))
                            cte-env
                            (get-in content [:with :ctes]))
           sources  (concat (get-in content [:from :expressions])
                            (map :this (:joins content)))]
       (into []
             (mapcat (fn [item]
                       (if (= (ast/tag item) :star)
                         (if-let [table-ref (get-in (ast/content item) [:table :name])]
                           (let [source (first (filter #(source-matches-ref? % table-ref) sources))]
                             (if source
                               (source-select-names source cte-env sqlglot-schema)
                               ["*"]))
                           (mapcat #(source-select-names % cte-env sqlglot-schema) sources))
                         (some-> (select-item-name item) vector))))
             (:expressions content)))

     (:union :intersect :except)
     (query-select-names (:left (ast/content node)) cte-env sqlglot-schema)

     [])))

(defn- ->validation-schema
  "Convert a `{schema {table {column type}}}` map to the library's ValidationSchema shape."
  [sqlglot-schema]
  {:tables (vec (for [[schema tables] sqlglot-schema
                      [table columns] tables]
                  (cond-> {:name    table
                           :columns (mapv (fn [[column col-type]]
                                            {:name column :type col-type})
                                          columns)}
                    schema (assoc :schema schema))))})

(defn- lineage-nodes
  [graph]
  (cons graph (mapcat lineage-nodes (:downstream graph))))

(defn- unwrap-alias
  [expression]
  (if (= (ast/tag expression) :alias)
    (:this (ast/content expression))
    expression))

(defn- pure-lineage?
  "Whether the lineage graph is a straight path of column references terminated by a table, i.e.
  the output column is a direct pass-through of a source column."
  [graph]
  (every? (fn [node]
            (and (<= (count (:downstream node)) 1)
                 (contains? #{:column :table} (ast/tag (unwrap-alias (:expression node))))))
          (lineage-nodes graph)))

(defn- lineage-leaves
  "`[catalog schema table column]` tuples for the source columns the lineage graph bottoms out in.
  Terminal nodes carry their source table in `:source`; unqualified tables get `default-schema`."
  [graph default-schema]
  (into #{}
        (keep (fn [{:keys [expression source downstream]}]
                (when (and (empty? downstream)
                           (= (ast/tag source) :table)
                           (= (ast/tag (unwrap-alias expression)) :column))
                  (let [[catalog schema table] (ast/table-parts (ast/content source))]
                    (when table
                      [catalog
                       (or schema default-schema)
                       table
                       (get-in (ast/content (unwrap-alias expression)) [:name :name])])))))
        (lineage-nodes graph)))

(defn returned-columns-lineage
  "Column lineage for each output column of `sql`: a vector of `[name pure? deps]` where `pure?`
  is true when the column passes a source column through unchanged and `deps` is a vector of
  `[catalog schema table column]` source dependencies."
  [dialect sql default-table-schema sqlglot-schema]
  (let [parsed (ffi/parse-one dialect sql)
        schema (->validation-schema sqlglot-schema)]
    (mapv (fn [column-name]
            (let [graph (ffi/lineage dialect sql column-name schema)]
              [column-name
               (pure-lineage? graph)
               (vec (sort (lineage-leaves graph default-table-schema)))]))
          (query-select-names parsed {} sqlglot-schema))))
