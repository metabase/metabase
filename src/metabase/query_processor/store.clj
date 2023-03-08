(ns metabase.query-processor.store
  "The Query Processor Store caches resolved Tables and Fields for the duration of a query execution. Certain middleware
  handles resolving things like the query's source Table and any Fields that are referenced in a query, and saves the
  referenced objects in the store; other middleware and driver-specific query processor implementations use functions
  in the store to fetch those objects as needed.

  For example, a driver might be converting a Field ID clause (e.g. `[:field-id 10]`) to its native query language. It
  can fetch the underlying Metabase FieldInstance by calling `field`:

    (qp.store/field 10) ;; get Field 10

   Of course, it would be entirely possible to call `(t2/select-one Field :id 10)` every time you needed information
  about that Field, but fetching all Fields in a single pass and storing them for reuse is dramatically more efficient
  than fetching those Fields potentially dozens of times in a single query execution."
  (:require
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.store.app-db-provider
    :as qp.store.app-db-provider]
   [metabase.query-processor.store.atom-store :as qp.store.atom-store]
   [metabase.query-processor.store.interface :as qp.store.interface]
   [metabase.query-processor.store.unintialized :as qp.store.uninitialized]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (metabase.query_processor.store.unintialized UninitializedProvider UninitializedStore)))

(def ^:dynamic *provider*
  "Provider that can be used as the source to populate the QP store, e.g. the application database."
  (qp.store.uninitialized/->UninitializedProvider))

(def ^:dynamic *store*
  "Dynamic var used as the QP store for a given query execution."
  (qp.store.uninitialized/->UninitializedStore))

(defn initialized?
  "Is the QP store currently initialized?"
  []
  (and (not (instance? UninitializedProvider *provider*))
       (not (instance? UninitializedStore *store*))))

(mu/defn database :- qp.store.interface/DatabaseInstanceWithRequiredStoreKeys
  "Fetch the Database referenced by the current query from the QP Store. Throws an Exception if valid item is not
  returned."
  []
  (or (qp.store.interface/database *store*)
      (throw (Exception. (tru "Error: Database is not present in the Query Processor Store.")))))

(mu/defn store-database!
  "Store the Database referenced by this query for the duration of the current query execution. Throws an Exception if
  database is invalid or doesn't have all the required keys."
  [database :- qp.store.interface/DatabaseInstanceWithRequiredStoreKeys]
  (qp.store.interface/store-database! *store* database))

(mu/defn ^:private db-id :- ms/IntGreaterThanZero
  []
  (:id (database)))

(mu/defn fetch-and-store-database!
  "Fetch the Database this query will run against from the application database, and store it in the QP Store for the
  duration of the current query execution. If Database has already been fetched, this function will no-op. Throws an
  Exception if Table does not exist."
  [database-id :- ms/IntGreaterThanZero]
  (if-let [existing-db-id (:id (qp.store.interface/database *store*))]
    ;; if there's already a DB in the Store, double-check it has the same ID as the one that we were asked to fetch
    (when-not (= existing-db-id database-id)
      (throw (ex-info (tru "Attempting to fetch second Database. Queries can only reference one Database.")
                      {:existing-id existing-db-id, :attempted-to-fetch database-id})))
    ;; if there's no DB, fetch + save
    (store-database!
     (or (qp.store.interface/fetch-database *provider* database-id)
         (throw (ex-info (tru "Database {0} does not exist." (str database-id))
                         {:database database-id}))))))

(mu/defn table :- qp.store.interface/TableInstanceWithRequiredStoreKeys
  "Fetch Table with `table-id` from the QP Store. Throws an Exception if valid item is not returned."
  [table-id :- ms/IntGreaterThanZero]
  (or (qp.store.interface/table *store* table-id)
      (throw (Exception. (tru "Error: Table {0} is not present in the Query Processor Store." table-id)))))

(mu/defn store-table!
  "Store a `table` in the QP Store for the duration of the current query execution. Throws an Exception if table is
  invalid or doesn't have all required keys."
  [table :- qp.store.interface/TableInstanceWithRequiredStoreKeys]
  (qp.store.interface/store-table! *store* table))

(def ^:private IDs
  [:or
   [:sequential ms/IntGreaterThanZero]
   [:set ms/IntGreaterThanZero]])

(mu/defn fetch-and-store-tables!
  "Fetch Table(s) from the application database, and store them in the QP Store for the duration of the current query
  execution. If Table(s) have already been fetched, this function will no-op. Throws an Exception if Table(s) do not
  exist."
  [table-ids :- IDs]
  (when-let [ids-to-fetch (not-empty (into #{}
                                           ;; remove any IDs for Tables that have already been fetched
                                           (remove (fn [table-id]
                                                     (qp.store.interface/table *store* table-id)))
                                           table-ids))]
    (let [fetched-tables (qp.store.interface/fetch-tables *provider* (db-id) ids-to-fetch)
          fetched-ids    (set (map :id fetched-tables))]
      ;; make sure all Tables in table-ids were fetched, or throw an Exception
      (doseq [id ids-to-fetch]
        (when-not (fetched-ids id)
          (throw
           (ex-info (tru "Failed to fetch Table {0}: Table does not exist, or belongs to a different Database." id)
                    {:table id, :database (db-id)}))))
      ;; ok, now store them all in the Store
      (doseq [table fetched-tables]
        (store-table! table)))))

(mu/defn field :- qp.store.interface/FieldInstanceWithRequiredStorekeys
  "Fetch Field with `field-id` from the QP Store. Throws an Exception if valid item is not returned."
  [field-id :- ms/IntGreaterThanZero]
  (or (qp.store.interface/field *store* field-id)
      (throw (Exception. (tru "Error: Field {0} is not present in the Query Processor Store." field-id)))))

(mu/defn store-field!
  "Store a `field` in the QP Store for the duration of the current query execution. Throws an Exception if field is
  invalid or doesn't have all required keys."
  [field :- qp.store.interface/FieldInstanceWithRequiredStorekeys]
  (qp.store.interface/store-field! *store* field))

(mu/defn fetch-and-store-fields!
  "Fetch Field(s) from the application database, and store them in the QP Store for the duration of the current query
  execution. If Field(s) have already been fetched, this function will no-op. Throws an Exception if Field(s) do not
  exist."
  [field-ids :- IDs]
  (when-let [ids-to-fetch (not-empty
                           (into #{}
                                 ;; remove any IDs for Fields that have already been fetched
                                 (remove (fn [field-id]
                                           (qp.store.interface/field *store* field-id)))
                                 field-ids))]
    (let [fetched-fields (qp.store.interface/fetch-fields *provider* (db-id) ids-to-fetch)
          fetched-ids    (set (map :id fetched-fields))]
      ;; make sure all Fields in field-ids were fetched, or throw an Exception
      (doseq [id ids-to-fetch]
        (when-not (fetched-ids id)
          (throw
           (ex-info (tru "Failed to fetch Field {0}: Field does not exist, or belongs to a different Database." id)
                    {:field id, :database (db-id)}))))
      ;; ok, now store them all in the Store
      (doseq [field fetched-fields]
        (store-field! field)))))

(defn do-with-store
  "Execute `f` with an initialized `*store*` if one is not already bound."
  [thunk]
  (if (initialized?)
    (thunk)
    (binding [*provider* (qp.store.app-db-provider/->AppDBProvider)
              *store*    (qp.store.atom-store/->AtomStore (atom {}))]
      (thunk))))

(defmacro with-store
  "Execute `body` with an initialized QP `*store*`. The `store` middleware takes care of setting up a store as needed
  for each query execution; you should have no need to use this macro yourself outside of that namespace."
  {:style/indent 0}
  [& body]
  `(do-with-store (fn [] ~@body)))

(mu/defn store-miscellaneous-value!
  "Store a miscellaneous value in a the cache. Persists for the life of this QP invocation, including for recursive
  calls."
  [ks v]
  (qp.store.interface/store-misc-value! *store* ks v))

(mu/defn miscellaneous-value
  "Fetch a miscellaneous value from the cache. Unlike other Store functions, does not throw if value is not found."
  ([ks]
   (miscellaneous-value ks nil))

  ([ks not-found]
   (qp.store.interface/misc-value *store* ks not-found)))

(defn cached-fn
  "Attempt to fetch a miscellaneous value from the cache using key sequence `ks`; if not found, runs `thunk` to get the
  value, stores it in the cache, and returns the value. You can use this to ensure a given function is only ran once
  during the duration of a QP execution.

  See also `cached` macro."
  {:style/indent 1}
  [ks thunk]
  (let [cached-value (miscellaneous-value ks ::not-found)]
    (if-not (= cached-value ::not-found)
      cached-value
      (let [v (thunk)]
        (store-miscellaneous-value! ks v)
        v))))

(defmacro cached
  "Cache the value of `body` for key(s) for the duration of this QP execution. (Body is only evaluated the once per QP
  run; subsequent calls return the cached result.)

  Note that each use of `cached` generates its own unique first key for cache keyseq; thus while it is not possible to
  share values between multiple `cached` forms, you do not need to worry about conflicts with other places using this
  macro.

    ;; cache lookups of Card.dataset_query
    (qp.store/cached card-id
      (t2/select-one-field :dataset_query Card :id card-id))"
  {:style/indent 1}
  [k-or-ks & body]
  ;; for the unique key use a gensym prefixed by the namespace to make for easier store debugging if needed
  (let [ks (into [(list 'quote (gensym (str (name (ns-name *ns*)) "/misc-cache-")))] (u/one-or-many k-or-ks))]
    `(cached-fn ~ks (fn [] ~@body))))
