(ns metabase.lib.metadata.invocation-tracker
  (:require
   #?(:clj [pretty.core :as pretty])
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(def ^:private ^:dynamic *to-track-metadata-types*
  "Set of metadata types to track.
  Currently only `:metadata/card` is tracked for updating report_card.last_used_at.
  See [[metabase.query-processor.middleware.update-used-cards/update-used-cards!]].

  Making this dynamic for testing purposes."
  #{:metadata/card})

(defn- track-ids! [tracker metadata-type ids]
  ;; we only have usage for metadata/card for now, so we only track it to save some overhead
  (when (contains? *to-track-metadata-types* metadata-type)
    (swap! tracker update metadata-type (fn [item-ids]
                                          (into (vec item-ids) ids)))))

(defn- metadatas [tracker metadata-provider metadata-type ids]
  (track-ids! tracker metadata-type ids)
  (lib.metadata.protocols/metadatas metadata-provider metadata-type ids))

(defn- metadatas-for-table [tracker metadata-provider metadata-type table-id]
  (let [tracking-type (case metadata-type
                        :metadata/column        ::table-fields
                        :metadata/metric        ::table-metrics
                        :metadata/segment       ::table-segments)]
    (track-ids! tracker tracking-type [table-id]))
  (lib.metadata.protocols/metadatas-for-table metadata-provider metadata-type table-id))

(defn- metadatas-for-card [tracker metadata-provider metadata-type card-id]
  (let [tracking-type (case metadata-type
                        :metadata/metric        ::card-metrics)]
    (track-ids! tracker tracking-type [card-id]))
  (lib.metadata.protocols/metadatas-for-card metadata-provider metadata-type card-id))

(defn- setting [tracker metadata-provider setting-key]
  (track-ids! tracker ::setting [setting-key])
  (lib.metadata.protocols/setting metadata-provider setting-key))

(deftype InvocationTracker [tracker metadata-provider]
  lib.metadata.protocols/InvocationTracker
  (invoked-ids [_this metadata-type]
    (get @tracker metadata-type))

  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (lib.metadata.protocols/database metadata-provider))
  (metadatas [_this metadata-type ids]
    (metadatas tracker metadata-provider metadata-type ids))
  (tables [_this]
    (lib.metadata.protocols/tables metadata-provider))
  (metadatas-for-table [_this metadata-type table-id]
    (metadatas-for-table tracker metadata-provider metadata-type table-id))
  (metadatas-for-card [_this metadata-type card-id]
    (metadatas-for-card tracker metadata-provider metadata-type card-id))
  (setting [_this setting-key]
    (setting tracker metadata-provider setting-key))

  lib.metadata.protocols/CachedMetadataProvider
  (cached-metadatas [_this metadata-type ids]
    (lib.metadata.protocols/cached-metadatas metadata-provider metadata-type ids))
  (store-metadata! [_this object]
    (lib.metadata.protocols/store-metadata! metadata-provider object))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? InvocationTracker another)
         (= metadata-provider (.metadata-provider ^InvocationTracker another))))

  #?@(:clj
      [pretty/PrettyPrintable
       (pretty [_this]
         (list `invocation-tracker-provider metadata-provider))]))

(defn invocation-tracker-provider
  "Wraps `metadata-provider` with a provider that records all invoked ids of [[lib.metadata.protocols/MetadataProvider]] methods."
  [metadata-provider]
  (->InvocationTracker (atom {}) metadata-provider))
