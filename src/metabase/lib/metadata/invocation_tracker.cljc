(ns metabase.lib.metadata.invocation-tracker
  (:require
   #?@(:clj
       (^{:clj-kondo/ignore [:discouraged-namespace]} [clj-yaml.core]
        [metabase.util.json :as json]
        [pretty.core :as pretty]))
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

;;; TODO (Cam 9/10/25) -- we're missing stuff here like handling when we fetch by name. When we added support for
;;; fetching metadata by name in #62283 we never added it.
(defn- track-spec! [tracker {metadata-type :lib/type, id-set :id, :keys [table-id card-id], :as _metadata-spec}]
  (cond
    id-set
    (track-ids! tracker metadata-type id-set)

    table-id
    (let [tracking-type (case metadata-type
                          :metadata/column  ::table-fields
                          :metadata/measure ::table-measures
                          :metadata/metric  ::table-metrics
                          :metadata/segment ::table-segments)]
      (track-ids! tracker tracking-type [table-id]))

    card-id
    (let [tracking-type (case metadata-type
                          :metadata/metric ::card-metrics)]
      (track-ids! tracker tracking-type [card-id]))))

(defn- metadatas
  [tracker metadata-provider metadata-spec]
  (track-spec! tracker metadata-spec)
  (lib.metadata.protocols/metadatas metadata-provider metadata-spec))

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
  (metadatas [_this metadata-spec]
    (metadatas tracker metadata-provider metadata-spec))
  (setting [_this setting-key]
    (setting tracker metadata-provider setting-key))

  lib.metadata.protocols/CachedMetadataProvider
  (cached-metadatas [_this metadata-type ids]
    (when (lib.metadata.protocols/cached-metadata-provider? metadata-provider)
      (lib.metadata.protocols/cached-metadatas metadata-provider metadata-type ids)))
  (store-metadata! [_this object]
    (when (lib.metadata.protocols/cached-metadata-provider? metadata-provider)
      (lib.metadata.protocols/store-metadata! metadata-provider object)))
  (cached-value [_this k not-found]
    (if (lib.metadata.protocols/cached-metadata-provider? metadata-provider)
      (lib.metadata.protocols/cached-value metadata-provider k not-found)
      not-found))
  (cache-value! [_this k v]
    (when (lib.metadata.protocols/cached-metadata-provider? metadata-provider)
      (lib.metadata.protocols/cache-value! metadata-provider k v)))
  (has-cache? [_this]
    (when (lib.metadata.protocols/cached-metadata-provider? metadata-provider)
      (lib.metadata.protocols/has-cache? metadata-provider)))
  (clear-cache! [_this]
    (when (lib.metadata.protocols/cached-metadata-provider? metadata-provider)
      (lib.metadata.protocols/clear-cache! metadata-provider)))

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

#?(:clj
   ;; do not encode MetadataProviders to JSON, just generate `nil` instead.
   (json/add-encoder
    InvocationTracker
    (fn [_mp json-generator]
      (json/generate-nil nil json-generator))))

;;; this is here as a sanity check to make sure we're not trying to write MBQL 5 to SerDes yet until we update the
;;; SerDes code to handle it
#?(:clj
   (extend-protocol clj-yaml.core/YAMLCodec
     InvocationTracker
     (encode [_this]
       (throw (Exception. "Encoding MBQL 5 queries to YAML for SerDes is not yet supported; please convert the query to legacy first.")))))
