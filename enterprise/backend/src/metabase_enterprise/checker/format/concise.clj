(ns metabase-enterprise.checker.format.concise
  "Concise JSON schema format — single file with three flat lists, fully
   in-memory.

   The file is a single JSON document with three flat lists keyed by integer
   IDs. Tables reference their database via `:db_id`; fields reference their
   table via `:table_id`:

     {\"databases\": [{\"id\": 1, \"name\": \"Sample Database\", \"engine\": \"h2\"}, ...],
      \"tables\":    [{\"id\": 3, \"db_id\": 1, \"name\": \"PRODUCTS\", \"schema\": \"PUBLIC\"}, ...],
      \"fields\":    [{\"id\": 12, \"table_id\": 3, \"name\": \"ID\",
                       \"base_type\": \"type/BigInteger\",
                       \"semantic_type\": \"type/PK\",
                       \"database_type\": \"BIGINT\"}, ...]}

   At load time we build path-keyed indexes by joining `tables.db_id →
   databases.id` and `fields.table_id → tables.id`, so the rest of the
   checker (which speaks portable paths like `[db-name schema table]`) sees
   the same shape it gets from any other source.

   This replaces the 500k-file serdes directory tree."
  (:require
   [clojure.data.json :as json]
   [clojure.java.io :as io]
   [metabase-enterprise.checker.source :as source])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defn- build-model
  "Parse the concise metadata JSON file and build path-keyed indexes.

   The on-disk shape uses integer IDs to link entities. Here we resolve those
   IDs to their containing entity's name/path so callers can use portable
   references throughout.

   Returns:
     {:databases {db-name db-data}
      :tables    {[db-name schema table-name] table-data}
      :fields    {[db-name schema table-name field-name] field-data}}"
  [^File f]
  (let [parsed     (json/read-str (slurp f) :key-fn keyword)
        databases  (:databases parsed)
        tables     (:tables parsed)
        fields     (:fields parsed)
        ;; id-keyed lookup tables
        db-by-id   (into {} (map (juxt :id identity)) databases)
        tbl-by-id  (into {} (map (juxt :id identity)) tables)
        ;; path-keyed result maps
        db-map     (into {} (map (juxt :name identity)) databases)
        tbl-map    (into {}
                         (keep (fn [t]
                                 (when-let [db (db-by-id (:db_id t))]
                                   (let [db-name    (:name db)
                                         schema     (:schema t)
                                         table-name (:name t)
                                         table-path [db-name schema table-name]]
                                     [table-path (assoc t :db_id db-name)]))))
                         tables)
        field-map  (into {}
                         (keep (fn [field]
                                 (when-let [t (tbl-by-id (:table_id field))]
                                   (when-let [db (db-by-id (:db_id t))]
                                     (let [db-name    (:name db)
                                           schema     (:schema t)
                                           table-name (:name t)
                                           field-name (:name field)
                                           table-path [db-name schema table-name]
                                           field-path [db-name schema table-name field-name]]
                                       [field-path (assoc field :table_id table-path)])))))
                         fields)]
    {:databases db-map
     :tables    tbl-map
     :fields    field-map}))

(defn- fields-by-table
  "Build a map of table-path → set of field-paths from the fields map."
  [fields-map]
  (reduce-kv (fn [m field-path _]
               (let [table-path (subvec field-path 0 3)]
                 (update m table-path (fnil conj #{}) field-path)))
             {}
             fields-map))

(deftype ConciseSchemaSource [databases tables fields fields-index]
  source/SchemaSource
  (resolve-database [_ db-name]
    (get databases db-name))

  (resolve-table [_ table-path]
    (get tables table-path))

  (resolve-field [_ field-path]
    (get fields field-path))

  (fields-for-table [_ table-path]
    (get fields-index table-path))

  (all-field-paths [_]
    (set (keys fields)))

  (all-database-names [_]
    (keys databases))

  (all-table-paths [_]
    (keys tables))

  (tables-for-database [_ db-name]
    (filterv #(= (first %) db-name) (keys tables))))

(defn make-source
  "Create a SchemaSource from a single concise metadata JSON file.
   Loads everything into memory at construction time."
  [schema-file]
  (let [{:keys [databases tables fields]} (build-model (io/file schema-file))
        fi (fields-by-table fields)]
    (->ConciseSchemaSource databases tables fields fi)))
