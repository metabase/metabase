(ns metabase.query-processor.store
  "The Query Processor Store caches resolved Tables and Fields for the duration of a query execution. Certain middleware
  handles resolving things like the query's source Table and any Fields that are referenced in a query, and saves the
  referenced objects in the store; other middleware and driver-specific query processor implementations use functions
  in the store to fetch those objects as needed.

  For example, a driver might be converting a Field ID clause (e.g. `[:field-id 10]`) to its native query language. It
  can fetch the underlying Metabase FieldInstance by calling `field`:

    (qp.store/field 10) ;; get Field 10

   Of course, it would be entirely possible to call `(Field 10)` every time you needed information about that Field,
  but fetching all Fields in a single pass and storing them for reuse is dramatically more efficient than fetching
  those Fields potentially dozens of times in a single query execution."
  (:require [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; ---------------------------------------------- Setting up the Store ----------------------------------------------

(def ^:private ^:dynamic *store*
  "Dynamic var used as the QP store for a given query execution."
  (delay (throw (Exception. (str (tru "Error: Query Processor store is not initialized."))))))

(defn initialized?
  "Is the QP store currently initialized?"
  []
  (not (delay? *store*)))

(defn do-with-new-store
  "Execute `f` with a freshly-bound `*store*`."
  [f]
  (binding [*store* (atom {})]
    (f)))

(defmacro with-store
  "Execute `body` with a freshly-bound QP `*store*`. The `store` middleware takes care of setting up a fresh store for
  each query execution; you should have no need to use this macro yourself outside of that namespace."
  {:style/indent 0}
  [& body]
  `(do-with-new-store (fn [] ~@body)))

(def ^:private database-columns-to-fetch
  "Columns you should fetch for the Database referenced by the query before stashing in the store."
  [:id
   :engine
   :name
   :details])

(def ^:private DatabaseInstanceWithRequiredStoreKeys
  (s/both
   (class Database)
   {:id      su/IntGreaterThanZero
    :engine  s/Keyword
    :name    su/NonBlankString
    :details su/Map
    s/Any    s/Any}))

(def ^:private table-columns-to-fetch
  "Columns you should fetch for any Table you want to stash in the Store."
  [:id
   :name
   :schema])

(def ^:private TableInstanceWithRequiredStoreKeys
  (s/both
   (class Table)
   {:schema (s/maybe s/Str)
    :name   su/NonBlankString
    s/Any   s/Any}))


(def ^:private field-columns-to-fetch
  "Columns to fetch for and Field you want to stash in the Store. These get returned as part of the `:cols` metadata in
  query results. Try to keep this set pared down to just what's needed by the QP and frontend, since it has to be done
  for every MBQL query."
  [:base_type
   :database_type
   :description
   :display_name
   :fingerprint
   :id
   :name
   :parent_id
   :settings
   :special_type
   :table_id
   :visibility_type])

(def ^:private FieldInstanceWithRequiredStorekeys
  (s/both
   (class Field)
   {:name          su/NonBlankString
    :display_name  su/NonBlankString
    :description   (s/maybe s/Str)
    :database_type su/NonBlankString
    :base_type     su/FieldType
    :special_type  (s/maybe su/FieldType)
    :fingerprint   (s/maybe su/Map)
    :parent_id     (s/maybe su/IntGreaterThanZero)
    s/Any          s/Any}))


;;; ------------------------------------------ Saving objects in the Store -------------------------------------------

(s/defn ^:private store-database!
  "Store the Database referenced by this query for the duration of the current query execution. Throws an Exception if
  database is invalid or doesn't have all the required keys."
  [database :- DatabaseInstanceWithRequiredStoreKeys]
  (swap! *store* assoc :database database))

(s/defn store-table!
  "Store a `table` in the QP Store for the duration of the current query execution. Throws an Exception if table is
  invalid or doesn't have all required keys."
  [table :- TableInstanceWithRequiredStoreKeys]
  (swap! *store* assoc-in [:tables (u/get-id table)] table))

(s/defn store-field!
  "Store a `field` in the QP Store for the duration of the current query execution. Throws an Exception if field is
  invalid or doesn't have all required keys."
  [field :- FieldInstanceWithRequiredStorekeys]
  (swap! *store* assoc-in [:fields (u/get-id field)] field))


;;; ----------------------- Fetching objects from application DB, and saving them in the store -----------------------

(s/defn ^:private db-id :- su/IntGreaterThanZero
  []
  (or (get-in @*store* [:database :id])
      (throw (Exception. (str (tru "Cannot store Tables or Fields before Database is stored."))))))

(s/defn fetch-and-store-database!
  "Fetch the Database this query will run against from the application database, and store it in the QP Store for the
  duration of the current query execution. If Database has already been fetched, this function will no-op. Throws an
  Exception if Table does not exist."
  [database-id :- su/IntGreaterThanZero]
  (if-let [existing-db-id (get-in @*store* [:database :id])]
    ;; if there's already a DB in the Store, double-check it has the same ID as the one that we were asked to fetch
    (when-not (= existing-db-id database-id)
      (throw (ex-info (str (tru "Attempting to fetch second Database. Queries can only reference one Database."))
               {:existing-id existing-db-id, :attempted-to-fetch database-id})))
    ;; if there's no DB, fetch + save
    (store-database! (db/select-one (into [Database] database-columns-to-fetch) :id database-id))))

(def ^:private IDs
  (s/maybe
   (s/cond-pre
    #{su/IntGreaterThanZero}
    [su/IntGreaterThanZero])))

(s/defn fetch-and-store-tables!
  "Fetch Table(s) from the application database, and store them in the QP Store for the duration of the current query
  execution. If Table(s) have already been fetched, this function will no-op. Throws an Exception if Table(s) do not
  exist."
  [table-ids :- IDs]
  ;; remove any IDs for Tables that have already been fetched
  (when-let [ids-to-fetch (seq (remove (set (keys (:tables @*store*))) table-ids))]
    (let [fetched-tables (db/select (into [Table] table-columns-to-fetch)
                           :id    [:in (set ids-to-fetch)]
                           :db_id (db-id))
          fetched-ids    (set (map :id fetched-tables))]
      ;; make sure all Tables in table-ids were fetched, or throw an Exception
      (doseq [id ids-to-fetch]
        (when-not (fetched-ids id)
          (throw
           (ex-info (str (tru "Failed to fetch Table {0}: Table does not exist, or belongs to a different Database." id))
             {:table id, :database (db-id)}))))
      ;; ok, now store them all in the Store
      (doseq [table fetched-tables]
        (store-table! table)))))

(s/defn fetch-and-store-fields!
  "Fetch Field(s) from the application database, and store them in the QP Store for the duration of the current query
  execution. If Field(s) have already been fetched, this function will no-op. Throws an Exception if Field(s) do not
  exist."
  [field-ids :- IDs]
  ;; remove any IDs for Fields that have already been fetched
  (when-let [ids-to-fetch (seq (remove (set (keys (:fields @*store*))) field-ids))]
    (let [fetched-fields (db/do-post-select Field
                           (db/query
                            {:select    (for [column-kw field-columns-to-fetch]
                                          [(keyword (str "field." (name column-kw)))
                                           column-kw])
                             :from      [[Field :field]]
                             :left-join [[Table :table] [:= :field.table_id :table.id]]
                             :where     [:and
                                         [:in :field.id (set ids-to-fetch)]
                                         [:= :table.db_id (db-id)]]}))
          fetched-ids    (set (map :id fetched-fields))]
      ;; make sure all Fields in field-ids were fetched, or throw an Exception
      (doseq [id ids-to-fetch]
        (when-not (fetched-ids id)
          (throw
           (ex-info (str (tru "Failed to fetch Field {0}: Field does not exist, or belongs to a different Database." id))
             {:field id, :database (db-id)}))))
      ;; ok, now store them all in the Store
      (doseq [field fetched-fields]
        (store-field! field)))))


;;; ---------------------------------------- Fetching objects from the Store -----------------------------------------

(s/defn database :- DatabaseInstanceWithRequiredStoreKeys
  "Fetch the Database referenced by the current query from the QP Store. Throws an Exception if valid item is not
  returned."
  []
  (or (:database @*store*)
      (throw (Exception. (str (tru "Error: Database is not present in the Query Processor Store."))))))

(s/defn table :- TableInstanceWithRequiredStoreKeys
  "Fetch Table with `table-id` from the QP Store. Throws an Exception if valid item is not returned."
  [table-id :- su/IntGreaterThanZero]
  (or (get-in @*store* [:tables table-id])
      (throw (Exception. (str (tru "Error: Table {0} is not present in the Query Processor Store." table-id))))))

(s/defn field :- FieldInstanceWithRequiredStorekeys
  "Fetch Field with `field-id` from the QP Store. Throws an Exception if valid item is not returned."
  [field-id :- su/IntGreaterThanZero]
  (or (get-in @*store* [:fields field-id])
      (throw (Exception. (str (tru "Error: Field {0} is not present in the Query Processor Store." field-id))))))
