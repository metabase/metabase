(ns metabase.query-processor.store.metadata-provider
  "An implement [[metabase.lib.metadata.protocols/DatabaseMetadataProvider]] that uses a QP Store."
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.store.interface :as qp.store.interface]
   [potemkin :as p]
   [pretty.core :as pretty]))

(p/defrecord+ MetadataProvider []
  lib.metadata.protocols/DatabaseMetadataProvider
  (database [_this]
    (assoc (qp.store/database) :lib/type :metadata/database))
  (tables [_this]
    (for [table (qp.store.interface/tables qp.store/*store*)]
      (assoc table :lib/type :metadata/table)))
  (fields [_this table-id]
    (into []
          (comp (filter (fn [field]
                          (= (:table_id field) table-id)))
                (map (fn [field]
                       (assoc (into {} field) :lib/type :metadata/field))))
          (qp.store.interface/fields qp.store/*store*)))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->MetadataProvider)))
