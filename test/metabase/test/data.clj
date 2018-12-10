(ns metabase.test.data
  "Code related to creating and deleting test databases + datasets."
  (:require [cheshire.core :as json]
            [clojure
             [string :as str]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [dimension :refer [Dimension]]
             [field :as field :refer [Field]]
             [field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :refer [*driver*]]
             [interface :as i]]
            [toucan.db :as db])
  (:import [metabase.test.data.interface DatabaseDefinition TableDefinition]))

(declare get-or-create-database!)

;;; ------------------------------------------ Dataset-Independent Data Fns ------------------------------------------

;; These functions offer a generic way to get bits of info like Table + Field IDs from any of our many driver/dataset
;; combos.

(defn get-or-create-test-data-db!
  "Get or create the Test Data database for DRIVER, which defaults to `*driver*`."
  ([]       (get-or-create-test-data-db! *driver*))
  ([driver] (get-or-create-database! driver defs/test-data)))

(def ^:dynamic ^:private *get-db*
  "Implementation of `db` function that should return the current working test database when called, always with no
  arguments. By default, this is `get-or-create-test-data-db!` for the current `*driver*`, which does exactly what it
  suggests."
  get-or-create-test-data-db!)

(defn db
  "Return the current database.
   Relies on the dynamic variable `*get-db*`, which can be rebound with `with-db`."
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

;; $ids:
;;
;; The following macros make writing test queries a little easier. Wrap a body in `$ids` and you can avoid repeated
;; calls to `data/id`:
;;
;;  ($ids venue [:= $id 200]) ; -> [:= (data/id :venue :id) 200]
;;
;; Tokens can be in the following formats:
;;
;; *  `$field`              -- assumes Field belongs to table specified in first arg
;; *  `$table.field`        -- specify a different Table
;; *  `$field->table.field` -- for FKs. Either Field can be qualified with `table`, or not

(defn- ->id
  "Internal impl of `$ids` and `mbql-query` macros. Low-level function to replace a token string like `field` or
  `table.field` with a call to `id`."
  [table-name token-str]
  (let [parts (str/split token-str #"\.")]
    (if (= (count parts) 1)
      `(id ~(keyword table-name) ~(keyword (first parts)))
      `(id ~@(map keyword parts)))))

(defn- token->id-call
  "Internal impl of `$ids` and `mbql-query` macros. Low-level function to replace a token string with calls to `id`,
  handling `field->field` tokens as well, and wrapping in `:field-id` or `:fk->` clauses if appropriate."
  [wrap-field-ids? table-name token-str]
  (if-let [[_ token-1 token-2] (re-matches #"(^.*)->(.*$)" token-str)]
    (if wrap-field-ids?
      `[:fk-> [:field-id ~(->id table-name token-1)] [:field-id ~(->id table-name token-2)]]
      (->id table-name token-2))
    (if wrap-field-ids?
      `[:field-id ~(->id table-name token-str)]
      (->id table-name token-str))))

(defn- $->id
  "Internal impl fn of `$ids` and `mbql-query` macros. Walk `body` and replace `$field` (and related) tokens with calls
  to `id`.

  Optionally wraps IDs in `:field-id` or `:fk->` clauses as appropriate; this defaults to true."
  [table-name body & {:keys [wrap-field-ids?], :or {wrap-field-ids? true}}]
  (walk/postwalk
   (fn [form]
     (or (when (symbol? form)
           (if (= form '$$table)
             `(id ~(keyword table-name))
             (let [[first-char & rest-chars] (name form)]
               (when (= first-char \$)
                 (let [token (apply str rest-chars)]
                   (token->id-call wrap-field-ids? table-name token))))))
         form))
   body))

(defmacro $ids
  "Convert symbols like `$field` to `id` fn calls. Input is split into separate args by splitting the token on `.`.
  With no `.` delimiters, it is assumed we're referring to a Field belonging to `table-name`, which is passed implicitly
  as the first arg. With one or more `.` delimiters, no implicit `table-name` arg is passed to `id`:

    $venue_id      -> (id :sightings :venue_id) ; TABLE-NAME is implicit first arg
    $cities.id     -> (id :cities :id)          ; specify non-default Table

  Use `$$table` to refer to the table itself.

    $$table -> (id :venues)

  You can pass options by wrapping `table-name` in a vector:

    ($ids [venues {:wrap-field-ids? true}]
      $category_id->categories.name)
    ;; -> [:fk-> [:field-id (id :venues :category_id(] [:field-id (id :categories :name)]]"
  {:arglists '([table & body] [[table {:keys [wrap-field-ids?]}] & body]), :style/indent 1}
  [table-and-options & body]
  (let [[table-name options] (if (sequential? table-and-options)
                               table-and-options
                               [table-and-options])]
    (m/mapply $->id (keyword table-name) `(do ~@body) (merge {:wrap-field-ids? false}
                                                             options))))


(defn wrap-inner-mbql-query
  "Wrap inner QUERY with `:database` ID and other 'outer query' kvs. DB ID is fetched by looking up the Database for
  the query's `:source-table`."
  {:style/indent 0}
  [query]
  {:database (db/select-one-field :db_id Table, :id (:source-table query))
   :type     :query
   :query    query})

(defmacro mbql-query
  "Build a query, expands symbols like `$field` into calls to `id` and wraps them in `:field-id`. See the dox for
  `$->id` for more information on how `$`-prefixed expansion behaves.

    (mbql-query venues
      {:filter [:= $id 1]})

    ;; -> {:database <database>
           :type     :query
           :query    {:source-table (data/id :venues)
                      :filter       [:= [:field-id (data/id :venues :id)] 1]}} "
  {:style/indent 1}
  [table & [query]]
  `(wrap-inner-mbql-query
     ~(merge `{:source-table (id ~(keyword table))}
             ($->id table query))))

(defmacro run-mbql-query
  "Like `mbql-query`, but runs the query as well."
  {:style/indent 1}
  [table & [query]]
  `(qp/process-query
     (mbql-query ~table ~query)))


(defn format-name
  "Format a SQL schema, table, or field identifier in the correct way for the current database by calling the driver's
  implementation of `format-name`. (Most databases use the default implementation of `identity`; H2 uses
  `clojure.string/upper-case`.) This function DOES NOT quote the identifier."
  [nm]
  (i/format-name *driver* (name nm)))

(defn- get-table-id-or-explode [db-id table-name]
  {:pre [(integer? db-id) ((some-fn keyword? string?) table-name)]}
  (let [table-name        (format-name table-name)
        table-id-for-name (partial db/select-one-id Table, :db_id db-id, :name)]
    (or (table-id-for-name table-name)
        (table-id-for-name (let [db-name (db/select-one-field :name Database :id db-id)]
                             (i/db-qualified-table-name db-name table-name)))
        (throw (Exception. (format "No Table '%s' found for Database %d.\nFound: %s" table-name db-id
                                   (u/pprint-to-str (db/select-id->field :name Table, :db_id db-id, :active true))))))))

(defn table-name
  "Return the correct (database specific) table name for `table-name`. For most databases `table-name` is just
  returned. For others (like Oracle), the real name is prefixed by the dataset and might be different"
  [db-id table-name]
  (db/select-one-field :name Table :id (get-table-id-or-explode db-id table-name)))

(defn- get-field-id-or-explode [table-id field-name & {:keys [parent-id]}]
  (let [field-name (format-name field-name)]
    (or (db/select-one-id Field, :active true, :table_id table-id, :name field-name, :parent_id parent-id)
        (throw (Exception. (format "Couldn't find Field %s for Table %d.\nFound: %s"
                                   (str \' field-name \' (when parent-id
                                                           (format " (parent: %d)" parent-id)))
                                   table-id
                                   (u/pprint-to-str (db/select-id->field :name Field, :active true, :table_id table-id))))))))

(defn id
  "Get the ID of the current database or one of its `Tables` or `Fields`.
   Relies on the dynamic variable `*get-db*`, which can be rebound with `with-db`."
  ([]
   {:post [(integer? %)]}
   (:id (db)))

  ([table-name]
   ;; Ensure the database has been created
   (db)
   (get-table-id-or-explode (id) table-name))

  ([table-name field-name & nested-field-names]
   ;; Ensure the database has been created
   (db)
   (let [table-id (id table-name)]
     (loop [parent-id (get-field-id-or-explode table-id field-name), [nested-field-name & more] nested-field-names]
       (if-not nested-field-name
         parent-id
         (recur (get-field-id-or-explode table-id nested-field-name, :parent-id parent-id) more))))))

(defn fks-supported?
  "Does the current engine support foreign keys?"
  []
  (contains? (driver/features *driver*) :foreign-keys))

(defn binning-supported?
  "Does the current engine support binning?"
  []
  (contains? (driver/features *driver*) :binning))

(defn id-field-type  [] (i/id-field-type *driver*))

(defn expected-base-type->actual
  "Return actual `base_type` that will be used for the given driver if we asked for BASE-TYPE. Mainly for Oracle
  because it doesn't have `INTEGER` types and uses decimals instead."
  [base-type]
  (i/expected-base-type->actual *driver* base-type))


;; ## Loading / Deleting Test Datasets

(defn- add-extra-metadata!
  "Add extra metadata like Field base-type, etc."
  [database-definition db]
  (doseq [^TableDefinition table-definition (:table-definitions database-definition)]
    (let [table-name (:table-name table-definition)
          table      (delay (or  (i/metabase-instance table-definition db)
                                 (throw (Exception. (format "Table '%s' not loaded from definiton:\n%s\nFound:\n%s"
                                                            table-name
                                                            (u/pprint-to-str (dissoc table-definition :rows))
                                                            (u/pprint-to-str (db/select [Table :schema :name], :db_id (:id db))))))))]
      (doseq [{:keys [field-name visibility-type special-type], :as field-definition} (:field-definitions table-definition)]
        (let [field (delay (or (i/metabase-instance field-definition @table)
                               (throw (Exception. (format "Field '%s' not loaded from definition:\n"
                                                          field-name
                                                          (u/pprint-to-str field-definition))))))]
          (when visibility-type
            (log/debug (format "SET VISIBILITY TYPE %s.%s -> %s" table-name field-name visibility-type))
            (db/update! Field (:id @field) :visibility_type (name visibility-type)))
          (when special-type
            (log/debug (format "SET SPECIAL TYPE %s.%s -> %s" table-name field-name special-type))
            (db/update! Field (:id @field) :special_type (u/keyword->qualified-name special-type))))))))

(defn- create-database! [{:keys [database-name], :as database-definition} engine driver]
  ;; Create the database
  (i/create-db! driver database-definition)
  ;; Add DB object to Metabase DB
  (let [db (db/insert! Database
             :name    database-name
             :engine  (name engine)
             :details (i/database->connection-details driver :db database-definition))]
    ;; sync newly added DB
    (sync/sync-database! db)
    ;; add extra metadata for fields
    (add-extra-metadata! database-definition db)
    ;; make sure we're returing an up-to-date copy of the DB
    (Database (u/get-id db))))

(defn- reload-test-extensions [engine]
  (println "Reloading test extensions for driver:" engine)
  (let [extension-ns (symbol (str "metabase.test.data." (name engine)))]
    (println (format "(require '%s 'metabase.test.data.datasets :reload)" extension-ns))
    (require extension-ns 'metabase.test.data.datasets :reload)))

(defn get-or-create-database!
  "Create DBMS database associated with DATABASE-DEFINITION, create corresponding Metabase
  `Databases`/`Tables`/`Fields`, and sync the `Database`. DRIVER should be an object that implements
  `IDriverTestExtensions`; it defaults to the value returned by the method `driver` for the current
  dataset (`*driver*`), which is H2 by default."
  ([database-definition]
   (get-or-create-database! *driver* database-definition))
  ([driver database-definition]
   (let [engine         (i/engine driver)
         get-or-create! (fn []
                          (or (i/metabase-instance database-definition engine)
                              (create-database! database-definition engine driver)))]
     ;; attempt to make sure test extensions are loaded for the driver. This might still fail (see below)
     (require (symbol (str "metabase.test.data." (name engine))))
     (try
       (get-or-create!)
       ;; occasionally we'll see an error like
       ;;   java.lang.IllegalArgumentException: No implementation of method: :database->connection-details
       ;;   of protocol: IDriverTestExtensions found for class: metabase.driver.h2.H2Driver
       ;; to fix this we just need to reload a couple namespaces and then try again
       (catch Exception _
         (reload-test-extensions engine)
         (get-or-create!))))))


(defn do-with-temp-db
  "Execute F with DBDEF loaded as the current dataset. F takes a single argument, the `DatabaseInstance` that was
  loaded and synced from DBDEF."
  [^DatabaseDefinition dbdef, f]
  (let [driver *driver*
        dbdef  (i/map->DatabaseDefinition dbdef)]
    (binding [db/*disable-db-logging* true]
      (let [db (get-or-create-database! driver dbdef)]
        (assert db)
        (assert (db/exists? Database :id (u/get-id db)))
        (with-db db
          (f db))))))


(defmacro with-temp-db
  "Load and sync DATABASE-DEFINITION with DRIVER and execute BODY with the newly created `Database` bound to
  DB-BINDING, and make it the current database for `metabase.test.data` functions like `id`.

     (with-temp-db [db tupac-sightings]
       (driver/process-quiery {:database (:id db)
                               :type     :query
                               :query    {:source-table (:id &events)
                                          :aggregation  [\"count\"]
                                          :filter       [\"<\" (:id &events.timestamp) \"1765-01-01\"]}}))

  A given Database is only created once per run of the test suite, and is automatically destroyed at the conclusion
  of the suite."
  [[db-binding, ^DatabaseDefinition database-definition] & body]
  `(do-with-temp-db ~database-definition
     (fn [~db-binding]
       ~@body)))

(defn resolve-dbdef [symb]
  @(or (resolve symb)
       (ns-resolve 'metabase.test.data.dataset-definitions symb)
       (throw (Exception. (format "Dataset definition not found: '%s' or 'metabase.test.data.dataset-definitions/%s'"
                                  symb symb)))))

(defmacro dataset
  "Load and sync a temporary `Database` defined by DATASET, make it the current DB (for `metabase.test.data` functions
  like `id`), and execute BODY.

  Like `with-temp-db`, but takes an unquoted symbol naming a `DatabaseDefinition` rather than the dbef itself.
  DATASET is optionally namespace-qualified; if not, `metabase.test.data.dataset-definitions` is assumed.

     (dataset sad-toucan-incidents
       ...)"
  {:style/indent 1}
  [dataset & body]
  `(with-temp-db [~'_ (resolve-dbdef '~dataset)]
     ~@body))

(defn- delete-model-instance!
  "Allows deleting a row by the model instance toucan returns when it's inserted"
  [{:keys [id] :as instance}]
  (db/delete! (-> instance name symbol) :id id))

(defn call-with-data
  "Takes a thunk `DATA-LOAD-FN` that returns a seq of toucan model instances that will be deleted after `BODY-FN`
  finishes"
  [data-load-fn body-fn]
  (let [result-instances (data-load-fn)]
    (try
      (body-fn)
      (finally
        (doseq [instance result-instances]
          (delete-model-instance! instance))))))

(defmacro with-data [data-load-fn & body]
  `(call-with-data ~data-load-fn (fn [] ~@body)))

(def ^:private venue-categories
  (map vector (defs/field-values defs/test-data-map "categories" "name")))

(defn create-venue-category-remapping
  "Returns a thunk that adds an internal remapping for category_id in the venues table aliased as `REMAPPING-NAME`.
  Can be used in a `with-data` invocation."
  [remapping-name]
  (fn []
    [(db/insert! Dimension {:field_id (id :venues :category_id)
                            :name remapping-name
                            :type :internal})
     (db/insert! FieldValues {:field_id (id :venues :category_id)
                              :values (json/generate-string (range 0 (count venue-categories)))
                              :human_readable_values (json/generate-string (map first venue-categories))})]))

(defn create-venue-category-fk-remapping
  "Returns a thunk that adds a FK remapping for category_id in the venues table aliased as `REMAPPING-NAME`. Can be
  used in a `with-data` invocation."
  [remapping-name]
  (fn []
    [(db/insert! Dimension {:field_id (id :venues :category_id)
                            :name remapping-name
                            :type :external
                            :human_readable_field_id (id :categories :name)})]))
