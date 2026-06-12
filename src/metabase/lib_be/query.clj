(ns metabase.lib-be.query
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.metadata.util :as lib.metadata.util]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.util.malli :as mu]))

(mu/defn bulk-load-query-metadata!
  "Bulk-load all metadata referenced by `referenced-entity-ids` into `metadata-providerable`'s cache."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {:keys [table card metric measure segment snippet]} :- ::lib.walk.util/referenced-entity-ids]
  (when (seq table)
    (lib.metadata/bulk-metadata metadata-providerable :metadata/table table)
    ;; also warm the columns of all the referenced Tables in one call, since query processing will almost certainly
    ;; want to list the fields of each of them
    (lib.metadata.protocols/metadatas (lib.metadata.util/->metadata-provider metadata-providerable)
                                      {:lib/type :metadata/column, :table-ids (set table)}))
  (when (seq card)
    (lib.metadata/bulk-metadata metadata-providerable :metadata/card card))
  (when (seq metric)
    (lib.metadata/bulk-metadata metadata-providerable :metadata/metric metric))
  (when (seq measure)
    (lib.metadata/bulk-metadata metadata-providerable :metadata/measure measure))
  (when (seq segment)
    (lib.metadata/bulk-metadata metadata-providerable :metadata/segment segment))
  (when (seq snippet)
    (lib.metadata/bulk-metadata metadata-providerable :metadata/native-query-snippet snippet))
  nil)
