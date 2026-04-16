(ns metabase-enterprise.checker.format.concise
  "Concise JSON schema format — one file per database, everything in memory.

   Each database is a single JSON file named `<db-name>.json` containing the
   database metadata plus all its tables and fields inline:

     {\"name\": \"Sample Database\",
      \"engine\": \"h2\",
      \"tables\": [{\"name\": \"ORDERS\",
                   \"database_schema\": \"PUBLIC\",
                   \"fields\": [{\"name\": \"ID\", \"base_type\": \"type/BigInteger\", ...}]}]}

   This replaces the 500k-file serdes directory tree with ~40 JSON files that
   are fast to load and keep entirely in memory."
  (:require
   [clojure.data.json :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.checker.source :as source])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defn- load-database-json
  "Load and parse a single database JSON file. Returns the parsed map."
  [^File f]
  (json/read-str (slurp f) :key-fn keyword))

(defn- build-model
  "Load all database JSON files from `schema-dir` and build an in-memory model.

   Returns:
     {:databases {db-name db-data}
      :tables    {[db schema table] table-data}
      :fields    {[db schema table field] field-data}}"
  [^File schema-dir]
  (let [databases (volatile! {})
        tables    (volatile! {})
        fields    (volatile! {})]
    (doseq [^File f (.listFiles schema-dir)
            :when (and (.isFile f) (str/ends-with? (.getName f) ".json"))]
      (let [db       (load-database-json f)
            db-name  (:name db)
            db-data  (dissoc db :tables)]
        (vswap! databases assoc db-name db-data)
        (doseq [table (:tables db)]
          (let [schema     (:database_schema table)
                table-name (:name table)
                table-path [db-name schema table-name]
                table-data (-> table
                               (dissoc :fields :database_id :database_engine)
                               (assoc :schema schema
                                      :db_id db-name))]
            (vswap! tables assoc table-path table-data)
            (doseq [field (:fields table)]
              (let [field-name (:name field)
                    field-path [db-name schema table-name field-name]
                    field-data (assoc field :table_id table-path)]
                (vswap! fields assoc field-path field-data)))))))
    {:databases @databases
     :tables    @tables
     :fields    @fields}))

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
  "Create a SchemaSource from a directory of database JSON files.
   Loads everything into memory at construction time."
  [schema-dir]
  (let [{:keys [databases tables fields]} (build-model (io/file schema-dir))
        fi (fields-by-table fields)]
    (->ConciseSchemaSource databases tables fields fi)))
