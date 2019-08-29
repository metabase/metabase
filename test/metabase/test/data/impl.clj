(ns metabase.test.data.impl
  "Internal implementation of various helper functions in `metabase.test.data`."
  (:require [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [db :as mdb]
             [driver :as driver]
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [table :refer [Table]]]
            [metabase.plugins.classloader :as classloader]
            [metabase.test.data
             [dataset-definitions :as defs]
             [interface :as tx]]
            [metabase.test.util.timezone :as tu.tz]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          get-or-create-database!; db                                           |
;;; +----------------------------------------------------------------------------------------------------------------+


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
  {:arglists '([driver database-definition])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)


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
            (db/update! Field (:id @field) :special_type (u/qualified-name special-type))))))))

(def ^:private create-database-timeout
  "Max amount of time to wait for driver text extensions to create a DB and load test data."
  (* 4 60 1000)) ; 4 minutes

(defn- create-database! [driver {:keys [database-name], :as database-definition}]
  {:pre [(seq database-name)]}
  (try
    ;; Create the database and load its data
    ;; ALWAYS CREATE DATABASE AND LOAD DATA AS UTC! Unless you like broken tests
    (u/with-timeout create-database-timeout
      (tu.tz/with-jvm-tz "UTC"
        (tx/create-db! driver database-definition)))
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
      (Database (u/get-id db)))
    (catch Throwable e
      (printf "Failed to create %s '%s' test database:\n" driver database-name)
      (println e)
      (when config/is-test?
        (System/exit -1)))))


(defmethod get-or-create-database! :default [driver dbdef]
  (mdb/setup-db!) ; if not already setup
  (let [dbdef (tx/get-dataset-definition dbdef)]
    (or
     (tx/metabase-instance dbdef driver)
     (locking (driver->create-database-lock driver)
       (or
        (tx/metabase-instance dbdef driver)
        (create-database! driver dbdef))))))

(defn- get-or-create-test-data-db!
  "Get or create the Test Data database for `driver`, which defaults to `driver/*driver*`, or `:h2` if that is unbound."
  ([]       (get-or-create-test-data-db! (tx/driver)))
  ([driver] (get-or-create-database! driver defs/test-data)))

(def ^:dynamic *get-db*
  "Implementation of `db` function that should return the current working test database when called, always with no
  arguments. By default, this is `get-or-create-test-data-db!` for the current driver/`*driver*`, which does exactly what it
  suggests."
  get-or-create-test-data-db!)

(defn do-with-db
  "Internal impl of `data/with-db`."
  [db f]
  (binding [*get-db* (constantly db)]
    (f)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                       id                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn the-table-id
  "Internal impl of `(data/id table)."
  [db-id table-name]
  {:pre [(integer? db-id) ((some-fn keyword? string?) table-name)]}
  (let [table-id-for-name (partial db/select-one-id Table, :db_id db-id, :name)]
    (or (table-id-for-name table-name)
        (table-id-for-name (let [db-name (db/select-one-field :name Database :id db-id)]
                             (tx/db-qualified-table-name db-name table-name)))
        (throw (Exception. (format "No Table '%s' found for Database %d.\nFound: %s" table-name db-id
                                   (u/pprint-to-str (db/select-id->field :name Table, :db_id db-id, :active true))))))))

(defn- the-field-id* [table-id field-name & {:keys [parent-id]}]
  {:pre [((some-fn keyword? string?) field-name)]}
  (or (db/select-one-id Field, :active true, :table_id table-id, :name field-name, :parent_id parent-id)
      (throw (Exception.
              (format "Couldn't find Field %s for Table %d.\nFound: %s"
                      (str \' field-name \' (when parent-id
                                              (format " (parent: %d)" parent-id)))
                      table-id
                      (u/pprint-to-str (db/select-id->field :name Field, :active true, :table_id table-id)))))))

(defn the-field-id
  "Internal impl of `(data/id table field)`."
  [table-id field-name & nested-field-names]
  {:pre [(integer? table-id)]}
  (loop [parent-id (the-field-id* table-id field-name), [nested-field-name & more] nested-field-names]
    (if-not nested-field-name
      parent-id
      (recur (the-field-id* table-id nested-field-name, :parent-id parent-id) more))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              with-temp-copy-of-db                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- copy-table-fields! [old-table-id new-table-id]
  (db/insert-many! Field
    (for [field (db/select Field :table_id old-table-id {:order-by [[:id :asc]]})]
      (-> field (dissoc :id :fk_target_field_id) (assoc :table_id new-table-id)))))

(defn- copy-db-tables! [old-db-id new-db-id]
  (let [old-tables    (db/select Table :db_id old-db-id {:order-by [[:id :asc]]})
        new-table-ids (db/insert-many! Table
                        (for [table old-tables]
                          (-> table (dissoc :id) (assoc :db_id new-db-id))))]
    (doseq [[old-table-id new-table-id] (zipmap (map :id old-tables) new-table-ids)]
      (copy-table-fields! old-table-id new-table-id))))

(defn- copy-db-fks! [old-db-id new-db-id]
  (doseq [{:keys [source-field source-table target-field target-table]}
          (db/query {:select    [[:source-field.name :source-field]
                                 [:source-table.name :source-table]
                                 [:target-field.name   :target-field]
                                 [:target-table.name   :target-table]]
                     :from      [[Field :source-field]]
                     :left-join [[Table :source-table] [:= :source-field.table_id :source-table.id]
                                 [Field :target-field] [:= :source-field.fk_target_field_id :target-field.id]
                                 [Table :target-table] [:= :target-field.table_id :target-table.id]]
                     :where     [:and
                                 [:= :source-table.db_id old-db-id]
                                 [:= :target-table.db_id old-db-id]
                                 [:not= :source-field.fk_target_field_id nil]]})]
    (db/update! Field (the-field-id (the-table-id new-db-id source-table) source-field)
      :fk_target_field_id (the-field-id (the-table-id new-db-id target-table) target-field))))

(defn- copy-db-tables-and-fields! [old-db-id new-db-id]
  (copy-db-tables! old-db-id new-db-id)
  (copy-db-fks! old-db-id new-db-id))

(defn do-with-temp-copy-of-db
  "Internal impl of `data/with-temp-copy-of-db`. Run `f` with a temporary Database that copies the details from the
  standard test database, and syncs it."
  [f]
  (let [{old-db-id :id, :as old-db}                            (*get-db*)
        {:keys [engine], original-name :name, :as original-db} (select-keys old-db [:details :engine :name])]
    (let [{new-db-id :id, :as new-db} (db/insert! Database original-db)]
      (try
        (copy-db-tables-and-fields! old-db-id new-db-id)
        (do-with-db new-db f)
        (finally (db/delete! Database :id new-db-id))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    dataset                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn resolve-dataset-definition
  "Impl for `data/dataset` macro. Resolve a dataset definition (e.g. `test-data` or `sad-toucan-incidents` in a
  namespace."
  [namespace-symb symb]
  @(or (ns-resolve namespace-symb symb)
       (do
         (classloader/require 'metabase.test.data.dataset-definitions)
         (ns-resolve 'metabase.test.data.dataset-definitions symb))
       (throw (Exception. (format "Dataset definition not found: '%s/%s' or 'metabase.test.data.dataset-definitions/%s'"
                                  namespace-symb symb symb)))))

(defn do-with-dataset
  "Impl for `data/dataset` macro."
  {:style/indent 1}
  [dataset-definition f]
  (let [dbdef (tx/get-dataset-definition dataset-definition)]
    (binding [db/*disable-db-logging* true]
      (let [db (get-or-create-database! (tx/driver) dbdef)]
        (assert db)
        (assert (db/exists? Database :id (u/get-id db)))
        (do-with-db db f)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               with-temp-objects                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- delete-model-instance!
  "Allows deleting a row by the model instance toucan returns when it's inserted"
  [{:keys [id] :as instance}]
  (db/delete! (-> instance name symbol) :id id))

(defn do-with-temp-objects
  "Internal impl of `data/with-data`. Takes a thunk `data-load-fn` that returns a seq of Toucan model instances that
  will be deleted after `body-fn` finishes"
  [data-load-fn body-fn]
  (let [result-instances (data-load-fn)]
    (try
      (body-fn)
      (finally
        (doseq [instance result-instances]
          (delete-model-instance! instance))))))
