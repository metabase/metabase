(ns metabase.query-processor.store.metadata-provider
  (:require
   [metabase.lib.metadata.composed-provider
    :as lib.metadata.composed-provider]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [pretty.core :as pretty]))

(defn- base-metadata-provider []
  (reify
    lib.metadata.protocols/MetadataProvider
    (database [_this]
      (some-> (qp.store/database) (update-keys u/->kebab-case-en) (assoc :lib/type :metadata/database)))

    (table [_this table-id]
      (some-> (qp.store/table table-id) (update-keys u/->kebab-case-en) (assoc :lib/type :metadata/table)))

    (field [_this field-id]
      (some-> (qp.store/field field-id) (update-keys u/->kebab-case-en) (assoc :lib/type :metadata/column)))

    (card [_this _card-id] nil)
    (metric [_this _metric-id] nil)
    (segment [_this _segment-id] nil)
    (tables [_metadata-provider] nil)
    (fields [_metadata-provider _table-id] nil)

    pretty/PrettyPrintable
    (pretty [_this]
      `metadata-provider)))

(defn metadata-provider
  "Create a new MLv2 metadata provider that uses the QP store."
  []
  (qp.store/cached ::metadata-provider
    (lib.metadata.composed-provider/composed-metadata-provider
     (base-metadata-provider)
     (lib.metadata.jvm/application-database-metadata-provider (:id (qp.store/database))))))
