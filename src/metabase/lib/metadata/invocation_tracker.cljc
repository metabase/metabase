(ns metabase.lib.metadata.invocation-tracker
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(defn- update-tracker-and-return-nil!
  [tracker metadata-type id]
  ;; we only have usage for metadata/card for now, so we only track it to save some overhead
  (when (#{:metadata/card} metadata-type)
    (swap! tracker update metadata-type (fn [item-ids]
                                          (if (seq item-ids)
                                            (conj item-ids id)
                                            [id]))))
  nil)

(deftype InvocationTracker [tracker]
  lib.metadata.protocols/MetadataProvider
  (database       [_this]              nil)
  (table          [_this table-id]     (update-tracker-and-return-nil! tracker :metadata/table table-id))
  (field          [_this field-id]     (update-tracker-and-return-nil! tracker :metadata/field field-id))
  (card           [_this card-id]      (update-tracker-and-return-nil! tracker :metadata/card card-id))

  (legacy-metric  [_this metric-id]    (update-tracker-and-return-nil! tracker :metadata/legacy-metric metric-id))
  (segment        [_this segment-id]   (update-tracker-and-return-nil! tracker :metadata/segment segment-id))
  (tables         [_this]              nil)
  (fields         [_this table-id]     (update-tracker-and-return-nil! tracker :metadata/fields table-id))
  (legacy-metrics [_this table-id]     (update-tracker-and-return-nil! tracker :metadata/legacy-metrics table-id))
  (setting        [_this setting-name] (update-tracker-and-return-nil! tracker :metadata/setting setting-name))

  lib.metadata.protocols/InvocationTracker
  (invoked-ids [_this metadata-type]
    (get @tracker metadata-type))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? InvocationTracker another)
         (= @tracker
            @(.-tracker ^InvocationTracker another)))))

(defn invocation-tracker-provider
  "Returns a metadata provider that tracks the ids of metadata items that have been invoked.
  All methods will return nil so it can be composed.

  Currently only track invocation of metadata/card."
  []
  (->InvocationTracker (atom {})))
