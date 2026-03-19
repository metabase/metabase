(ns metabase-enterprise.checker.format.concise
  "Concise YAML format for database metadata - one file per database.

   This format is designed to be:
   - Human-writable (easy to create by hand)
   - Programmatically generatable from any database
   - Minimal - only essential fields required

   File structure:
     databases/
       my-database.yaml
       another-database.yaml
     cards/
       card-entity-id.yaml

   Database YAML format:

   Schema-less databases (SQLite, etc.):
     name: my_database
     engine: sqlite
     tables:
       users:
         fields: [id, name, email]
       orders:
         fields: [id, user_id, total]

   Schema-based databases (Postgres, MySQL, etc.):
     name: my_database
     engine: postgres
     schemas:
       public:
         users:
           fields: [id, name, email]
         orders:
           fields: [id, user_id, total]
       analytics:
         events:
           fields: [id, event_type, timestamp]

   Field format - simple (just name, defaults applied):
     fields: [id, name, email]

   Field format - detailed (when you need more info):
     fields:
       - id
       - name: user_id
         semantic_type: type/FK
         fk_target: [public, users, id]
       - email"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.checker.source :as source]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Field Normalization
;;; ===========================================================================

(defn- normalize-field
  "Normalize field to map form. String becomes {:name string}."
  [field]
  (if (string? field)
    {:name field}
    field))

;;; ===========================================================================
;;; Index Building
;;; ===========================================================================

(defn- kw->str
  "Convert keyword to string, passing through nil and strings unchanged."
  [x]
  (cond
    (nil? x) nil
    (keyword? x) (name x)
    :else x))

(defn- build-database-index
  "Build index from a single database YAML.

   Returns {:db-name str
            :database {:name ... :engine ...}
            :tables {[db schema table] {:name ...}}
            :fields {[db schema table field] {:name ... :base_type ...}}}

   Keys are normalized to strings to match how cards reference them."
  [db-yaml]
  (let [db-name (:name db-yaml)
        has-schemas? (contains? db-yaml :schemas)
        idx {:db-name db-name
             :database {:name db-name :engine (:engine db-yaml)}
             :tables {}
             :fields {}}]
    (if has-schemas?
      ;; Schema-based: schemas -> schema -> table -> fields
      (reduce-kv
       (fn [idx schema-key schema-tables]
         (let [schema-name (kw->str schema-key)]
           (reduce-kv
            (fn [idx table-key table-def]
              (let [table-name (kw->str table-key)
                    table-path [db-name schema-name table-name]
                    fields (map normalize-field (:fields table-def))]
                (as-> idx i
                  (assoc-in i [:tables table-path] {:name table-name :schema schema-name})
                  (reduce (fn [idx field]
                            (let [field-name (kw->str (:name field))
                                  field-path [db-name schema-name table-name field-name]]
                              (assoc-in idx [:fields field-path]
                                        (merge {:base_type "type/*"
                                                :table_id table-path
                                                :name field-name}
                                               (dissoc field :name)))))
                          i fields))))
            idx schema-tables)))
       idx
       (:schemas db-yaml))
      ;; Schema-less: tables -> table -> fields (schema is nil)
      (reduce-kv
       (fn [idx table-key table-def]
         (let [table-name (kw->str table-key)
               table-path [db-name nil table-name]
               fields (map normalize-field (:fields table-def))]
           (as-> idx i
             (assoc-in i [:tables table-path] {:name table-name :schema nil})
             (reduce (fn [idx field]
                       (let [field-name (kw->str (:name field))
                             field-path [db-name nil table-name field-name]]
                         (assoc-in idx [:fields field-path]
                                   (merge {:base_type "type/*"
                                           :table_id table-path
                                           :name field-name}
                                          (dissoc field :name)))))
                     i fields))))
       idx
       (:tables db-yaml)))))

;;; ===========================================================================
;;; File Loading
;;; ===========================================================================

(defn load-yaml
  "Load and parse a YAML file."
  [path]
  (yaml/parse-string (slurp path)))

(defn- load-database-files
  "Load all database YAML files from a directory.
   Returns map of db-name -> index."
  [databases-dir]
  (let [^File dir (io/file databases-dir)]
    (when (.exists dir)
      (into {}
            (for [^File file (.listFiles dir)
                  :when (.isFile file)
                  :when (str/ends-with? (.getName file) ".yaml")
                  :let [db-yaml (load-yaml (.getPath file))
                        idx (build-database-index db-yaml)]]
              [(:db-name idx) idx])))))

(defn- extract-entity-id
  "Extract entity_id from a card YAML file using regex for speed."
  [^String file-path]
  (try
    (let [content (slurp file-path)]
      (when-let [[_ eid] (re-find #"(?m)^entity_id:\s*(\S+)" content)]
        (str/trim eid)))
    (catch Exception _ nil)))

(defn- load-card-files
  "Load all card YAML files from a directory (recursively).
   Returns map of entity-id -> card data."
  [cards-dir]
  (let [^File dir (io/file cards-dir)]
    (when (.exists dir)
      (into {}
            (for [^File file (file-seq dir)
                  :when (.isFile file)
                  :when (str/ends-with? (.getName file) ".yaml")
                  :let [path (.getPath file)
                        entity-id (extract-entity-id path)]
                  :when entity-id]
              [entity-id (load-yaml path)])))))

;;; ===========================================================================
;;; MetadataSource Implementation
;;; ===========================================================================

(deftype ConciseSource [db-indexes card-index]
  source/MetadataSource
  (resolve-database [_ db-name]
    (get-in db-indexes [db-name :database]))

  (resolve-table [_ table-path]
    (let [[db-name _ _] table-path]
      (get-in db-indexes [db-name :tables table-path])))

  (resolve-field [_ field-path]
    (let [[db-name _ _ _] field-path]
      (get-in db-indexes [db-name :fields field-path])))

  (resolve-card [_ entity-id]
    (get card-index entity-id)))

(defn make-source
  "Create a ConciseSource from a directory.

   Expected directory structure:
     dir/
       databases/
         db1.yaml
         db2.yaml
       cards/
         card1.yaml
         card2.yaml"
  [dir]
  (let [databases-dir (io/file dir "databases")
        cards-dir (io/file dir "cards")
        db-indexes (load-database-files databases-dir)
        card-index (load-card-files cards-dir)]
    (->ConciseSource db-indexes card-index)))

;;; ===========================================================================
;;; Enumeration
;;; ===========================================================================

(defn all-database-names
  "Get all database names from source."
  [^ConciseSource source]
  (keys (.-db-indexes source)))

(defn all-table-paths
  "Get all table paths from source."
  [^ConciseSource source]
  (mapcat (fn [[_ idx]] (keys (:tables idx)))
          (.-db-indexes source)))

(defn all-field-paths
  "Get all field paths from source."
  [^ConciseSource source]
  (mapcat (fn [[_ idx]] (keys (:fields idx)))
          (.-db-indexes source)))

(defn all-card-ids
  "Get all card entity-ids from source."
  [^ConciseSource source]
  (keys (.-card-index source)))

(defn make-enumerators
  "Create enumerators map for use with checker/check-cards."
  [source]
  {:databases #(all-database-names source)
   :tables    #(all-table-paths source)
   :fields    #(all-field-paths source)
   :cards     #(all-card-ids source)})

;;; ===========================================================================
;;; High-level API
;;; ===========================================================================

(defn check
  "Check all cards in a concise format directory.
   Returns map of entity-id -> result."
  [^ConciseSource source]
  (let [checker (requiring-resolve 'metabase-enterprise.checker.checker/check-cards)]
    (checker source (make-enumerators source) (all-card-ids source))))

(defn check-cards
  "Check specific cards in a concise format directory.
   Returns map of entity-id -> result."
  [^ConciseSource source card-ids]
  (let [checker (requiring-resolve 'metabase-enterprise.checker.checker/check-cards)]
    (checker source (make-enumerators source) card-ids)))

;;; ===========================================================================
;;; Programmatic Source Creation (for testing or API usage)
;;; ===========================================================================

(defn make-source-from-data
  "Create a ConciseSource directly from data (no files needed).

   db-yamls: seq of database definition maps
   cards: optional seq of card definition maps"
  [db-yamls cards]
  (let [db-indexes (into {}
                         (for [db-yaml db-yamls
                               :let [idx (build-database-index db-yaml)]]
                           [(:db-name idx) idx]))
        card-index (into {}
                         (for [card cards]
                           [(:entity_id card) card]))]
    (->ConciseSource db-indexes card-index)))

(comment
  ;; Example: create source from inline data
  (def src
    (make-source-from-data
     [{:name "my_db"
       :engine "sqlite"
       :tables {"users" {:fields ["id" "name" "email"]}
                "orders" {:fields ["id" "user_id" "total"]}}}]
     []))

  ;; Example: load from directory
  (def src (make-source "/path/to/concise-export"))
  (check src))
