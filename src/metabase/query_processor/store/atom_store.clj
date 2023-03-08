(ns metabase.query-processor.store.atom-store
  "An impl of [[metabase.query-processor.store.interface/QPStore]] that uses an atom to store stuff. This is the default
  impl."
  (:require
   [metabase.query-processor.store.interface :as qp.store.interface]
   [potemkin :as p]
   [pretty.core :as pretty]))

(p/defrecord+ AtomStore [store]
  qp.store.interface/QPStore
  (database          [_this]              (:database @store))
  (store-database!   [_this database]     (swap! store assoc :database database))
  (tables            [_this]              (vals (:tables @store)))
  (table             [_this table-id]     (get-in @store [:tables table-id]))
  (store-table!      [_this table]        (swap! store assoc-in [:tables (:id table)] table))
  (fields            [_this]              (vals (:fields @store)))
  (field             [_this field-id]     (get-in @store [:fields field-id]))
  (store-field!      [_this field]        (swap! store assoc-in [:fields (:id field)] field))
  (misc-value        [_this ks not-found] (get-in @store (cons :misc ks) not-found))
  (store-misc-value! [_this ks new-value] (swap! store assoc-in (cons :misc ks) new-value))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->AtomStore store)))
