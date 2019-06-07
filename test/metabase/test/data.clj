(ns metabase.test.data
  "Super-useful test utility functions.

  Basic way stuff in here, which you'll see everywhere in the tests, is:

  1. Get the DB you're currently testing by calling `db`. Get IDs of the DB or of its Fields and Tables in that DB by
     calling `id`.

      (data/db)                 ; -> Get current test DB
      (data/id)                 ; -> Get ID of current test DB
      (data/id :table)          ; -> Get ID of Table named `table` in current test DB
      (data/id :table :field)   ; -> Get ID of Field named `field` belonging to Table `table` in current test DB

     Normally this database is the `test-data` database for the current driver, and is created the first time `db` or
     `id` is called.

  2. Bind the current driver with `driver/with-driver`. Defaults to `:h2`

       (driver/with-driver :postgres
         (data/id))
       ;; -> Get ID of Postgres `test-data` database, creating it if needed

  3. Bind a different database for use with for `db` and `id` functions with `with-db`.

      (data/with-db [db some-database]
        (data/id :table :field)))
       ;; -> Return ID of Field named `field` in Table `table` in `some-db`

  4. You can use helper macros like `$ids` to replace symbols starting with `$` (for Fields) or `$$` (for Tables) with
     calls to `id` in a form:

      ($ids {:source-table $$venues, :fields [$venues.name]})
      ;; -> {:source-table (data/id :venues), :fields [(data/id :venues :name)]}

     (There are several variations of this macro; see documentation below for more details.)"
  (:require [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [sync :as sync]
             [util :as u]]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [database :refer [Database]]
             [dimension :refer [Dimension]]
             [field :as field :refer [Field]]
             [field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [interface :as tx]
             [mbql-query-impl :as mbql-query-impl]]
            [metabase.test.util.timezone :as tu.tz]
            [schema.core :as s]
            [toucan.db :as db]))

(declare get-or-create-database!)


;;; ------------------------------------------ Dataset-Independent Data Fns ------------------------------------------

;; These functions offer a generic way to get bits of info like Table + Field IDs from any of our many driver/dataset
;; combos.

(defn get-or-create-test-data-db!
  "Get or create the Test Data database for `driver`, which defaults to `driver/*driver*`, or `:h2` if that is unbound."
  ([]       (get-or-create-test-data-db! (tx/driver)))
  ([driver] (get-or-create-database! driver defs/test-data)))

(def ^:dynamic ^:private *get-db*
  "Implementation of `db` function that should return the current working test database when called, always with no
  arguments. By default, this is `get-or-create-test-data-db!` for the current driver/`*driver*`, which does exactly what it
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
  "Run body with `db` as the current database. Calls to `db` and `id` use this value."
  [db & body]
  `(do-with-db ~db (fn [] ~@body)))


(defmacro $ids
  "Convert symbols like `$field` to `id` fn calls. Input is split into separate args by splitting the token on `.`.
  With no `.` delimiters, it is assumed we're referring to a Field belonging to `table-name`, which is passed implicitly
  as the first arg. With one or more `.` delimiters, no implicit `table-name` arg is passed to `id`:

    $venue_id      -> [:field-id (id :sightings :venue_id)] ; `table-name` is implicit first arg
    $cities.id     -> [:field-id (id :cities :id)]          ; specify non-default Table

  You can use the form `$source->dest` to for `fk->` forms:

    $venue_id->venues.id -> [:fk-> [:field-id (id :sightings :venue_id)] [:field-id (id :venues :id)]]

  Use `$$<table>` to refer to a Table ID:

    $$venues -> (id :venues)

  Use `%<field>` instead of `$` for a *raw* Field ID:

    %venue_id -> (id :sightings :venue_id)

  Use `*<field>` to generate appropriate an `:field-literal` based on a Field in the application DB:

    *venue_id -> [:field-literal \"VENUE_ID\" :type/Integer]

  Use `*<field>/type` to generate a `:field-literal` for an aggregation or native query result:

    *count/Integer -> [:field-literal \"count\" :type/Integer]

  Use `&<alias>.<field>` to wrap `<field>` in a `:joined-field` clause:

    &my_venues.venues.id -> [:joined-field \"my_venues\" [:field-id (data/id :venues :id)]]

  Use `!<unit>.<field>` to wrap a field in a `:datetime-field` clause:

    `!month.checkins.date` -> [:datetime-field [:field-id (data/id :checkins :date)] :month]


  For both `&` and `!`, if the wrapped Field does not have a sigil, it is handled recursively as if it had `$` (i.e.,
  it generates a `:field-id` clause); you can explicitly specify a sigil to wrap a different type of clause instead:

    `!month.*checkins.date` -> [:datetime-field [:field-literal \"DATE\" :type/DateTime] :month]

  NOTES:

    *  Only symbols that end in alphanumeric characters will be parsed, so as to avoid accidentally parsing things that
       do not refer to Fields."
  {:style/indent 1}
  ([form]
   `($ids nil ~form))

  ([table-name & body]
   (mbql-query-impl/parse-tokens table-name `(do ~@body))))

(defmacro mbql-query
  "Macro for easily building MBQL queries for test purposes.

  Cheatsheet:

  *  `$`  = wrapped Field ID
  *  `$$` = table ID
  *  `%`  = raw Field ID
  *  `*`  = field-literal for Field in app DB; `*field/type` for others
  *  `&`  = wrap in `joined-field`
  *  `!`  = wrap in `:datetime-field`

  (The 'cheatsheet' above is listed first so I can easily look at it with `autocomplete-mode` in Emacs.) This macro
  does the following:

  *  Expands symbols like `$field` into calls to `id`, and wraps them in `:field-id`. See the dox for `$ids` for
     complete details.
  *  Wraps 'inner' query with the standard `{:database (data/id), :type :query, :query {...}}` boilerplate
  *  Adds `:source-table` clause if `:source-table` or `:source-query` is not already present"
  {:style/indent 1}
  ([table-name]
   `(mbql-query ~table-name {}))

  ([table-name inner-query]
   {:pre [(map? inner-query)]}
   (as-> inner-query <>
     (mbql-query-impl/parse-tokens table-name <>)
     (mbql-query-impl/maybe-add-source-table <> table-name)
     (mbql-query-impl/wrap-inner-query <>))))

(defmacro query
  "Like `mbql-query`, but operates on an entire 'outer' query rather than the 'inner' MBQL query. Like `mbql-query`,
  automatically adds `:database` and `:type` to the top-level 'outer' query, and `:source-table` to the 'inner' MBQL
  query if not present."
  {:style/indent 1}
  ([table-name]
   `(query ~table-name {}))

  ([table-name outer-query]
   {:pre [(map? outer-query)]}
   (merge
    {:database `(id)
     :type     :query}
    (cond-> (mbql-query-impl/parse-tokens table-name outer-query)
      (not (:native outer-query)) (update :query mbql-query-impl/maybe-add-source-table table-name)))))

(defmacro run-mbql-query
  "Like `mbql-query`, but runs the query as well."
  {:style/indent 1}
  [table & [query]]
  `(qp/process-query
     (mbql-query ~table ~(or query {}))))


(defn format-name
  "Format a SQL schema, table, or field identifier in the correct way for the current database by calling the driver's
  implementation of `format-name`. (Most databases use the default implementation of `identity`; H2 uses
  `clojure.string/upper-case`.) This function DOES NOT quote the identifier."
  [nm]
  (tx/format-name (tx/driver) (name nm)))

(defn- get-table-id-or-explode [db-id table-name]
  {:pre [(integer? db-id) ((some-fn keyword? string?) table-name)]}
  (let [table-name        (format-name table-name)
        table-id-for-name (partial db/select-one-id Table, :db_id db-id, :name)]
    (or (table-id-for-name table-name)
        (table-id-for-name (let [db-name (db/select-one-field :name Database :id db-id)]
                             (tx/db-qualified-table-name db-name table-name)))
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
  "Get the ID of the current database or one of its Tables or Fields. Relies on the dynamic variable `*get-db*`, which
  can be rebound with `with-db`."
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
  (contains? (driver.u/features (or (tx/driver))) :foreign-keys))

(defn binning-supported?
  "Does the current engine support binning?"
  []
  (contains? (driver.u/features (tx/driver)) :binning))

(defn id-field-type  [] (tx/id-field-type (tx/driver)))

(defn expected-base-type->actual
  "Return actual `base_type` that will be used for the given driver if we asked for BASE-TYPE. Mainly for Oracle
  because it doesn't have `INTEGER` types and uses decimals instead."
  [base-type]
  (tx/expected-base-type->actual (tx/driver) base-type))


;; ## Loading / Deleting Test Datasets

(defn- add-extra-metadata!
  "Add extra metadata like Field base-type, etc."
  [{:keys [table-definitions], :as database-definition} db]
  {:pre [(seq table-definitions)]}
  (doseq [{:keys [table-name], :as table-definition} table-definitions]
    (let [table (delay (or (tx/metabase-instance table-definition db)
                           (throw (Exception. (format "Table '%s' not loaded from definiton:\n%s\nFound:\n%s"
                                                      table-name
                                                      (u/pprint-to-str (dissoc table-definition :rows))
                                                      (u/pprint-to-str (db/select [Table :schema :name], :db_id (:id db))))))))]
      (doseq [{:keys [field-name visibility-type special-type], :as field-definition} (:field-definitions table-definition)]
        (let [field (delay (or (tx/metabase-instance field-definition @table)
                               (throw (Exception. (format "Field '%s' not loaded from definition:\n"
                                                          field-name
                                                          (u/pprint-to-str field-definition))))))]
          (when visibility-type
            (log/debug (format "SET VISIBILITY TYPE %s.%s -> %s" table-name field-name visibility-type))
            (db/update! Field (:id @field) :visibility_type (name visibility-type)))
          (when special-type
            (log/debug (format "SET SPECIAL TYPE %s.%s -> %s" table-name field-name special-type))
            (db/update! Field (:id @field) :special_type (u/keyword->qualified-name special-type))))))))

(defn- create-database! [driver {:keys [database-name], :as database-definition}]
  {:pre [(seq database-name)]}
  ;; Create the database and load its data
  ;; ALWAYS CREATE DATABASE AND LOAD DATA AS UTC! Unless you like broken tests
  (tu.tz/with-jvm-tz "UTC"
    (tx/create-db! driver database-definition))
  ;; Add DB object to Metabase DB
  (let [db (db/insert! Database
             :name    database-name
             :engine  (name driver)
             :details (tx/dbdef->connection-details driver :db database-definition))]
    ;; sync newly added DB
    (sync/sync-database! db)
    ;; add extra metadata for fields
    (try
      (add-extra-metadata! database-definition db)
      (catch Throwable e
        (println "Error adding extra metadata:" e)))
    ;; make sure we're returing an up-to-date copy of the DB
    (Database (u/get-id db))))


(defonce ^:private ^{:arglists '([driver]), :doc "We'll have a very bad time if any sort of test runs that calls
  `data/db` for the first time calls it multiple times in parallel -- for example my Oracle test that runs 30 sync
  calls at the same time to make sure nothing explodes and cursors aren't leaked. To make sure this doesn't happen
  we'll keep a map of driver->lock and only allow a given driver to create one Database at a time. Because each DB has
  its own lock we can still create different DBs for different drivers at the same time."}
  driver->create-database-lock
  (let [locks (atom {})]
    (fn [driver]
      (let [driver (driver/the-driver driver)]
        (or
         (@locks driver)
         (do
           (swap! locks update driver #(or % (Object.)))
           (@locks driver)))))))

(defmulti get-or-create-database!
  "Create DBMS database associated with `database-definition`, create corresponding Metabase Databases/Tables/Fields,
  and sync the Database. `driver` is a keyword name of a driver that implements test extension methods (as defined in
  the `metabase.test.data.interface` namespace); `driver` defaults to `driver/*driver*` if bound, or `:h2` if not.
  `database-definition` is anything that implements the `tx/get-database-definition` method."
  {:arglists '([database-definition] [driver database-definition])}
  (fn
    ([_]
     (tx/dispatch-on-driver-with-test-extensions (tx/driver)))
    ([driver _]
     (tx/dispatch-on-driver-with-test-extensions driver)))
  :hierarchy #'driver/hierarchy)

(defmethod get-or-create-database! :default
  ([dbdef]
   (get-or-create-database! (tx/driver) dbdef))

  ([driver dbdef]
   (let [dbdef (tx/get-dataset-definition dbdef)]
     (or
      (tx/metabase-instance dbdef driver)
      (locking (driver->create-database-lock driver)
        (or
         (tx/metabase-instance dbdef driver)
         (create-database! driver dbdef)))))))


(s/defn do-with-db-for-dataset
  "Execute `f` with `dbdef` loaded as the current dataset. `f` takes a single argument, the DatabaseInstance that was
  loaded and synced from `dbdef`."
  [dataset-definition, f :- (s/pred fn?)]
  (let [dbdef (tx/get-dataset-definition dataset-definition)]
    (binding [db/*disable-db-logging* true]
      (let [db (get-or-create-database! (tx/driver) dbdef)]
        (assert db)
        (assert (db/exists? Database :id (u/get-id db)))
        (with-db db
          (f db))))))


(defmacro with-db-for-dataset
  "Load and sync `database-definition` with `driver` and execute `body` with the newly created Database bound to
  `db-binding`, and make it the current database for `metabase.test.data` functions like `id`.

     (with-db-for-dataset [db tupac-sightings]
       (driver/process-quiery {:database (:id db)
                               :type     :query
                               :query    {:source-table (:id &events)
                                          :aggregation  [\"count\"]
                                          :filter       [\"<\" (:id &events.timestamp) \"1765-01-01\"]}}))

  A given Database is only created once per run of the test suite, and is automatically destroyed at the conclusion
  of the suite."
  [[db-binding dataset-def] & body]
  `(do-with-db-for-dataset ~dataset-def
     (fn [~db-binding]
       ~@body)))

(defn resolve-dbdef [namespace-symb symb]
  @(or (ns-resolve namespace-symb symb)
       (ns-resolve 'metabase.test.data.dataset-definitions symb)
       (throw (Exception. (format "Dataset definition not found: '%s/%s' or 'metabase.test.data.dataset-definitions/%s'"
                                  namespace-symb symb symb)))))

(defmacro dataset
  "Load and sync a temporary Database defined by `dataset`, make it the current DB (for `metabase.test.data` functions
  like `id` and `db`), and execute `body`.

  Like `with-db-for-dataset`, but takes an unquoted symbol naming a DatabaseDefinition rather than the dbef itself.
  `dataset` is optionally namespace-qualified; if not, `metabase.test.data.dataset-definitions` is assumed.

     (dataset sad-toucan-incidents
       ...)"
  {:style/indent 1}
  [dataset & body]
  `(with-db-for-dataset [~'_ (resolve-dbdef '~(ns-name *ns*) '~dataset)]
     ~@body))

(defn- copy-db-tables-and-fields! [old-db-id new-db-id]
  (doseq [{old-table-id :id, :as table} (db/select Table :db_id old-db-id {:order-by [[:id :asc]]})]
    (let [{new-table-id :id} (db/insert! Table (-> table (dissoc :id) (assoc :db_id new-db-id)))]
      (doseq [field (db/select Field :table_id old-table-id {:order-by [[:id :asc]]})]
        (db/insert! Field (-> field (dissoc :id) (assoc :table_id new-table-id)))))))

(defn do-with-temp-copy-of-test-db
  "Run `f` with a temporary Database that copies the details from the standard test database, and syncs it."
  [f]
  (let [{:keys [engine], original-name :name, :as original-db} (select-keys (db) [:details :engine :name])
        copy-name                                              (format "%s___COPY" original-name)]
    (try
      (let [{new-db-id :id, :as new-db} (db/insert! Database (assoc original-db :name copy-name))]
        (copy-db-tables-and-fields! (id) new-db-id)
        (with-db new-db
          (f)))
      (finally (db/delete! Database :engine (name engine), :name copy-name)))))

(defmacro with-temp-copy-of-test-db
  "Run `body` with the current DB (i.e., the one that powers `data/db` and `data/id`) bound to a temporary copy of the
  current DB. Tables and Fields are copied as well."
  {:style/indent 0}
  [& body]
  `(do-with-temp-copy-of-test-db (fn [] ~@body)))


(defn- delete-model-instance!
  "Allows deleting a row by the model instance toucan returns when it's inserted"
  [{:keys [id] :as instance}]
  (db/delete! (-> instance name symbol) :id id))

(defn call-with-data
  "Takes a thunk `data-load-fn` that returns a seq of Toucan model instances that will be deleted after `body-fn`
  finishes"
  [data-load-fn body-fn]
  (let [result-instances (data-load-fn)]
    (try
      (body-fn)
      (finally
        (doseq [instance result-instances]
          (delete-model-instance! instance))))))

(defmacro with-data
  "Calls `data-load-fn` to create a sequence of Toucan objects, then runs `body`; finally, deletes the objects."
  [data-load-fn & body]
  `(call-with-data ~data-load-fn (fn [] ~@body)))

(defn dataset-field-values
  "Get all the values for a field in a `dataset-definition`.

    (dataset-field-values \"categories\" \"name\") ; -> [\"African\" \"American\" \"Artisan\" ...]"
  ([table-name field-name]
   (dataset-field-values defs/test-data table-name field-name))

  ([dataset-definition table-name field-name]
   (some
    (fn [{:keys [field-definitions rows], :as tabledef}]
      (when (= table-name (:table-name tabledef))
        (some
         (fn [[i fielddef]]
           (when (= field-name (:field-name fielddef))
             (map #(nth % i) rows)))
         (m/indexed field-definitions))))
    (:table-definitions (tx/get-dataset-definition dataset-definition)))))

(def ^:private category-names
  (delay (vec (dataset-field-values "categories" "name"))))

;; TODO - you should always call these functions with the `with-data` macro. We should enforce this
(defn create-venue-category-remapping
  "Returns a thunk that adds an internal remapping for category_id in the venues table aliased as `remapping-name`.
  Can be used in a `with-data` invocation."
  [remapping-name]
  (fn []
    [(db/insert! Dimension {:field_id (id :venues :category_id)
                            :name     remapping-name
                            :type     :internal})
     (db/insert! FieldValues {:field_id              (id :venues :category_id)
                              :values                (json/generate-string (range 1 (inc (count @category-names))))
                              :human_readable_values (json/generate-string @category-names)})]))

(defn create-venue-category-fk-remapping
  "Returns a thunk that adds a FK remapping for category_id in the venues table aliased as `remapping-name`. Can be
  used in a `with-data` invocation."
  [remapping-name]
  (fn []
    [(db/insert! Dimension {:field_id                (id :venues :category_id)
                            :name                    remapping-name
                            :type                    :external
                            :human_readable_field_id (id :categories :name)})]))
