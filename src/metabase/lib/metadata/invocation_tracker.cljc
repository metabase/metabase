(ns metabase.lib.metadata.invocation-tracker
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(def ^:private ^:dynamic *to-track-metadata-types*
  "Set of metadata types to track.
  Currently only `:metadata/card` is tracked for updating report_card.last_used_at.
  See [[metabase.query-processor.middleware.update-used-cards/update-used-cards!]].

  Making this dynamic for testing purposes."
  #{:metadata/card})

(defn- update-tracker-and-call-next-provider!
  [tracker metadata-provider metadata-type id]
  ;; we only have usage for metadata/card for now, so we only track it to save some overhead
  (when (*to-track-metadata-types* metadata-type)
    (swap! tracker update metadata-type (fn [item-ids]
                                          (if (seq item-ids)
                                            (conj item-ids id)
                                            [id]))))
  ((case metadata-type
     :metadata/database
     lib.metadata.protocols/database
     :metadata/table
     lib.metadata.protocols/table
     :metadata/column
     lib.metadata.protocols/field
     :metadata/card
     lib.metadata.protocols/card
     :metadata/legacy-metric
     lib.metadata.protocols/legacy-metric
     :metadata/legacy-metrics
     lib.metadata.protocols/legacy-metrics
     :metadata/segment
     lib.metadata.protocols/segment
     :metadata/fields
     lib.metadata.protocols/fields
     :metadata/setting
     lib.metadata.protocols/setting)
   metadata-provider
   id))

(deftype InvocationTracker [tracker metadata-provider]
 lib.metadata.protocols/InvocationTracker
  (invoked-ids [_this metadata-type]
    (get @tracker metadata-type))

  lib.metadata.protocols/MetadataProvider
  (database       [_this]              (lib.metadata.protocols/database metadata-provider))
  (table          [_this table-id]     (update-tracker-and-call-next-provider! tracker metadata-provider :metadata/table table-id))
  (field          [_this field-id]     (update-tracker-and-call-next-provider! tracker metadata-provider :metadata/column field-id))
  (card           [_this card-id]      (update-tracker-and-call-next-provider! tracker metadata-provider :metadata/card card-id))

  (legacy-metric  [_this metric-id]    (update-tracker-and-call-next-provider! tracker metadata-provider :metadata/legacy-metric metric-id))
  (segment        [_this segment-id]   (update-tracker-and-call-next-provider! tracker metadata-provider :metadata/segment segment-id))
  (tables         [_this]              (lib.metadata.protocols/tables metadata-provider))
  (fields         [_this table-id]     (update-tracker-and-call-next-provider! tracker metadata-provider :metadata/fields table-id))
  (legacy-metrics [_this table-id]     (update-tracker-and-call-next-provider! tracker metadata-provider :metadata/legacy-metrics table-id))
  (setting        [_this setting-name] (update-tracker-and-call-next-provider! tracker metadata-provider :metadata/setting setting-name))

  lib.metadata.protocols/CachedMetadataProvider
  (cached-database [_this]                           (lib.metadata.protocols/cached-database metadata-provider))
  (cached-metadata [_this metadata-type id]          (lib.metadata.protocols/cached-metadata metadata-provider metadata-type id))
  (store-database! [_this database-metadata]         (lib.metadata.protocols/store-database! metadata-provider database-metadata))
  (store-metadata! [_this metadata-type id metadata] (lib.metadata.protocols/store-metadata! metadata-provider metadata-type id metadata))


  lib.metadata.protocols/BulkMetadataProvider
  (bulk-metadata [_this metadata-type ids] (lib.metadata.protocols/bulk-metadata metadata-provider metadata-type ids))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [this another]
    (and (instance? InvocationTracker another)
         (= (lib.metadata.protocols/database this)
            (lib.metadata.protocols/database another)))))

(defn invocation-tracker-provider
  "Wraps `metadata-provider` with a provider that records all invoked ids of [[lib.metadata.protocols/MetadataProvider]] methods."
  [metadata-provider]
  (->InvocationTracker (atom {}) metadata-provider))
