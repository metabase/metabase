(ns metabase.test.data.impl
  "Internal implementation of various helper functions in `metabase.test.data`."
  (:require
   [metabase.db.connection :as mdb.connection]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Database Field FieldValues Secret Table]]
   [metabase.models.secret :as secret]
   [metabase.plugins.classloader :as classloader]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.impl.get-or-create :as test.data.impl.get-or-create]
   [metabase.test.data.impl.verify :as verify]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [potemkin :as p]
   [toucan.db :as db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment verify/keep-me)

(p/import-vars
 [verify verify-data-loaded-correctly])

(defmulti get-or-create-database!
  "Create data warehouse database associated with `database-definition`, create corresponding Metabase Databases/Tables/Fields,
  and sync the Database. `driver` is a keyword name of a driver that implements test extension methods (as defined in
  the [[metabase.test.data.interface]] namespace); `driver` defaults to [[metabase.driver/*driver*]] if bound, or
  `:h2` if not. `database-definition` is anything that implements
  the [[metabase.test.data.interface/get-dataset-definition]] method."
  {:arglists '([driver database-definition])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod get-or-create-database! :default
  [driver dbdef]
  (test.data.impl.get-or-create/default-get-or-create-database! driver dbdef))

(defn- get-or-create-test-data-db!
  "Get or create the Test Data database for `driver`, which defaults to [[metabase.driver/*driver*]], or `:h2` if that
  is unbound."
  ([]       (get-or-create-test-data-db! (tx/driver)))
  ([driver] (get-or-create-database! driver defs/test-data)))

(def ^:dynamic *get-db*
  "Implementation of `db` function that should return the current working test database when called, always with no
  arguments. By default, this is [[get-or-create-test-data-db!]] for the current [[metabase.driver/*driver*]], which
  does exactly what it suggests."
  get-or-create-test-data-db!)

(defn do-with-db
  "Internal impl of `data/with-db`."
  [db f]
  (assert (and (map? db) (integer? (:id db)))
          (format "Not a valid database: %s" (pr-str db)))
  (binding [*get-db* (constantly db)]
    (f)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                       id                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn the-table-id
  "Internal impl of `(data/id table)."
  [db-id table-name]
  {:pre [(integer? db-id) ((some-fn keyword? string?) table-name)]}
  (let [table-name        (name table-name)
        table-id-for-name (partial t2/select-one-pk Table, :db_id db-id, :name)]
    (or (table-id-for-name table-name)
        (table-id-for-name (let [db-name (t2/select-one-fn :name Database :id db-id)]
                             (tx/db-qualified-table-name db-name table-name)))
        (let [{driver :engine, db-name :name} (t2/select-one [Database :engine :name] :id db-id)]
          (throw
           (Exception. (format "No Table %s found for %s Database %d %s.\nFound: %s"
                               (pr-str table-name) driver db-id (pr-str db-name)
                               (u/pprint-to-str (t2/select-pk->fn :name Table, :db_id db-id, :active true)))))))))

(defn- qualified-field-name [{parent-id :parent_id, field-name :name}]
  (if parent-id
    (str (qualified-field-name (t2/select-one Field :id parent-id))
         \.
         field-name)
    field-name))

(defn- all-field-names [table-id]
  (into {} (for [field (t2/select Field :active true, :table_id table-id)]
             [(u/the-id field) (qualified-field-name field)])))

(defn- the-field-id* [table-id field-name & {:keys [parent-id]}]
  (or (t2/select-one-pk Field, :active true, :table_id table-id, :name field-name, :parent_id parent-id)
      (let [{db-id :db_id, table-name :name} (t2/select-one [Table :name :db_id] :id table-id)
            db-name                          (t2/select-one-fn :name Database :id db-id)
            field-name                       (qualified-field-name {:parent_id parent-id, :name field-name})
            all-field-names                  (all-field-names table-id)]
        (throw
         (ex-info (format "Couldn't find Field %s for Table %s.\nFound:\n%s"
                          (pr-str field-name) (pr-str table-name) (u/pprint-to-str all-field-names))
                  {:field-name  field-name
                   :table       table-name
                   :table-id    table-id
                   :database    db-name
                   :database-id db-id
                   :all-fields  all-field-names})))))

(defn the-field-id
  "Internal impl of `(data/id table field)`."
  [table-id field-name & nested-field-names]
  {:pre [(integer? table-id)]}
  (doseq [field-name (cons field-name nested-field-names)]
    (assert ((some-fn keyword? string?) field-name)
            (format "Expected keyword or string field name; got ^%s %s"
                    (some-> field-name class .getCanonicalName)
                    (pr-str field-name))))
  (loop [parent-id (the-field-id* table-id field-name), [nested-field-name & more] nested-field-names]
    (if-not nested-field-name
      parent-id
      (recur (the-field-id* table-id nested-field-name, :parent-id parent-id) more))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              with-temp-copy-of-db                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- copy-table-fields! [old-table-id new-table-id]
  (t2/insert! Field
    (for [field (t2/select Field :table_id old-table-id {:order-by [[:id :asc]]})]
      (-> field (dissoc :id :fk_target_field_id) (assoc :table_id new-table-id))))
  ;; now copy the FieldValues as well.
  (let [old-field-id->name (t2/select-pk->fn :name Field :table_id old-table-id)
        new-field-name->id (t2/select-fn->pk :name Field :table_id new-table-id)
        old-field-values   (t2/select FieldValues :field_id [:in (set (keys old-field-id->name))])]
    (t2/insert! FieldValues
      (for [{old-field-id :field_id, :as field-values} old-field-values
            :let                                       [field-name (get old-field-id->name old-field-id)]]
        (-> field-values
            (dissoc :id)
            (assoc :field_id (get new-field-name->id field-name)))))))

(defn- copy-db-tables! [old-db-id new-db-id]
  (let [old-tables    (t2/select Table :db_id old-db-id {:order-by [[:id :asc]]})
        new-table-ids (t2/insert-returning-pks! Table
                        (for [table old-tables]
                          (-> table (dissoc :id) (assoc :db_id new-db-id))))]
    (doseq [[old-table-id new-table-id] (zipmap (map :id old-tables) new-table-ids)]
      (copy-table-fields! old-table-id new-table-id))))

(defn- copy-db-fks! [old-db-id new-db-id]
  (doseq [{:keys [source-field source-table target-field target-table]}
          (mdb.query/query {:select    [[:source-field.name :source-field]
                                        [:source-table.name :source-table]
                                        [:target-field.name   :target-field]
                                        [:target-table.name   :target-table]]
                            :from      [[:metabase_field :source-field]]
                            :left-join [[:metabase_table :source-table] [:= :source-field.table_id :source-table.id]
                                        [:metabase_field :target-field] [:= :source-field.fk_target_field_id :target-field.id]
                                        [:metabase_table :target-table] [:= :target-field.table_id :target-table.id]]
                            :where     [:and
                                        [:= :source-table.db_id old-db-id]
                                        [:= :target-table.db_id old-db-id]
                                        [:not= :source-field.fk_target_field_id nil]]})]
    (t2/update! Field (the-field-id (the-table-id new-db-id source-table) source-field)
                {:fk_target_field_id (the-field-id (the-table-id new-db-id target-table) target-field)})))

(defn- copy-db-tables-and-fields! [old-db-id new-db-id]
  (copy-db-tables! old-db-id new-db-id)
  (copy-db-fks! old-db-id new-db-id))

(defn- get-linked-secrets
  [{:keys [details] :as database}]
  (when-let [conn-props-fn (get-method driver/connection-properties (driver.u/database->driver database))]
    (let [conn-props (conn-props-fn (driver.u/database->driver database))]
      (into {}
            (keep (fn [prop-name]
                    (let [id-prop (keyword (str prop-name "-id"))]
                      (when-let [id (get details id-prop)]
                        [id-prop id]))))
            (keys (secret/conn-props->secret-props-by-name conn-props))))))

(defn- copy-secrets [database]
  (let [prop->old-id (get-linked-secrets database)]
    (if (seq prop->old-id)
      (let [secrets (t2/select [Secret :id :name :kind :source :value] :id [:in (set (vals prop->old-id))])
            new-ids (t2/insert-returning-pks! Secret (map #(dissoc % :id) secrets))
            old-id->new-id (zipmap (map :id secrets) new-ids)]
        (assoc database
               :details
               (reduce (fn [details [id-prop old-id]]
                         (assoc details id-prop (get old-id->new-id old-id)))
                 (:details database)
                 prop->old-id)))
      database)))

(def ^:dynamic *db-is-temp-copy?*
  "Whether the current test database is a temp copy created with the [[metabase.test/with-temp-copy-of-db]] macro."
  false)

(defn do-with-temp-copy-of-db
  "Internal impl of [[metabase.test/with-temp-copy-of-db]]. Run `f` with a temporary Database that copies the details
  from the standard test database, and syncs it."
  [f]
  (let [{old-db-id :id, :as old-db} (*get-db*)
        original-db (-> old-db copy-secrets (select-keys [:details :engine :name]))
        {new-db-id :id, :as new-db} (first (t2/insert-returning-instances! Database original-db))]
    (try
      (copy-db-tables-and-fields! old-db-id new-db-id)
      (binding [*db-is-temp-copy?* true]
        (do-with-db new-db f))
      (finally
        (t2/delete! Database :id new-db-id)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    dataset                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn resolve-dataset-definition
  "Impl for [[metabase.test/dataset]] macro. Resolve a dataset definition (e.g. `test-data` or `sad-toucan-incidents` in
  a namespace."
  [namespace-symb symb]
  @(or (ns-resolve namespace-symb symb)
       (do
         (classloader/require 'metabase.test.data.dataset-definitions)
         (ns-resolve 'metabase.test.data.dataset-definitions symb))
       (throw (Exception. (format "Dataset definition not found: '%s/%s' or 'metabase.test.data.dataset-definitions/%s'"
                                  namespace-symb symb symb)))))

(defn do-with-dataset
  "Impl for [[metabase.test/dataset]] macro."
  [dataset-definition f]
  (let [dbdef             (tx/get-dataset-definition dataset-definition)
        get-db-for-driver (mdb.connection/memoize-for-application-db
                           (fn [driver]
                             (binding [db/*disable-db-logging* true]
                               (let [db (get-or-create-database! driver dbdef)]
                                 (assert db)
                                 (assert (t2/exists? Database :id (u/the-id db)))
                                 db))))]
    (binding [*get-db* (fn []
                         (get-db-for-driver (tx/driver)))]
      (f))))
