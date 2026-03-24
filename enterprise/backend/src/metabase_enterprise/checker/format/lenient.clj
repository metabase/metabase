(ns metabase-enterprise.checker.format.lenient
  "Lenient metadata source - fabricates synthetic metadata on demand.

   When schema information isn't available on disk, this source creates
   minimal synthetic data for any database/table/field a card references.
   Everything it's asked about is tracked, so at the end we can output
   a manifest of all referenced entities.

   The manifest is written in the same concise YAML format as concise.clj:

     databases:
       - name: my_database
         engine: unknown
         tables:
           users:
             fields: [id, name, email]

   This source never returns nil for resolve-* calls. If it hasn't seen
   a ref before, it fabricates data and remembers it."
  (:require
   [metabase-enterprise.checker.source :as source]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Lenient Source — tracks everything it resolves
;;; ===========================================================================

(deftype LenientSource [;; atom of {db-name {:name ... :engine ...}}
                        databases
                        ;; atom of {[db schema table] {:name ... :schema ...}}
                        tables
                        ;; atom of {[db schema table field] {:name ... :base_type ...}}
                        fields
                        ;; delegate source for cards (may be nil)
                        card-source]
  source/MetadataSource
  (resolve-database [_ db-name]
    (or (get @databases db-name)
        (let [data {:name db-name :engine "postgres"}]
          (swap! databases assoc db-name data)
          data)))

  (resolve-table [_ table-path]
    (let [[_db-name schema table-name] table-path]
      (or (get @tables table-path)
          (let [data {:name table-name :schema schema}]
            (swap! tables assoc table-path data)
            data))))

  (resolve-field [_ field-path]
    (let [[_db-name _schema _table-name field-name] field-path]
      (or (get @fields field-path)
          (let [data {:name       field-name
                      :base_type  "type/*"
                      :table_id   (vec (take 3 field-path))}]
            (swap! fields assoc field-path data)
            data))))

  (resolve-card [_ entity-id]
    (when card-source
      (source/resolve-card card-source entity-id))))

(defn make-source
  "Create a LenientSource that fabricates metadata on demand.

   `card-source` is an optional MetadataSource used for card resolution
   (typically a serdes source). Pass nil if cards are resolved elsewhere."
  [card-source]
  (->LenientSource (atom {}) (atom {}) (atom {}) card-source))

;;; ===========================================================================
;;; Accessors — get tracked references
;;; ===========================================================================

(defn card-source
  "Get the delegate card source, or nil."
  [^LenientSource source]
  (.-card_source source))

(defn tracked-databases
  "Get all databases that were resolved. Returns {db-name data-map}."
  [^LenientSource source]
  @(.-databases source))

(defn tracked-tables
  "Get all tables that were resolved. Returns {[db schema table] data-map}."
  [^LenientSource source]
  @(.-tables source))

(defn tracked-fields
  "Get all fields that were resolved. Returns {[db schema table field] data-map}."
  [^LenientSource source]
  @(.-fields source))

;;; ===========================================================================
;;; Enumeration — lenient source has no upfront enumeration,
;;; but we provide empty enumerators so the checker works.
;;; The real enumeration happens via cards pulling in refs.
;;; ===========================================================================

(defn make-enumerators
  "Create enumerators for a lenient source.

   Databases/tables/fields return empty since we don't know them upfront.
   Cards come from the delegate card-source's enumerator if provided."
  [^LenientSource source card-enumerator]
  {:databases #(keys @(.-databases source))
   :tables    #(keys @(.-tables source))
   :fields    #(keys @(.-fields source))
   :cards     (or card-enumerator (constantly []))})

;;; ===========================================================================
;;; Manifest — write tracked refs as concise YAML
;;; ===========================================================================

(defn- group-by-database
  "Group tracked tables and fields by database, producing concise format.

   Returns a seq of maps like:
     {:name \"db_name\"
      :engine \"unknown\"
      :tables {\"table_name\" {:fields [\"field1\" \"field2\"]}}}
   or with schemas:
     {:name \"db_name\"
      :engine \"postgres\"
      :schemas {\"public\" {\"table_name\" {:fields [\"field1\" \"field2\"]}}}}"
  [databases tables fields]
  (let [;; Group fields by their table path
        fields-by-table (reduce-kv
                         (fn [m field-path _field-data]
                           (let [table-path (vec (take 3 field-path))
                                 field-name (nth field-path 3)]
                             (update m table-path (fnil conj []) field-name)))
                         {}
                         fields)
        ;; Group tables by database
        tables-by-db (reduce-kv
                      (fn [m table-path _table-data]
                        (let [[db-name schema table-name] table-path
                              field-names (sort (get fields-by-table table-path []))]
                          (update m db-name (fnil conj [])
                                  {:schema schema
                                   :table-name table-name
                                   :fields field-names})))
                      {}
                      tables)]
    (for [[db-name db-data] (sort-by key databases)
          :let [db-tables (get tables-by-db db-name [])
                has-schemas? (some :schema db-tables)]]
      (if has-schemas?
        ;; Schema-based
        {:name   db-name
         :engine (:engine db-data "unknown")
         :schemas (reduce (fn [m {:keys [schema table-name fields]}]
                            (assoc-in m [(or schema "public") table-name]
                                      {:fields fields}))
                          {}
                          (sort-by :table-name db-tables))}
        ;; Schema-less
        {:name   db-name
         :engine (:engine db-data "unknown")
         :tables (reduce (fn [m {:keys [table-name fields]}]
                           (assoc m table-name {:fields fields}))
                         {}
                         (sort-by :table-name db-tables))}))))

(defn build-manifest
  "Build manifest data from a lenient source's tracked references.

   Returns a seq of database maps in concise format."
  [^LenientSource source]
  (group-by-database
   @(.-databases source)
   @(.-tables source)
   @(.-fields source)))

(defn write-manifest!
  "Write a manifest YAML file from the lenient source's tracked references.

   The manifest lists all databases, tables, and fields that were referenced
   during checking, in the concise format."
  [^LenientSource source ^String output-path]
  (let [manifest (build-manifest source)]
    (spit output-path (yaml/generate-string manifest))
    (println "Manifest written to:" output-path)))

(comment
  ;; Example: create lenient source, resolve some refs, get manifest
  (def src (make-source nil))
  (source/resolve-database src "my_db")
  (source/resolve-table src ["my_db" nil "users"])
  (source/resolve-field src ["my_db" nil "users" "id"])
  (source/resolve-field src ["my_db" nil "users" "name"])
  (build-manifest src)
  ;; => ({:name "my_db", :engine "unknown", :tables {"users" {:fields ["id" "name"]}}})
  )
