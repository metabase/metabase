(ns metabase.lib-be.query
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.util.malli :as mu]))

(mu/defn bulk-load-query-metadata
  "Bulk-load all metadata referenced by `referenced-entity-ids` into `metadata-providerable`'s cache."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {:keys [table card metric measure segment snippet]} :- ::lib.walk.util/referenced-entity-ids]
  (lib.metadata/bulk-metadata metadata-providerable :metadata/table table)
  (lib.metadata/bulk-metadata metadata-providerable :metadata/card card)
  (lib.metadata/bulk-metadata metadata-providerable :metadata/metric metric)
  (lib.metadata/bulk-metadata metadata-providerable :metadata/measure measure)
  (lib.metadata/bulk-metadata metadata-providerable :metadata/segment segment)
  (lib.metadata/bulk-metadata metadata-providerable :metadata/snippet snippet))
