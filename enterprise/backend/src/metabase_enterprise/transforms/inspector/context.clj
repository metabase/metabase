(ns metabase-enterprise.transforms.inspector.context
  "Context building for Transform Inspector.

   The context is a map that captures everything lenses need to generate cards,
   without duplicating expensive work. "
  (:require
   [clojure.string :as str]
   [macaw.ast :as macaw.ast]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.util :as driver.u]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Source Extraction --------------------------------------------------

(defmulti extract-sources
  "Extract source table information for a transform.
   Returns a seq of maps with :table-id, :table-name, :schema, and :db-id."
  (fn [transform] (transforms.util/transform-source-type (:source transform))))

(defmethod extract-sources :mbql
  [{:keys [source]}]
  (try
    (let [query (-> (:query source)
                    transforms.util/massage-sql-query
                    qp.preprocess/preprocess)
          table-ids (metabase.lib.core/all-source-table-ids query)]
      (when (seq table-ids)
        (let [tables (t2/select :model/Table :id [:in table-ids])]
          (mapv (fn [table]
                  {:table-id   (:id table)
                   :table-name (:name table)
                   :schema     (:schema table)
                   :db-id      (:db_id table)})
                tables))))
    (catch Exception e
      (log/warn e "Failed to extract sources from MBQL transform")
      nil)))

(defmethod extract-sources :native
  [{:keys [source] :as transform}]
  (try
    (let [query (:query source)
          db-id (transforms.util/transform-source-database transform)
          database (t2/select-one :model/Database :id db-id)
          driver-kw (keyword (:engine database))
          deps (driver/native-query-deps driver-kw query)]
      (when (seq deps)
        (let [table-ids (keep :table deps)
              tables (when (seq table-ids)
                       (t2/select :model/Table :id [:in table-ids]))]
          (mapv (fn [table]
                  {:table-id   (:id table)
                   :table-name (:name table)
                   :schema     (:schema table)
                   :db-id      (:db_id table)})
                tables))))
    (catch Exception e
      (log/warn e "Failed to extract sources from native transform")
      nil)))

(defmethod extract-sources :python
  [transform]
  (try
    (let [source-tables (get-in transform [:source :source-tables])
          normalized (transforms.util/normalize-source-tables source-tables)]
      (for [[_alias {:keys [table_id database_id schema table]}] normalized
            :when table_id]
        {:table-id   table_id
         :table-name table
         :schema     schema
         :db-id      database_id}))
    (catch Exception e
      (log/warn e "Failed to extract sources from Python transform")
      nil)))

;;; -------------------------------------------------- Target Table --------------------------------------------------

(defn get-target-table
  "Get the target table for a transform. Returns nil if the target doesn't exist."
  [{:keys [target] :as transform}]
  (let [db-id (transforms.i/target-db-id transform)]
    (transforms.util/target-table db-id target)))

;;; -------------------------------------------------- Field Metadata --------------------------------------------------

(defn- get-field-stats
  "Get fingerprint stats for a field if available."
  [field]
  (let [fingerprint (:fingerprint field)
        global-fp (get fingerprint :global)
        type-fp (get fingerprint :type)
        number-fp (get type-fp :type/Number)
        temporal-fp (get type-fp :type/DateTime)]
    (when (or global-fp number-fp temporal-fp)
      (cond-> {}
        (:distinct-count global-fp)
        (assoc :distinct-count (:distinct-count global-fp))

        (some? (:nil% global-fp))
        (assoc :nil-percent (:nil% global-fp))

        (some? (:min number-fp))
        (assoc :min (:min number-fp))

        (some? (:max number-fp))
        (assoc :max (:max number-fp))

        (some? (:avg number-fp))
        (assoc :avg (:avg number-fp))

        (some? (:q1 number-fp))
        (assoc :q1 (:q1 number-fp))

        (some? (:q3 number-fp))
        (assoc :q3 (:q3 number-fp))

        (:earliest temporal-fp)
        (assoc :earliest (:earliest temporal-fp))

        (:latest temporal-fp)
        (assoc :latest (:latest temporal-fp))))))

(defn collect-field-metadata
  "Collect metadata for fields in a table, including fingerprint stats."
  [table-id]
  (let [fields (t2/select :model/Field :table_id table-id :active true)]
    (mapv (fn [field]
            (merge
             {:id            (:id field)
              :name          (:name field)
              :display-name  (:display_name field)
              :base-type     (:base_type field)
              :semantic-type (:semantic_type field)}
             (when-let [stats (get-field-stats field)]
               {:stats stats})))
          fields)))

(defn- build-table-info
  "Build table info map with fields."
  [{:keys [table-id table-name schema db-id]}]
  (let [fields (collect-field-metadata table-id)]
    {:table-id     table-id
     :table-name   table-name
     :schema       schema
     :db-id        db-id
     :column-count (count fields)
     :fields       fields}))

;;; -------------------------------------------------- Query Structure Checks --------------------------------------------------

(defn- query-has-joins?
  "Check if transform query has JOIN clauses (from AST, no execution)."
  [transform source-type preprocessed-query parsed-ast]
  (case source-type
    :mbql   (some? (get-in preprocessed-query [:stages 0 :joins]))
    :native (some? (:join parsed-ast))
    :python false))

(defn- query-has-filters?
  "Check if transform query has WHERE/filter clauses."
  [transform source-type preprocessed-query parsed-ast]
  (case source-type
    :mbql   (some? (get-in preprocessed-query [:stages 0 :filters]))
    :native (some? (:where parsed-ast))
    :python false))

(defn- query-has-group-by?
  "Check if transform query has GROUP BY clauses."
  [transform source-type preprocessed-query parsed-ast]
  (case source-type
    :mbql   (some? (get-in preprocessed-query [:stages 0 :breakout]))
    :native (some? (:group-by parsed-ast))
    :python false))

;;; -------------------------------------------------- Native SQL Parsing --------------------------------------------------

(defn- parse-native-query
  "Parse a native SQL query into a macaw AST.
   Returns nil if parsing fails."
  [transform]
  (try
    (let [sql (get-in transform [:source :query :stages 0 :native])
          db-id (transforms.util/transform-source-database transform)
          database (t2/select-one :model/Database :id db-id)
          driver-kw (keyword (:engine database))
          parsed (driver.u/parsed-query sql driver-kw)]
      (macaw.ast/->ast parsed {:with-instance? false}))
    (catch Exception e
      (log/warn e "Failed to parse native SQL query")
      nil)))

;;; -------------------------------------------------- Join Structure Extraction --------------------------------------------------

(defn- ast-join-type->strategy
  "Map macaw AST join-type to metabase join strategy keyword."
  [join-type]
  (case join-type
    :left    :left-join
    :right   :right-join
    :full    :full-join
    :cross   :cross-join
    :natural :inner-join
    :inner   :inner-join
    :inner-join))

(defn- resolve-table-name->id
  "Build a map from table-name -> table-id from sources list."
  [sources driver-kw]
  (into {} (map (fn [{:keys [table-name table-id]}]
                  [(sql.normalize/normalize-name driver-kw table-name) table-id]))
        sources))

(defn- extract-mbql-join-structure
  "Extract join structure from MBQL query."
  [preprocessed-query]
  (when-let [joins (get-in preprocessed-query [:stages 0 :joins])]
    (mapv (fn [join]
            {:strategy         (or (:strategy join) :left-join)
             :alias            (:alias join)
             :source-table     (get-in join [:stages 0 :source-table])
             :condition-fields (into #{}
                                     (mapcat lib.walk.util/all-field-ids)
                                     (:conditions join))})
          joins)))

(defn- extract-native-join-structure
  "Extract join structure from native SQL AST."
  [parsed-ast sources driver-kw]
  (when-let [join-nodes (:join parsed-ast)]
    (let [table->id (resolve-table-name->id sources driver-kw)]
      (mapv (fn [join-node]
              {:strategy     (ast-join-type->strategy (:join-type join-node))
               :alias        (sql.normalize/normalize-name
                              driver-kw
                              (or (get-in join-node [:source :table-alias])
                                  (get-in join-node [:source :table])))
               :source-table (table->id (sql.normalize/normalize-name
                                         driver-kw
                                         (get-in join-node [:source :table])))})
            join-nodes))))

(defn extract-join-structure
  "Extract join structure from query (MBQL or native).
   Does NOT execute queries - just parses AST."
  [{:keys [source-type preprocessed-query parsed-ast sources]} driver-kw]
  (case source-type
    :mbql   (extract-mbql-join-structure preprocessed-query)
    :native (extract-native-join-structure parsed-ast sources driver-kw)
    nil))

;;; -------------------------------------------------- Visited Fields Extraction --------------------------------------------------

(defn- extract-mbql-visited-fields
  "Extract field IDs from semantically important MBQL clauses."
  [query]
  (let [stage (get-in query [:stages 0])
        filter-fields (when-let [filters (:filters stage)]
                        (into #{} (mapcat lib.walk.util/all-field-ids) filters))
        group-by-fields (when-let [breakout (:breakout stage)]
                          (into #{} (mapcat lib.walk.util/all-field-ids) breakout))
        order-by-fields (when-let [order-by (:order-by stage)]
                          (into #{} (mapcat lib.walk.util/all-field-ids) order-by))
        join-fields (when-let [joins (:joins stage)]
                      (into #{}
                            (mapcat (fn [join]
                                      (mapcat lib.walk.util/all-field-ids (:conditions join))))
                            joins))]
    {:join-fields      (or join-fields #{})
     :filter-fields    (or filter-fields #{})
     :group-by-fields  (or group-by-fields #{})
     :order-by-fields  (or order-by-fields #{})
     :all              (into #{} cat [join-fields filter-fields group-by-fields order-by-fields])}))

(defn- extract-columns-from-ast-node
  "Recursively extract column nodes from a Macaw AST expression."
  [node]
  (when node
    (case (:type node)
      :macaw.ast/column
      [{:column (:column node) :table (:table node)}]

      :macaw.ast/binary-expression
      (concat (extract-columns-from-ast-node (:left node))
              (extract-columns-from-ast-node (:right node)))

      :macaw.ast/unary-expression
      (extract-columns-from-ast-node (:expression node))

      :macaw.ast/function
      (mapcat extract-columns-from-ast-node (:args node))

      nil)))

(defn- extract-native-visited-columns
  "Extract columns from native SQL WHERE, GROUP BY, and JOIN clauses."
  [ast]
  (when (= (:type ast) :macaw.ast/select)
    {:where-columns    (extract-columns-from-ast-node (:where ast))
     :group-by-columns (mapcat extract-columns-from-ast-node (:group-by ast))
     :join-columns     (mapcat (fn [join]
                                 (mapcat extract-columns-from-ast-node
                                         (:condition join)))
                               (:join ast))}))

(defn- resolve-column-to-field-id
  "Map a column name to a Metabase field ID using sources info."
  [driver-kw sources {:keys [column table]}]
  (let [norm-col (sql.normalize/normalize-name driver-kw column)
        norm-tbl (when table (sql.normalize/normalize-name driver-kw table))]
    (some (fn [{:keys [table-name fields]}]
            (when (or (nil? norm-tbl)
                      (= norm-tbl (sql.normalize/normalize-name driver-kw table-name)))
              (some (fn [field]
                      (when (= norm-col (sql.normalize/normalize-name driver-kw (:name field)))
                        (:id field)))
                    fields)))
          sources)))

(defn- resolve-native-visited-fields
  "Resolve native SQL column references to Metabase field IDs."
  [driver-kw sources {:keys [where-columns group-by-columns join-columns]}]
  (let [resolve-cols (fn [cols]
                       (into #{}
                             (keep (partial resolve-column-to-field-id driver-kw sources))
                             cols))
        filter-fields (resolve-cols where-columns)
        group-by-fields (resolve-cols group-by-columns)
        join-fields (resolve-cols join-columns)]
    {:join-fields     join-fields
     :filter-fields   filter-fields
     :group-by-fields group-by-fields
     :all             (into #{} cat [join-fields filter-fields group-by-fields])}))

(defn extract-visited-fields
  "Extract visited fields from query (MBQL or native)."
  [{:keys [source-type preprocessed-query parsed-ast sources]} driver-kw]
  (case source-type
    :mbql   (when preprocessed-query
              (extract-mbql-visited-fields preprocessed-query))
    :native (when parsed-ast
              (let [cols (extract-native-visited-columns parsed-ast)]
                (resolve-native-visited-fields driver-kw sources cols)))
    nil))

;;; -------------------------------------------------- Column Matching --------------------------------------------------

(defn- parse-joined-column-name
  "Parse a joined column name like 'Test Customers - Customer__region'.
   Returns {:alias \"Test Customers - Customer\" :field-name \"region\"} or nil."
  [name]
  (when-let [[_ alias field-name] (re-find #"^(.+)__(.+)$" name)]
    {:alias alias :field-name field-name}))

(defn- normalize-column-name
  "Normalize a column name for comparison."
  [name]
  (when name
    (-> name u/lower-case-en (str/replace #"[-_]" ""))))

(defn match-columns
  "Find columns that relate between input and output tables.
   Uses join aliases for smarter matching when available."
  [sources target join-structure]
  (let [target-fields (:fields target)
        alias->source-table (into {} (map (juxt :alias :source-table) join-structure))
        source-fields (for [{:keys [table-id table-name fields]} sources
                            field fields]
                        (assoc field :source-table-id table-id :source-table-name table-name))]
    (for [target-field target-fields
          :let [col-name (:name target-field)
                parsed (parse-joined-column-name col-name)
                matching-inputs
                (if-let [source-table-id (some-> parsed :alias alias->source-table)]
                  (let [field-name (normalize-column-name (:field-name parsed))]
                    (filter #(and (= (:source-table-id %) source-table-id)
                                  (= field-name (normalize-column-name (:name %))))
                            source-fields))
                  (let [target-name (normalize-column-name (or (:field-name parsed) col-name))]
                    (filter #(= target-name (normalize-column-name (:name %)))
                            source-fields)))]
          :when (seq matching-inputs)]
      {:output-column col-name
       :output-field  target-field
       :input-columns (mapv (fn [f]
                              {:table-id   (:source-table-id f)
                               :table-name (:source-table-name f)
                               :column     (:name f)
                               :field      f})
                            matching-inputs)})))

;;; -------------------------------------------------- Context Building --------------------------------------------------

(defn- quick-has-joins?
  "Quick check for joins without full preprocessing.
   Looks at the raw query structure."
  [transform source-type]
  (case source-type
    :mbql   (some? (get-in transform [:source :query :stages 0 :joins]))
    :native (try
              (let [sql (get-in transform [:source :query :stages 0 :native])
                    db-id (transforms.util/transform-source-database transform)
                    database (t2/select-one :model/Database :id db-id)
                    driver-kw (keyword (:engine database))
                    parsed (driver.u/parsed-query sql driver-kw)
                    ast (macaw.ast/->ast parsed {:with-instance? false})]
                (some? (:join ast)))
              (catch Exception _ false))
    false))

(defn build-base-context
  "Build base context for lens discovery.
   Cheap operations only - no query execution.

   Returns structural metadata about sources, target, and query structure."
  [transform]
  (let [source-type (transforms.util/transform-source-type (:source transform))
        sources (extract-sources transform)
        target-table (get-target-table transform)
        sources-info (mapv build-table-info sources)
        target-info (when target-table
                      (build-table-info {:table-id   (:id target-table)
                                         :table-name (:name target-table)
                                         :schema     (:schema target-table)
                                         :db-id      (:db_id target-table)}))
        ;; Quick structural checks for lens applicability
        has-joins? (quick-has-joins? transform source-type)
        ;; Column matches need target - do quick check for any matching column names
        has-column-matches? (and (seq sources-info)
                                 target-info
                                 (some (fn [src]
                                         (some (fn [src-field]
                                                 (some #(= (normalize-column-name (:name src-field))
                                                           (normalize-column-name (:name %)))
                                                       (:fields target-info)))
                                               (:fields src)))
                                       sources-info))]
    {:transform       transform
     :source-type     source-type
     :sources         sources-info
     :target          target-info
     :has-joins?      has-joins?
     ;; For column-comparison lens applicability - just needs to be truthy/falsy
     ;; Actual matches are computed in build-lens-context
     :has-column-matches? has-column-matches?}))

(defn build-lens-context
  "Build full context for lens generation .
   Adds query structure info needed for card generation. "
  [transform]
  (let [base (build-base-context transform)
        source-type (:source-type base)
        db-id (transforms.util/transform-source-database transform)
        database (t2/select-one :model/Database :id db-id)
        driver-kw (keyword (:engine database))

        ;; Parse query AST
        preprocessed-query (when (= source-type :mbql)
                             (try
                               (-> transform :source :query
                                   transforms.util/massage-sql-query
                                   qp.preprocess/preprocess)
                               (catch Exception _ nil)))
        parsed-ast (when (= source-type :native)
                     (parse-native-query transform))

        ;; Query structure checks
        has-joins? (query-has-joins? transform source-type preprocessed-query parsed-ast)
        has-filters? (query-has-filters? transform source-type preprocessed-query parsed-ast)
        has-group-by? (query-has-group-by? transform source-type preprocessed-query parsed-ast)

        ;; Extended context for join/field extraction
        extended-ctx (assoc base
                            :preprocessed-query preprocessed-query
                            :parsed-ast parsed-ast)

        ;; Extract structural info
        join-structure (extract-join-structure extended-ctx driver-kw)
        visited-fields (extract-visited-fields extended-ctx driver-kw)
        column-matches (when (and (seq (:sources base)) (:target base))
                         (match-columns (:sources base) (:target base) join-structure))]

    (assoc base
           :driver-kw          driver-kw
           :db-id              db-id
           :preprocessed-query preprocessed-query
           :parsed-ast         parsed-ast
           :has-joins?         has-joins?
           :has-filters?       has-filters?
           :has-group-by?      has-group-by?
           :join-structure     join-structure
           :visited-fields     visited-fields
           :column-matches     column-matches)))
