(ns metabase.query-processor.store.unintialized
  "Impls of [[metabase.query-processor.store.interface/QPStoreProvider]]
  and [[metabase.query-processor.store.interface/QPStore]] that throw Exceptions if you call any of their methods."
  (:require
   [metabase.query-processor.store.interface :as qp.store.interface]
   [metabase.util.i18n :refer [tru]]
   [potemkin :as p]
   [pretty.core :as pretty]))

(defn- throw-uninitialized-exception []
  (throw (Exception. (tru "Error: Query Processor store is not initialized."))))

(p/defrecord+ UninitializedProvider []
  qp.store.interface/QPStoreProvider
  (fetch-database [_this _database-id]            (throw-uninitialized-exception))
  (fetch-tables   [_this _database-id _table-ids] (throw-uninitialized-exception))
  (fetch-fields   [_this _database-id _field-ids] (throw-uninitialized-exception))

  pretty/PrettyPrintable
  (pretty [_this]
    `(->UninitializedProvider)))

(p/defrecord+ UninitializedStore []
  qp.store.interface/QPStore
  (database          [_this]                (throw-uninitialized-exception))
  (store-database!   [_this _database]      (throw-uninitialized-exception))
  (tables            [_this]                (throw-uninitialized-exception))
  (table             [_this _table-id]      (throw-uninitialized-exception))
  (store-table!      [_this _table]         (throw-uninitialized-exception))
  (fields            [_this]                (throw-uninitialized-exception))
  (field             [_this _field-id]      (throw-uninitialized-exception))
  (store-field!      [_this _field]         (throw-uninitialized-exception))
  (misc-value        [_this _ks _not-found] (throw-uninitialized-exception))
  (store-misc-value! [_this _ks _new-value] (throw-uninitialized-exception))

  pretty/PrettyPrintable
  (pretty [_this]
    `(->UninitializedStore)))
