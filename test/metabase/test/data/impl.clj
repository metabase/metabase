(ns metabase.test.data.impl
  "Internal implementation of various helper functions in `metabase.test.data`."
  (:require
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models :refer [Database Field FieldValues Secret Table]]
   [metabase.models.secret :as secret]
   [metabase.plugins.classloader :as classloader]
   [metabase.test.data.impl.get-or-create :as test.data.impl.get-or-create]
   [metabase.test.data.impl.verify :as verify]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

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

(defn- get-or-create-default-dataset!
  "Get or create the Test Data database for `driver`, which defaults to [[metabase.driver/*driver*]], or `:h2` if that
  is unbound."
  ([]       (get-or-create-default-dataset! (tx/driver)))
  ([driver] (get-or-create-database! driver (tx/default-dataset driver))))

(def ^:dynamic ^{:arglists '([])} ^:private *db-fn*
  "Implementation of `db` function that should return the current working test database when called, always with no
  arguments. By default, this is [[get-or-create-default-dataset!]] for the current [[metabase.driver/*driver*]], which
  does exactly what it suggests."
  #'get-or-create-default-dataset!)

(mu/defn db :- [:map [:id ::lib.schema.id/database]]
  []
  (*db-fn*))

(defn- make-memoized-test-database-id-fn
  "Create a function with the signature

    (f driver) => test-data-database-id

  That is memoized for the current application database."
  []
  (mdb/memoize-for-application-db
   (fn [driver]
     (u/the-id (get-or-create-default-dataset! driver)))))

(def ^:private memoized-test-data-database-id-fn
  "Atom with a function with the signature

    (f driver) => test-database-database-id"
  (atom nil))

(defn- reset-memoized-test-data-database-id! []
  (reset! memoized-test-data-database-id-fn (make-memoized-test-database-id-fn)))

(reset-memoized-test-data-database-id!)

(defn- test-data-database-id []
  (@memoized-test-data-database-id-fn (tx/driver)))

(def ^:private ^:dynamic ^{:arglists '([])} *db-id-fn*
  #'test-data-database-id)

(mu/defn db-id :- ::lib.schema.id/database
  []
  (*db-id-fn*))

(derive :model/Database ::database.reset-memoized-test-data-database-id-on-delete)

;;; there's no Toucan 2 `define-after-delete` yet, but we can it by adding an after method that runs after transducing
;;; the query.
(methodical/defmethod t2.pipeline/transduce-query :after
  [#_query-type     :toucan.query-type/delete.*
   #_model          ::database.reset-memoized-test-data-database-id-on-delete
   #_resolved-query :default]
  "Clear cached `test-data` Database IDs when Databases are deleted."
  [_rf _query-type _model _parsed-args result]
  (reset-memoized-test-data-database-id!)
  result)

;;; ID lookup maps look like these:
;;;
;;; Table:
;;;
;;;    {"VENUES" 10, "USERS" 11, "CHECKINS" 12, "CATEGORIES" 13}
;;;
;;; Field:
;;;
;;;    [parent-id name] => ID
;;;
;;;    {[nil "PRICE"]       71
;;;     [nil "CATEGORY_ID"] 72
;;;     [nil "DATE"]        79
;;;     [nil "PASSWORD"]    77
;;;     [nil "VENUE_ID"]    82
;;;     [nil "ID"]          81
;;;     [nil "NAME"]        84
;;;     [nil "ID"]          83
;;;     [nil "USER_ID"]     80
;;;     [nil "LAST_LOGIN"]  76
;;;     [nil "ID"]          75
;;;     [nil "LONGITUDE"]   70
;;;     [nil "LATITUDE"]    74
;;;     [nil "NAME"]        73
;;;     [nil "NAME"]        78
;;;     [nil "ID"]          69}

(mu/defn ^:private build-table-lookup-map
  [database-id :- ::lib.schema.id/database]
  (t2/select-fn->pk (juxt (constantly database-id) :name)
                    [:model/Table :id :name]
                    :db_id  database-id
                    :active true))

(mu/defn ^:private build-field-lookup-map
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn->pk (juxt :parent_id :name)
                    [:model/Field :id :name :parent_id]
                    :table_id table-id
                    :active   true))

(def ^:private ^{:arglists '([database-id])} table-lookup-map
  (mdb/memoize-for-application-db build-table-lookup-map))

(def ^:private ^{:arglists '([field-lookup-map])} field-lookup-map
  (mdb/memoize-for-application-db build-field-lookup-map))

(defn- cached-table-id [db-id table-name]
  (get (table-lookup-map db-id) [db-id table-name]))

(defn- cached-field-id [table-id parent-id field-name]
  (get (field-lookup-map table-id) [parent-id field-name]))

(mu/defn do-with-db
  "Internal impl of [[metabase.test.data/with-db]]."
  [db    :- [:map [:id ::lib.schema.id/database]]
   thunk :- fn?]
  (binding [*db-fn*    (constantly db)
            *db-id-fn* (constantly (u/the-id db))]
    (thunk)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                       id                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- table-id-from-app-db
  [db-id table-name]
  (t2/select-one-pk [Table :id] :db_id db-id, :name table-name, :active true))

(defn- throw-unfound-table-error [db-id table-name]
  (let [{driver :engine, db-name :name} (t2/select-one [:model/Database :name :engine] :id db-id)]
    (throw
     (Exception. (format "No Table %s found for %s Database %d %s.\nFound: %s"
                         (pr-str table-name) driver db-id (pr-str db-name)
                         (u/pprint-to-str (t2/select-pk->fn :name Table, :db_id db-id, :active true)))))))

(mu/defn the-table-id :- ::lib.schema.id/table
  "Internal impl of `(data/id table)."
  [db-id      :- ::lib.schema.id/database
   table-name :- :string]
  (or (cached-table-id db-id table-name)
      (table-id-from-app-db db-id table-name)
      (let [db-name              (t2/select-one-fn :name [:model/Database :name] :id db-id)
            qualified-table-name (tx/db-qualified-table-name db-name table-name)]
        (cached-table-id db-id qualified-table-name)
        (table-id-from-app-db db-id qualified-table-name))
      (throw-unfound-table-error db-id table-name)))

(defn- field-id-from-app-db [table-id parent-id field-name]
  (t2/select-one-pk Field, :active true, :table_id table-id, :name field-name, :parent_id parent-id))

(defn- qualified-field-name [parent-id field-name]
  (if parent-id
    (str (t2/select-one-fn (fn [field]
                             (qualified-field-name (:parent_id field) (:name field)))
                           [:model/Field :parent_id :name]
                           :id parent-id
                           :active true)
         \.
         field-name)
    field-name))

(defn- all-field-names [table-id]
  (t2/select-fn->fn :id
                    (fn [field]
                      (qualified-field-name (:parent_id field) (:name field)))
                    [:model/Field :id :parent_id :name]
                    :active true, :table_id table-id))

(defn- throw-unfound-field-errror
  [table-id parent-id field-name]
  (let [table-name      (t2/select-one-fn :name [:model/Table :name] :id table-id)
        field-name      (qualified-field-name parent-id field-name)
        all-field-names (all-field-names table-id)]
    (throw
     (ex-info (format "Couldn't find Field %s for Table %s.\nFound:\n%s"
                      (pr-str field-name) (pr-str table-name) (u/pprint-to-str all-field-names))
              {:field-name  field-name
               :table       table-name
               :table-id    table-id
               :all-fields  all-field-names}))))

(defn- the-field-id* [table-id parent-id field-name]
  (or (cached-field-id table-id parent-id field-name)
      (field-id-from-app-db table-id parent-id field-name)
      (throw-unfound-field-errror table-id parent-id field-name)))

(mu/defn the-field-id :- ::lib.schema.id/field
  "Internal impl of `(data/id table field)`."
  [table-id             :- ::lib.schema.id/table
   field-name           :- :string
   & nested-field-names :- [:* :string]]
  (loop [id (the-field-id* table-id nil field-name), [nested-field-name & more] nested-field-names]
    (if-not nested-field-name
      id
      (recur (the-field-id* table-id id nested-field-name) more))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              with-temp-copy-of-db                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- copy-table-fields! [old-table-id new-table-id]
  (t2/insert! Field
    (for [field (t2/select Field :table_id old-table-id, :active true, {:order-by [[:id :asc]]})]
      (-> field (dissoc :id :fk_target_field_id) (assoc :table_id new-table-id))))
  ;; now copy the FieldValues as well.
  (let [old-field-id->name (t2/select-pk->fn :name Field :table_id old-table-id :active true)
        new-field-name->id (t2/select-fn->pk :name Field :table_id new-table-id :active true)
        old-field-values   (t2/select FieldValues :field_id [:in (set (keys old-field-id->name))])]
    (t2/insert! FieldValues
      (for [{old-field-id :field_id, :as field-values} old-field-values
            :let                                       [field-name (get old-field-id->name old-field-id)]]
        (-> field-values
            (dissoc :id)
            (assoc :field_id (get new-field-name->id field-name))
            ;; Toucan after-select for FieldValues returns NULL human_readable_values as [] for FE-friendliness..
            ;; preserve NULL in the app DB copy so we don't end up changing things that rely on checking whether its
            ;; NULL like [[metabase.models.params.chain-filter/search-cached-field-values?]]
            (update :human_readable_values not-empty))))))

(defn- copy-db-tables! [old-db-id new-db-id]
  (let [old-tables    (t2/select Table :db_id old-db-id, :active true, {:order-by [[:id :asc]]})
        new-table-ids (sort ; sorting by PK recovers the insertion order, because insert-returning-pks! doesn't guarantee this
                       (t2/insert-returning-pks! Table
                                                 (for [table old-tables]
                                                   (-> table (dissoc :id) (assoc :db_id new-db-id)))))]
    (doseq [[old-table-id new-table-id] (zipmap (map :id old-tables) new-table-ids)]
      (copy-table-fields! old-table-id new-table-id))))

(defn- copy-db-fks! [old-db-id new-db-id]
  (doseq [{:keys [source-field source-table target-field target-table]}
          (mdb.query/query {:select    [[:source-field.name :source-field]
                                        [:source-table.name :source-table]
                                        [:target-field.name :target-field]
                                        [:target-table.name :target-table]]
                            :from      [[:metabase_field :source-field]]
                            :left-join [[:metabase_table :source-table] [:= :source-field.table_id :source-table.id]
                                        [:metabase_field :target-field] [:= :source-field.fk_target_field_id :target-field.id]
                                        [:metabase_table :target-table] [:= :target-field.table_id :target-table.id]]
                            :where     [:and
                                        [:= :source-table.db_id old-db-id]
                                        [:= :target-table.db_id old-db-id]
                                        :source-field.active
                                        :target-field.active
                                        :source-table.active
                                        :target-table.active
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
  (let [{old-db-id :id, :as old-db} (*db-fn*)
        original-db (-> old-db copy-secrets (select-keys [:details :engine :name]))
        {new-db-id :id, :as new-db} (first (t2/insert-returning-instances! Database original-db))]
    (try
      (copy-db-tables-and-fields! old-db-id new-db-id)
      (test.data.impl.get-or-create/set-test-db-permissions! new-db-id)
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
        get-db-for-driver (mdb/memoize-for-application-db
                           (fn [driver]
                             (let [db (get-or-create-database! driver dbdef)]
                               (assert db)
                               (assert (pos-int? (:id db)))
                               db)))
        db-fn             #(get-db-for-driver (tx/driver))]
    (binding [*db-fn*    db-fn
              *db-id-fn* #(u/the-id (db-fn))]
      (f))))
