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
  (:require [schema.core :as s]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [metabase.util.schema :as su]))

;;; ---------------------------------------------- Setting up the Store ----------------------------------------------

(def ^:private ^:dynamic *store*
  "Dynamic var used as the QP store for a given query execution."
  (atom nil))

(defn do-with-store
  "Execute `f` with a freshly-bound `*store*`."
  [f]
  (binding [*store* (atom {})]
    (f)))

(defmacro with-store
  "Execute `body` with a freshly-bound QP `*store*`. The `store` middleware takes care of setting up a fresh store for
  each query execution; you should have no need to use this macro yourself outside of that namespace."
  {:style/indent 0}
  [& body]
  `(do-with-store (fn [] ~@body)))

;; TODO - DATABASE ??

(def ^:private TableInstanceWithRequiredStoreKeys
  "Schema for Tables stored in the QP store (must be a `TableInstance` with at least the `:id`, `:schema`, and `:name`
  keys)."
  (s/both
   (class Table)
   {:id     su/IntGreaterThanZero ; TODO - what's the point of storing ID if it's already the key?
    :schema (s/maybe s/Str)
    :name   su/NonBlankString
    s/Any s/Any}))


;;; ------------------------------------------ Saving objects in the Store -------------------------------------------

(s/defn store-table!
  "Store a `table` in the QP Store for the duration of the current query execution. Throws an Exception if Table is
  invalid or doesn't have all required keys."
  [table :- TableInstanceWithRequiredStoreKeys]
  (swap! *store* assoc-in [:tables (u/get-id table)] table))

(s/defn store-field!
  "Store a `field` in the QP Store for the duration of the current query execution. Throws an Exception if Field is
  invalid or doesn't have all required keys."
  [field :- (class Field)]
  (swap! *store* assoc-in [:fields (u/get-id field)] field))

(s/defn store-field-literal!
  "Like `store-field!`, but designed for storing Fields referred to by `:field-literal` clauses, i.e. by name instead of
  by ID."
  [field-literal :- su/NonBlankString, field :- (class Field)]
  (swap! *store* assoc-in [:field-literals field-literal] field))


;;; ---------------------------------------- Fetching objects from the Store -----------------------------------------

(s/defn table :- TableInstanceWithRequiredStoreKeys
  "Fetch Table with `table-id` from the QP Store. Throws an Exception if valid item is not returned."
  [table-id :- su/IntGreaterThanZero]
  (get-in @*store* [:tables table-id]))

(s/defn field :- (class Field)
  "Fetch Field with `field-id` from the QP Store. Throws an Exception if valid item is not returned."
  [field-id :- su/IntGreaterThanZero]
  (get-in @*store* [:fields field-id]))

(s/defn field-liteal :- (class Field)
  "Fetch Field named by `field-literal` from the QP Store. Throws an Exception if valid item is not returned."
  [field-literal :- su/NonBlankString]
  (get-in @*store* [:field-literals field-literal]))
