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
            [schema.core :as s]))

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

(def database-columns-to-fetch
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

(def table-columns-to-fetch
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


(def field-columns-to-fetch
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

(s/defn store-database!
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

(s/defn already-fetched-field-ids :- #{su/IntGreaterThanZero}
  "Get a set of all the IDs of Fields that have already been fetched -- which means you don't have to do it again."
  []
  (set (keys (:fields @*store*))))


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

(s/defn has-table?
  "True if the store already has Table with `table-id`."
  [table-id :- su/IntGreaterThanZero]
  (boolean (get-in @*store* [:tables table-id])))

(s/defn has-field?
  "True if the store already has Field with `field-id`."
  [field-id :- su/IntGreaterThanZero]
  (boolean (get-in @*store* [:fields field-id])))
