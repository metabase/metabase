(ns metabase.lib.metadata.call-track-provider
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(defn- update-tracker-and-call-next-provider!
  [tracker metadata-type item-id metadata-provider]
  (swap! tracker update metadata-type (fn [item-ids]
                                        (if (seq item-ids)
                                          (conj item-ids item-id)
                                          #{item-id})))
  ((case metadata-type
     :metadata/database
     lib.metadata.protocols/database
     :metadata/field
     lib.metadata.protocols/field
     :metadata/card
     lib.metadata.protocols/card
     :metadata/table
     lib.metadata.protocols/table
     :metadata/legacy-metric
     lib.metadata.protocols/legacy-metric
     :metadata/legacy-metrics
     lib.metadata.protocols/legacy-metrics
     :metadata/segment
     lib.metadata.protocols/segment
     :metadata/fields
     lib.metadata.protocols/fields)
   metadata-provider
   item-id))

(deftype CallTrackMetadataProvider [tracker metadata-provider]
  lib.metadata.protocols/MetadataProvider
  (database      [_this]             (lib.metadata.protocols/database metadata-provider))
  (table         [_this table-id]    (update-tracker-and-call-next-provider! tracker :metadata/table table-id metadata-provider))
  (field         [_this field-id]    (update-tracker-and-call-next-provider! tracker :metadata/field field-id metadata-provider))
  (card          [_this card-id]     (update-tracker-and-call-next-provider! tracker :metadata/card card-id metadata-provider))

  (legacy-metric [_this metric-id]   (update-tracker-and-call-next-provider! tracker :metadata/legacy-metric metric-id metadata-provider))
  (segment       [_this segment-id]  (update-tracker-and-call-next-provider! tracker :metadata/segment segment-id metadata-provider))
  (tables        [_this]             (lib.metadata.protocols/tables metadata-provider))
  (fields        [_this table-id]    (update-tracker-and-call-next-provider! tracker :metadata/fields table-id metadata-provider))
  (legacy-metrics [_this table-id]   (update-tracker-and-call-next-provider! tracker :metadata/legacy-metrics table-id metadata-provider))
  (setting [_this setting-name]      (update-tracker-and-call-next-provider! tracker :metadata/setting setting-name metadata-provider))

  lib.metadata.protocols/CallTrackMetadataProvider
  (called-ids [_this metadata-type]
    (get @tracker metadata-type)))

(defn call-track-metadadata-provider
  [metadata-provider]
  (->CallTrackMetadataProvider (atom {}) metadata-provider))
