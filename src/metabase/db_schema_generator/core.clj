(ns metabase.db-schema-generator.core
  (:require
   [cheshire.core :as json]
   [clojure.set :as set]
   [clojure.string :as str]))

(def debug-mode (atom false))

(defn debug [& msgs]
  (when @debug-mode
    (println (apply str msgs))))

(def default-type-sizes
  {:mysql
   {:varchar {:length 512}
    :decimal {:precision 10 :scale 5}
    :numeric {:precision 10 :scale 5}}})

(def database-type-mappings
  {:postgres
   {:int4 "INTEGER"
    :int2 "SMALLINT"
    :int8 "BIGINT"
    :timestamp "TIMESTAMP"
    :varchar "VARCHAR"
    :text "TEXT"
    :bool "BOOLEAN"
    :boolean "BOOLEAN"
    :bpchar "CHAR"
    :numeric "NUMERIC"
    :decimal "NUMERIC"
    :date "DATE"
    :datetime "TIMESTAMP"
    :json "JSONB"
    :jsonb "JSONB"
    :money "MONEY"
    :name "NAME"
    :flag "BOOLEAN"
    :bytea "BYTEA"
    :uuid "UUID"
    :enum "TEXT"
    :set "TEXT"}

   :mysql
   {:int4 "INT"
    :int2 "SMALLINT"
    :int8 "BIGINT"
    :integer "INT"
    :timestamp "TIMESTAMP"
    :varchar "VARCHAR"
    :nvarchar "VARCHAR"
    :character "VARCHAR"
    :text "VARCHAR"
    :flag "BOOLEAN"
    :bool "BOOLEAN"
    :boolean "BOOLEAN"
    :numeric "DECIMAL"
    :decimal "DECIMAL"
    :date "DATE"
    :datetime "DATETIME"
    :json "JSON"
    :jsonb "JSON"
    :bytea "BLOB"
    :binary "BLOB"
    :uuid "CHAR(36)"
    :enum "VARCHAR"
    :set "VARCHAR"}

   :redshift
   {:int4 "INTEGER"
    :int2 "SMALLINT"
    :int8 "BIGINT"
    :integer "INTEGER"
    :timestamp "TIMESTAMP"
    :varchar "VARCHAR"
    :nvarchar "VARCHAR"
    :character "VARCHAR"
    :text "VARCHAR(MAX)"
    :bool "BOOLEAN"
    :boolean "BOOLEAN"
    :flag "BOOLEAN"
    :numeric "DECIMAL"
    :decimal "DECIMAL"
    :date "DATE"
    :datetime "TIMESTAMP"
    :json "VARCHAR(MAX)"
    :jsonb "VARCHAR(MAX)"
    :uuid "VARCHAR(36)"
    :enum "VARCHAR(MAX)"
    :set "VARCHAR(MAX)"}

   :snowflake
   {:int4 "INTEGER"
    :int2 "SMALLINT"
    :int8 "BIGINT"
    :integer "INTEGER"
    :timestamp "TIMESTAMP_NTZ"
    :varchar "VARCHAR"
    :nvarchar "VARCHAR"
    :character "VARCHAR"
    :text "TEXT"
    :bool "BOOLEAN"
    :boolean "BOOLEAN"
    :flag "BOOLEAN"
    :numeric "NUMBER"
    :decimal "NUMBER"
    :date "DATE"
    :datetime "TIMESTAMP_NTZ"
    :json "VARIANT"
    :jsonb "VARIANT"
    :bytea "BINARY"
    :binary "BINARY"
    :uuid "VARCHAR(36)"
    :enum "VARCHAR"
    :set "VARCHAR"}

   :sqlite
   {:int4 "INTEGER"
    :int2 "SMALLINT"
    :int8 "INTEGER"
    :integer "INTEGER"
    :timestamp "DATETIME"
    :varchar "TEXT"
    :nvarchar "TEXT"
    :character "TEXT"
    :text "TEXT"
    :bool "INTEGER"
    :boolean "INTEGER"
    :flag "INTEGER"
    :numeric "REAL"
    :decimal "REAL"
    :date "DATE"
    :datetime "DATETIME"
    :json "TEXT"
    :jsonb "TEXT"
    :bytea "BLOB"
    :binary "BLOB"
    :uuid "TEXT"
    :enum "TEXT"
    :set "TEXT"}})

(defn- sanitize-identifier
  "Convert name to a valid database identifier"
  [name dialect]
  (-> name
      str/lower-case
      (str/replace #"\s+" "_")
      (cond->
       (#{:postgres :redshift :snowflake :sqlite} dialect) (str/replace #"[^a-z0-9_]" "")
       (= dialect :mysql) (str/replace #"[^a-z0-9_]" ""))))

(defn- quote-identifier
  "Surround identifier with appropriate quotes for the dialect"
  [identifier dialect]
  (case dialect
    :postgres (str "\"" (sanitize-identifier identifier dialect) "\"")
    :redshift (str "\"" (sanitize-identifier identifier dialect) "\"")
    :snowflake (str "\"" (sanitize-identifier identifier dialect) "\"")
    :sqlite (str "\"" (sanitize-identifier identifier dialect) "\"")
    :mysql (str "`" (sanitize-identifier identifier dialect) "`")
    identifier))

(defn- normalize-type-name
  "Normalize type name to lowercase and handle special cases"
  [type-str]
  (when type-str
    (let [lower-type (str/lower-case (str type-str))]
      (cond
        (str/starts-with? lower-type "enum") :enum
        (str/starts-with? lower-type "set") :set
        :else (keyword lower-type)))))

(defn- map-database-type
  "Convert database type based on target dialect"
  [field dialect]
  (let [raw-type (or (:database_type field)
                     (:base_type field)
                     "int4")
        base-type (normalize-type-name raw-type)
        mapped-type (get-in database-type-mappings [dialect base-type]
                            (name base-type))]
    (if (= dialect :mysql)
      (case base-type
        (:varchar :nvarchar :text :enum :set)
        (format "VARCHAR(%d)" (get-in default-type-sizes [:mysql :varchar :length]))

        (:numeric :decimal)
        (let [{:keys [precision scale]} (get-in default-type-sizes [:mysql :decimal])]
          (format "DECIMAL(%d,%d)" precision scale))

        mapped-type)
      mapped-type)))

(defn- generate-column-definition
  "Generate a single column's SQL definition without PK constraint"
  [field dialect]
  (let [name (quote-identifier
              (or (:name field)
                  (:display_name field)
                  "unnamed")
              dialect)
        dialect-type (map-database-type field dialect)
        is-required? (:database_required field false)
        nullable-clause (if is-required? "NOT NULL" "")]
    (format "%s %s %s"
            name
            dialect-type
            nullable-clause)))

(defn- generate-pk-constraint
  "Generate Primary Key constraint for a table"
  [fields dialect table-name]
  (when-let [pk-fields (seq (filter #(= "type/PK" (get % :semantic_type)) fields))]
    (let [pk-columns (map #(quote-identifier
                            (or (get % :name)
                                (get % :display_name)
                                "unnamed")
                            dialect)
                          pk-fields)
          constraint-name (sanitize-identifier
                           (str "pk_" (or table-name "unnamed_table"))
                           dialect)]
      (format "CONSTRAINT %s PRIMARY KEY (%s)"
              constraint-name
              (str/join ", " pk-columns)))))

(defn- distinct-by
  "Returns a lazy sequence of the elements of coll with duplicates removed.
   Duplicates are identified using a key function f."
  [f coll]
  (let [step (fn step [xs seen]
               (lazy-seq
                ((fn [[x :as xs] seen]
                   (when-let [s (seq xs)]
                     (let [key (f x)]
                       (if (contains? seen key)
                         (step (rest s) seen)
                         (cons x (step (rest s) (conj seen key)))))))
                 xs seen)))]
    (step coll #{})))

(defn- find-target-fields
  "Find all unique fields that are targets of foreign keys"
  [tables]
  (let [all-fields (mapcat :fields tables)
        fk-targets (->> all-fields
                        (filter :target)
                        (map :target)
                       ;; Use distinct-by to deduplicate targets based on table_id and name
                        (distinct-by #(vector (:table_id %) (:name %)))
                        (group-by :table_id))]
    fk-targets))

(defn- generate-unique-constraints
  "Generate UNIQUE constraints for FK target fields that aren't PKs"
  [table tables dialect]
  (let [table-id (:id table)
        target-fields (get (find-target-fields tables) table-id)
        fields (:fields table)
        pk-field-names (->> fields
                            (filter #(= :type/PK (:semantic_type %)))
                            (map :name)
                            (set))]
    (when (seq target-fields)
      (->> target-fields
           (remove #(pk-field-names (:name %)))  ; Remove fields that are already PKs
           (map (fn [field]
                  (let [field-name (quote-identifier
                                    (or (:name field)
                                        (:display_name field)
                                        "unnamed")
                                    dialect)
                        constraint-name (sanitize-identifier
                                         (str "unique_" (or (:name table) "unnamed_table") "_" (:name field))
                                         dialect)]
                    (format "CONSTRAINT %s UNIQUE (%s)"
                            constraint-name
                            field-name))))
           (seq)))))

(defn- supports-schemas?
  "Check if the database dialect supports schemas"
  [dialect]
  (not= dialect :sqlite))

(defn- is-self-referential?
  "Check if a field is a self-referential foreign key"
  [field]
  (when-let [target (:target field)]
    (= (:table_id field) (:table_id target))))


;; Modified to better handle cycles
(defn- find-strongly-connected-components
  "Find strongly connected components using Kosaraju's algorithm"
  [graph]
  (letfn [(dfs1 [v visited order]
            (if (contains? visited v)
              [visited order]
              (let [[new-visited new-order] (reduce
                                             (fn [[vis ord] w]
                                               (dfs1 w vis ord))
                                             [(conj visited v) order]
                                             (get graph v []))]
                [new-visited (conj new-order v)])))

          (transpose [g]
            (reduce-kv (fn [acc v edges]
                         (reduce (fn [a e]
                                   (update a e (fnil conj []) v))
                                 acc
                                 edges))
                       {}
                       g))

          (dfs2 [v visited component]
            (if (contains? visited v)
              [visited component]
              (let [[new-visited new-component] (reduce
                                                 (fn [[vis comp] w]
                                                   (dfs2 w vis comp))
                                                 [(conj visited v) (conj component v)]
                                                 (get (transpose graph) v []))]
                [new-visited new-component])))]

    (let [nodes (set (concat (keys graph)
                             (mapcat val graph)))
          [_ order] (reduce (fn [[vis ord] v]
                              (if (contains? vis v)
                                [vis ord]
                                (dfs1 v vis ord)))
                            [#{} []]
                            nodes)
          rev-graph (transpose graph)]
      (loop [remaining (reverse order)
             visited #{}
             components []]
        (if (empty? remaining)
          components
          (let [v (first remaining)]
            (if (contains? visited v)
              (recur (rest remaining) visited components)
              (let [[new-visited component] (dfs2 v visited #{})]
                (recur (rest remaining)
                       new-visited
                       (if (> (count component) 1)
                         (conj components component)
                         components))))))))))



(defn- break-cycle
  "Break cycle by selecting an edge to remove"
  [component graph]
  (let [edges (for [v component
                    w (get graph v)
                    :when (contains? component w)]
                [v w])]
    (first edges)))
(defn- find-all-foreign-keys
  "Find all foreign key fields in all tables"
  [tables]
  (let [fks (->> tables
                 (mapcat (fn [table]
                           (->> (:fields table)
                                (filter :target)
                                (map #(assoc % :source-table table))))))]
    (debug "Found " (count fks) " total foreign keys")
    fks))

(defn- get-table-dependencies
  "Build a map of table ID to set of dependent table IDs"
  [tables]
  (let [all-fields (mapcat :fields tables)
        fk-fields (filter :target all-fields)
        _ (debug "Found " (count fk-fields) " FK fields for dependencies")
        table-id->deps (reduce (fn [acc field]
                                 (let [source-table-id (:table_id field)
                                       target-table-id (get-in field [:target :table_id])]
                                   (if (not= source-table-id target-table-id)
                                     (update acc source-table-id
                                             (fnil conj #{})
                                             target-table-id)
                                     acc)))
                               {}
                               fk-fields)]
    ;; Ensure all tables are in the map, even if they have no dependencies
    (reduce (fn [acc table]
              (if (contains? acc (:id table))
                acc
                (assoc acc (:id table) #{})))
            table-id->deps
            tables)))

(defn- topological-sort
  "Perform topological sort, breaking cycles as needed"
  [tables]
  (let [initial-deps (get-table-dependencies tables)
        components (find-strongly-connected-components initial-deps)
        edges-to-break (map #(break-cycle % initial-deps) components)

        ;; Remove edges that break cycles
        final-deps (reduce (fn [deps [v w]]
                             (update deps v disj w))
                           initial-deps
                           edges-to-break)]

    (loop [result []
           remaining-deps final-deps]
      (if (empty? remaining-deps)
        result
        (let [independent (set (for [[table-id dependencies] remaining-deps
                                     :when (empty? dependencies)]
                                 table-id))]
          (when (empty? independent)
            (throw (ex-info "Internal error: cycle breaking failed"
                            {:remaining remaining-deps})))
          (recur (concat result independent)
                 (reduce (fn [acc [table-id dependencies]]
                           (if (contains? independent table-id)
                             acc
                             (assoc acc table-id (set/difference dependencies independent))))
                         {}
                         remaining-deps)))))))

(defn- find-edges-to-defer
  "Find foreign key fields that need to be deferred based on broken cycles"
  [tables components]
  (let [deps (get-table-dependencies tables)
        edges-to-break (set (map #(break-cycle % deps) components))]
    (->> (mapcat :fields tables)
         (filter :target)
         (filter (fn [field]
                   (let [source-id (:table_id field)
                         target-id (get-in field [:target :table_id])]
                     (contains? edges-to-break [source-id target-id])))))))

(defn- requires-inline-fks?
  "Check if the database dialect requires foreign keys to be defined inline"
  [dialect]
  (= dialect :sqlite))
(defn- format-table-reference
  "Format a table reference, optionally including schema"
  [schema table-name dialect]
  (let [quoted-table-name (quote-identifier table-name dialect)
        quoted-schema (when-not (str/blank? schema)
                        (quote-identifier schema dialect))]
    (if (and (supports-schemas? dialect)
             quoted-schema
             (not= dialect :sqlite))
      (format "%s.%s" quoted-schema quoted-table-name)
      quoted-table-name)))

(defn generate-create-schema-sql
  "Generate CREATE SCHEMA SQL based on dialect"
  [schema dialect]
  (when-not (str/blank? schema)
    (case dialect
      (:postgres :redshift :snowflake) (format "CREATE SCHEMA IF NOT EXISTS %s;"
                                               (quote-identifier schema dialect))
      :sqlite "-- SQLite does not support schema creation"
      :mysql (format "CREATE SCHEMA IF NOT EXISTS %s;"
                     (quote-identifier schema dialect))
      "-- Schema creation not supported")))

(defn generate-drop-schema-sql
  "Generate DROP SCHEMA SQL based on dialect"
  [schema dialect]
  (when-not (str/blank? schema)
    (case dialect
      (:postgres :redshift :snowflake)
      (format "DROP SCHEMA IF EXISTS %s CASCADE;"
              (quote-identifier schema dialect))
      :mysql
      (format "DROP SCHEMA IF EXISTS %s;"
              (quote-identifier schema dialect))
      :sqlite "-- SQLite does not support schema dropping"
      "-- Schema dropping not supported")))

(defn generate-drop-table-sql
  "Generate DROP TABLE SQL for a table"
  [table dialect]
  (let [schema (get table :schema)
        table-name (or (get table :name)
                       (get table :display_name)
                       "unnamed_table")
        table-reference (format-table-reference schema table-name dialect)]
    (case dialect
      :mysql (format "DROP TABLE IF EXISTS %s;" table-reference)
      :sqlite (format "DROP TABLE IF EXISTS %s;" table-reference)
      (format "DROP TABLE IF EXISTS %s CASCADE;" table-reference))))

(defn- generate-foreign-key-constraint
  "Generate a foreign key constraint clause for CREATE TABLE"
  [field tables dialect]
  (when-let [target (:target field)]
    (when-let [source-table-id (:table_id field)]
      (let [target-table-id (:table_id target)
            target-table (first (filter #(= (:id %) target-table-id) tables))
            source-field-name (quote-identifier
                               (or (:name field)
                                   (:display_name field)
                                   "unnamed")
                               dialect)
            target-schema (get target-table :schema)
            target-table-name (or (:name target-table)
                                  (:display_name target-table)
                                  "unnamed_table")
            target-table-ref (format-table-reference
                              target-schema
                              target-table-name
                              dialect)
            target-column-name (quote-identifier
                                (or (:name target)
                                    (:display_name target)
                                    "unnamed")
                                dialect)
            constraint-name (sanitize-identifier
                             (str "fk_"
                                  (or (:name (first (filter #(= (:id %) source-table-id) tables)))
                                      "unnamed")
                                  "_"
                                  (:name field))
                             dialect)]
        (format "CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)"
                constraint-name
                source-field-name
                target-table-ref
                target-column-name)))))

(defn generate-add-foreign-key-sql
  "Generate ALTER TABLE ADD FOREIGN KEY statement"
  [field tables dialect]
  (when-let [target (:target field)]
    (when-let [source-table-id (:table_id field)]
      (let [target-table-id (:table_id target)
            source-table (first (filter #(= (:id %) source-table-id) tables))
            target-table (first (filter #(= (:id %) target-table-id) tables))]
        (when (and source-table target-table)
          (let [source-schema (get source-table :schema)
                source-table-name (or (:name source-table) "unnamed")
                source-table-ref (format-table-reference
                                  source-schema
                                  source-table-name
                                  dialect)
                source-field-name (quote-identifier
                                   (or (:name field)
                                       (:display_name field)
                                       "unnamed")
                                   dialect)
                target-schema (get target-table :schema)
                target-table-name (or (:name target-table)
                                      (:display_name target-table)
                                      "unnamed_table")
                target-table-ref (format-table-reference
                                  target-schema
                                  target-table-name
                                  dialect)
                target-column-name (quote-identifier
                                    (or (:name target)
                                        (:display_name target)
                                        "unnamed")
                                    dialect)
                constraint-name (sanitize-identifier
                                 (str "fk_"
                                      (or (:name source-table) "unnamed")
                                      "_"
                                      (:name field))
                                 dialect)]
            (format "ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s);"
                    source-table-ref
                    constraint-name
                    source-field-name
                    target-table-ref
                    target-column-name)))))))

(defn generate-create-table-sql
  "Generate CREATE TABLE SQL from table metadata"
  [table metadata dialect deferred-fks]
  (let [schema (get table :schema)
        table-name (or (:name table)
                       (:display_name table)
                       "unnamed_table")
        table-reference (format-table-reference schema table-name dialect)
        fields (:fields table)
        description (:description table)

        ;; Generate column definitions and basic constraints
        column-definitions (map #(generate-column-definition % dialect) fields)
        pk-constraint (generate-pk-constraint fields dialect table-name)
        unique-constraints (generate-unique-constraints table (:tables metadata) dialect)

        ;; Handle foreign key constraints based on dialect
        fk-fields (if (= dialect :sqlite)
                   ;; For SQLite, include all FK constraints inline
                    (filter :target fields)
                   ;; For other dialects, exclude deferred FKs
                    (let [deferred-field-set (set (map (juxt :table_id :name) deferred-fks))]
                      (remove #(contains? deferred-field-set
                                          [(:table_id %) (:name %)])
                              (filter :target fields))))

        foreign-key-constraints (when (or (requires-inline-fks? dialect)
                                          (= dialect :sqlite))
                                  (map #(generate-foreign-key-constraint % (:tables metadata) dialect)
                                       fk-fields))

        all-definitions (remove nil?
                                (concat column-definitions
                                        (when pk-constraint [pk-constraint])
                                        unique-constraints
                                        foreign-key-constraints))
        definitions-sql (str/join ",\n  " all-definitions)]
    (when (seq column-definitions)
      (str (format "CREATE TABLE %s (\n  %s\n);"
                   table-reference
                   definitions-sql)
           (when description
             (str " -- " description))))))


(defn generate-sql-from-metadata
  "Generate complete SQL for schemas and tables"
  [metadata]
  (let [dialect (keyword (get metadata :engine "postgres"))
        tables (get metadata :tables [])
        deps (get-table-dependencies tables)
        _ (debug "Table dependencies: " deps)
        components (find-strongly-connected-components deps)
        _ (debug "Found strongly connected components: " components)

        ;; For non-SQLite, track all foreign keys that need to be deferred
        deferred-fks (when-not (= dialect :sqlite)
                       (let [cycle-fks (find-edges-to-defer tables components)
                             self-ref-fks (filter is-self-referential?
                                                  (find-all-foreign-keys tables))]
                         (debug "Found " (count cycle-fks) " cycle-breaking FKs")
                         (debug "Found " (count self-ref-fks) " self-referential FKs")
                         (concat cycle-fks self-ref-fks)))

        sorted-table-ids (topological-sort tables)
        sorted-tables (sort-by #(.indexOf sorted-table-ids (:id %)) tables)
        schemas (->> tables
                     (map :schema)
                     (remove str/blank?)
                     distinct)

        ;; Generate all SQL statements
        drop-schema-sqls (map #(generate-drop-schema-sql % dialect) schemas)
        drop-table-sqls (map #(generate-drop-table-sql % dialect) sorted-tables)
        schema-sqls (map #(generate-create-schema-sql % dialect) schemas)
        table-sqls (->> sorted-tables
                        (map #(generate-create-table-sql % metadata dialect deferred-fks))
                        (filter some?))

        ;; For non-SQLite dialects, generate ALTER TABLE statements for all FKs that weren't included inline
        fk-sqls (when-not (= dialect :sqlite)
                  (let [all-fks (find-all-foreign-keys tables)
                        _ (debug "Total FKs found: " (count all-fks))
                        inline-fk-fields (mapcat :fields sorted-tables)
                        deferred-field-set (set (map (juxt :table_id :name) deferred-fks))
                        fks-to-add (remove #(contains? deferred-field-set
                                                       [(:table_id %) (:name %)])
                                           all-fks)]
                    (debug "Generating ALTER statements for " (count fks-to-add) " FKs")
                    (->> fks-to-add
                         (map #(generate-add-foreign-key-sql % tables dialect))
                         (remove nil?))))]

    (str/join "\n" (remove nil? (concat
                                 drop-schema-sqls
                                 drop-table-sqls
                                 schema-sqls
                                 table-sqls
                                 fk-sqls)))))

(defn read-table-metadata
  "Read table metadata from a JSON file"
  [file-path]
  (json/parse-string (slurp file-path) true))

(defn -main [& args]
  (let [[json-file] args
        metadata (read-table-metadata json-file)
        sql (generate-sql-from-metadata metadata)]
    (println sql)))
