(ns metabase.test.data
  "Code related to creating and deleting test databases + datasets."
  (:require (clojure [string :as s]
                     [walk :as walk])
            [clojure.tools.logging :as log]
            (metabase [db :refer :all]
                      [driver :as driver])
            [metabase.driver.query-processor.expand :as ql]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field] :as field]
                             [table :refer [Table]])
            (metabase.test.data [datasets :refer [*data-loader*]]
                                [dataset-definitions :as defs]
                                [h2 :as h2]
                                [interface :as i])
            [metabase.util :as u])
  (:import clojure.lang.Keyword
           (metabase.test.data.interface DatabaseDefinition
                                         FieldDefinition
                                         TableDefinition)))

(declare get-or-create-database!)

;;; ## ---------------------------------------- Dataset-Independent Data Fns ----------------------------------------
;; These functions offer a generic way to get bits of info like Table + Field IDs from any of our many driver/dataset combos.

(defn get-or-create-test-data-db!
  "Get or create the Test Data database for DATA-LOADER, which defaults to `*data-loader*`."
  ([]            (get-or-create-test-data-db! *data-loader*))
  ([data-loader] (get-or-create-database! data-loader defs/test-data)))

(def ^:dynamic ^:private *get-db* get-or-create-test-data-db!)

(defn db
  "Return the current database.
   Relies on the dynamic variable `*get-db`, which can be rebound with `with-db`."
  []
  (*get-db*))

(defn do-with-db [db f]
  (binding [*get-db* (constantly db)]
    (f)))

(defmacro with-db
  "Run body with DB as the current database.
   Calls to `db` and `id` use this value."
  [db & body]
  `(do-with-db ~db (fn [] ~@body)))

(defn- parts->id [table-name ])

(defn- $->id
  "Convert symbols like `$field` to `id` fn calls. Input is split into separate args by splitting the token on `.`.
   With no `.` delimiters, it is assumed we're referring to a Field belonging to TABLE-NAME, which is passed implicitly as the first arg.
   With one or more `.` delimiters, no implicit TABLE-NAME arg is passed to `id`:

    $venue_id  -> (id :sightings :venue_id) ; TABLE-NAME is implicit first arg
    $cities.id -> (id :cities :id)          ; specify non-default Table"
  [table-name body]
  (let [->id (fn [s]
               (let [parts (s/split s #"\.")]
                 (if (= (count parts) 1)
                   `(id ~table-name ~(keyword (first parts)))
                   `(id ~@(map keyword parts)))))]
    (walk/postwalk (fn [form]
                     (or (when (symbol? form)
                           (let [[first-char & rest-chars] (name form)]
                             (when (= first-char \$)
                               (let [token (apply str rest-chars)]
                                 (if-let [[_ token-1 token-2] (re-matches #"(^.*)->(.*$)" token)]
                                   `(ql/fk-> ~(->id token-1) ~(->id token-2))
                                   `(ql/field-id ~(->id token)))))))
                         form))
                   body)))

(defmacro query
  "Build a query, expands symbols like `$field` into calls to `id`.
   Internally, this wraps `metabase.driver.query-processor.expand/query` and includes a call to `source-table`.
   See the dox for `$->id` for more information on how `$`-prefixed expansion behaves.

     (query venues
       (ql/filter (ql/= $id 1)))

      -> (ql/query
           (ql/source-table (id :venues))
           (ql/filter (ql/= (id :venues :id) 1)))"
  {:style/indent 1}
  [table & forms]
  `(ql/query (ql/source-table (id ~(keyword table)))
             ~@(map (partial $->id (keyword table)) forms)))

(defmacro run-query
  "Like `query`, but runs the query as well."
  {:style/indent 1}
  [table & forms]
  `(ql/run-query* (query ~table ~@forms)))


(defn format-name [nm]
  (i/format-name *data-loader* (name nm)))

(defn- get-table-id-or-explode [db-id table-name]
  (let [table-name (format-name table-name)]
    (or (sel :one :id Table, :db_id db-id, :name table-name)
        (throw (Exception. (format "No Table '%s' found for Database %d.\nFound: %s" table-name db-id
                                   (u/pprint-to-str (sel :many :id->field [Table :name], :db_id db-id, :active true))))))))

(defn- get-field-id-or-explode [table-id field-name & {:keys [parent-id]}]
  (let [field-name (format-name field-name)]
    (or (sel :one :id Field, :active true, :table_id table-id, :name field-name, :parent_id parent-id)
        (throw (Exception. (format "Couldn't find Field %s for Table %d.\nFound: %s"
                                   (str \' field-name \' (when parent-id
                                                           (format " (parent: %d)" parent-id)))
                                   table-id
                                   (u/pprint-to-str (sel :many :id->field [Field :name], :active true, :table_id table-id))))))))

(defn id
  "Get the ID of the current database or one of its `Tables` or `Fields`.
   Relies on the dynamic variable `*get-db`, which can be rebound with `with-db`."
  ([]
   {:post [(integer? %)]}
   (:id (db)))

  ([table-name]
   (get-table-id-or-explode (id) table-name))

  ([table-name field-name & nested-field-names]
   (let [table-id (id table-name)]
     (loop [parent-id (get-field-id-or-explode table-id field-name), [nested-field-name & more] nested-field-names]
       (if-not nested-field-name
         parent-id
         (recur (get-field-id-or-explode table-id nested-field-name, :parent-id parent-id) more))))))

(defn fks-supported?
  "Does the current engine support foreign keys?"
  []
  (contains? (driver/features *data-loader*) :foreign-keys))

(defn default-schema [] (i/default-schema *data-loader*))
(defn id-field-type  [] (i/id-field-type *data-loader*))

(defn expected-base-type->actual [base-type]
  (i/expected-base-type->actual *data-loader* base-type))


;; ## Loading / Deleting Test Datasets

(defn get-or-create-database!
  "Create DBMS database associated with DATABASE-DEFINITION, create corresponding Metabase `Databases`/`Tables`/`Fields`, and sync the `Database`.
   DATASET-LOADER should be an object that implements `IDatasetLoader`; it defaults to the value returned by the method `dataset-loader` for the
   current dataset (`*data-loader*`), which is H2 by default."
  ([^DatabaseDefinition database-definition]
   (get-or-create-database! *data-loader* database-definition))
  ([dataset-loader {:keys [database-name], :as ^DatabaseDefinition database-definition}]
   (let [engine (i/engine dataset-loader)]
     (or (i/metabase-instance database-definition engine)
         (do
           ;; Create the database
           (i/create-db! dataset-loader database-definition)

           ;; Add DB object to Metabase DB
           (let [db (ins Database
                      :name    database-name
                      :engine  (name engine)
                      :details (i/database->connection-details dataset-loader :db database-definition))]

             ;; Sync the database
             (driver/sync-database! db)

             ;; Add extra metadata like Field field-type, base-type, etc.
             (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
               (let [table-name (:table-name table-definition)
                     table      (delay (or  (i/metabase-instance table-definition db)
                                            (throw (Exception. (format "Table '%s' not loaded from definiton:\n%s\nFound:\n%s"
                                                                       table-name
                                                                       (u/pprint-to-str (dissoc table-definition :rows))
                                                                       (u/pprint-to-str (sel :many :fields [Table :schema :name], :db_id (:id db))))))))]
                 (doseq [{:keys [field-name field-type special-type], :as field-definition} (:field-definitions table-definition)]
                   (let [field (delay (or (i/metabase-instance field-definition @table)
                                          (throw (Exception. (format "Field '%s' not loaded from definition:\n"
                                                                     field-name
                                                                     (u/pprint-to-str field-definition))))))]
                     (when field-type
                       (log/debug (format "SET FIELD TYPE %s.%s -> %s" table-name field-name field-type))
                       (upd Field (:id @field) :field_type (name field-type)))
                     (when special-type
                       (log/debug (format "SET SPECIAL TYPE %s.%s -> %s" table-name field-name special-type))
                       (upd Field (:id @field) :special_type (name special-type)))))))
             db))))))

(defn remove-database!
  "Delete Metabase `Database`, `Fields` and `Tables` associated with DATABASE-DEFINITION, then remove the physical database from the associated DBMS.
   DATASET-LOADER should be an object that implements `IDatasetLoader`; by default it is the value returned by the method `dataset-loader` for the
   current dataset, bound to `*data-loader*`."
  ([^DatabaseDefinition database-definition]
   (remove-database! *data-loader* database-definition))
  ([dataset-loader ^DatabaseDefinition database-definition]
   ;; Delete the Metabase Database and associated objects
   (cascade-delete Database :id (:id (i/metabase-instance database-definition (i/engine dataset-loader))))

   ;; now delete the DBMS database
   (i/destroy-db! dataset-loader database-definition)))


(def ^:private loader->loaded-db-def
  (atom #{}))

(defn destroy-loaded-temp-dbs!
  "Destroy all temporary databases created by `with-temp-db`."
  {:expectations-options :after-run}
  []
  (binding [*sel-disable-logging* true]
    (doseq [[loader dbdef] @loader->loaded-db-def]
      (try
        (remove-database! loader dbdef)
        (catch Throwable e
          (println "Error destroying database:" e)))))
  (reset! loader->loaded-db-def #{}))


(defn do-with-temp-db [^DatabaseDefinition dbdef f]
  (let [loader *data-loader*
        dbdef  (i/map->DatabaseDefinition (assoc dbdef :short-lived? true))]
    (swap! loader->loaded-db-def conj [loader dbdef])
    (with-db (binding [*sel-disable-logging* true]
               (let [db (get-or-create-database! loader dbdef)]
                 (assert db)
                 (assert (exists? Database :id (:id db)))
                 db))
      (f db))))


(defmacro with-temp-db
  "Load and sync DATABASE-DEFINITION with DATASET-LOADER and execute BODY with
   the newly created `Database` bound to DB-BINDING.
   Add `Database` to `loader->loaded-db-def`, which can be destroyed with `destroy-loaded-temp-dbs!`,
   which is automatically ran at the end of the test suite.

     (with-temp-db [db tupac-sightings]
       (driver/process-quiery {:database (:id db)
                               :type     :query
                               :query    {:source_table (:id &events)
                                          :aggregation  [\"count\"]
                                          :filter       [\"<\" (:id &events.timestamp) \"1765-01-01\"]}}))"
  [[db-binding ^DatabaseDefinition database-definition] & body]
  `(do-with-temp-db ~database-definition
     (fn [~db-binding]
       ~@body)))

(defn resolve-dbdef [symb]
  @(or (resolve symb)
       (ns-resolve 'metabase.test.data.dataset-definitions symb)
       (throw (Exception. (format "Dataset definition not found: '%s' or 'metabase.test.data.dataset-definitions/%s'" symb symb)))))

(defmacro dataset
  "Bind temp `Database` for DATASET as the current DB and execute BODY.

   Like `with-temp-db`, but takes an unquoted symbol naming a `DatabaseDefinition` rather than the dbef itself.
   DATASET is optionally namespace-qualified; if not, `metabase.test.data.dataset-definitions` is assumed.

     (dataset sad-toucan-incidents
       ...)"
  {:style/indent 1}
  [dataset & body]
  `(with-temp-db [_# (resolve-dbdef '~dataset)]
     ~@body))
