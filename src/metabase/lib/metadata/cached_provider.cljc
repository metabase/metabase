(ns metabase.lib.metadata.cached-provider
  (:require
   #?@(:clj ([pretty.core :as pretty]))
   [clojure.set :as set]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

#?(:clj (set! *warn-on-reflection* true))

(defn- get-in-cache [cache ks]
  (when-some [cached-value (get-in @cache ks)]
    (when-not (= cached-value ::nil)
      cached-value)))

(defn- store-in-cache! [cache ks value]
  (let [value (if (some? value) value ::nil)]
    (swap! cache assoc-in ks value)
    (when-not (= value ::nil)
      value)))

(mu/defn- store-metadata!
  [cache
   metadata-type :- ::lib.schema.metadata/type
   id            :- pos-int?
   metadata      :- [:multi
                     {:dispatch :lib/type}
                     [:metadata/database      ::lib.schema.metadata/database]
                     [:metadata/table         ::lib.schema.metadata/table]
                     [:metadata/column        ::lib.schema.metadata/column]
                     [:metadata/card          ::lib.schema.metadata/card]
                     [:metadata/metric        ::lib.schema.metadata/metric]
                     [:metadata/segment       ::lib.schema.metadata/segment]]]
  (let [metadata (-> metadata
                     (update-keys u/->kebab-case-en)
                     (assoc :lib/type metadata-type))]
    (store-in-cache! cache [metadata-type id] metadata))
  true)

(defn- get-in-cache-or-fetch [cache ks fetch-thunk]
  (if-some [cached-value (get-in @cache ks)]
    (when-not (= cached-value ::nil)
      cached-value)
    (store-in-cache! cache ks (fetch-thunk))))

(defn- cached-value [cache k not-found]
  (get @cache [::cached-value k] not-found))

(defn- cache-value! [cache k v]
  (swap! cache assoc [::cached-value k] v)
  nil)

(defn- database [cache metadata-provider]
  (get-in-cache-or-fetch cache [:metadata/database] #(lib.metadata.protocols/database metadata-provider)))

(defn- metadatas [inner-fn key cache uncached-provider metadata-type values]
  (when (seq values)
    (log/tracef "Getting %s metadata with Values %s" metadata-type (pr-str (sort values)))
    (let [metadata-cache (get @cache metadata-type)]
      (when-not (every? #(contains? metadata-cache %) values)
        (let [existing-values (set (keys metadata-cache))
              missing-values  (set/difference (set values) existing-values)]
          (log/tracef "Already fetched %s: %s" metadata-type (pr-str (sort (set/intersection (set values) existing-values))))
          (when (seq missing-values)
            (log/tracef "Need to fetch %s: %s" metadata-type (pr-str (sort missing-values)))
            (let [fetched-metadatas (inner-fn uncached-provider metadata-type missing-values)
                  fetched-values       (map key fetched-metadatas)
                  unfetched-values     (set/difference (set missing-values) (set fetched-values))]
              (when (seq fetched-values)
                (log/tracef "Fetched %s: %s" metadata-type (pr-str (sort fetched-values)))
                (doseq [instance fetched-metadatas]
                  (store-in-cache! cache [metadata-type (key instance)] instance)))
              (when (seq unfetched-values)
                (log/tracef "Failed to fetch %s: %s" metadata-type (pr-str (sort unfetched-values)))
                (doseq [unfetched-id unfetched-values]
                  (store-in-cache! cache [metadata-type unfetched-id] ::nil))))))))
    (into []
          (keep (fn [value]
                  (get-in-cache cache [metadata-type value])))
          values)))

(defn- cached-metadatas [cache metadata-type metadata-ids]
  (into []
        (keep (fn [id]
                (get-in-cache cache [metadata-type id])))
        metadata-ids))

(defn- tables [metadata-provider cache]
  (let [fetched-tables (lib.metadata.protocols/tables metadata-provider)]
    (doseq [table fetched-tables]
      (store-in-cache! cache [:metadata/table (:id table)] table))
    fetched-tables))

(defn- metadatas-for-table [metadata-provider cache metadata-type table-id]
  (let [k     (case metadata-type
                :metadata/column  ::table-fields
                :metadata/metric  ::table-metrics
                :metadata/segment ::table-segments)
        thunk (fn []
                (let [objects (lib.metadata.protocols/metadatas-for-table metadata-provider metadata-type table-id)]
                  (doseq [metadata objects]
                    (store-in-cache! cache [(:lib/type metadata) (:id metadata)] metadata))
                  objects))]
    (get-in-cache-or-fetch cache [k table-id] thunk)))

(defn- metadatas-for-card [metadata-provider cache metadata-type card-id]
  (let [k     (case metadata-type
                :metadata/metric ::table-metrics)
        thunk (fn []
                (let [objects (lib.metadata.protocols/metadatas-for-card metadata-provider metadata-type card-id)]
                  (doseq [metadata objects]
                    (store-in-cache! cache [(:lib/type metadata) (:id metadata)] metadata))
                  objects))]
    (get-in-cache-or-fetch cache [k card-id] thunk)))

(defn- setting [metadata-provider cache setting-key]
  (get-in-cache-or-fetch cache [::setting (keyword setting-key)] #(lib.metadata.protocols/setting metadata-provider setting-key)))

;;; wraps another metadata provider and caches results. Allows warming the cache before use.
(deftype CachedProxyMetadataProvider [cache metadata-provider]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (database cache metadata-provider))
  (metadatas [_this metadata-type ids]
    (metadatas lib.metadata.protocols/metadatas :id cache metadata-provider metadata-type ids))
  (metadatas-for-names [_this metadata-type names]
    (metadatas lib.metadata.protocols/metadatas-for-names :name cache metadata-provider metadata-type names))
  (tables [_this]
    (get-in-cache-or-fetch cache [::database-tables] #(tables metadata-provider cache)))
  (metadatas-for-table [_this metadata-type table-id]
    (metadatas-for-table metadata-provider cache metadata-type table-id))
  (metadatas-for-card [_this metadata-type card-id]
    (metadatas-for-card metadata-provider cache metadata-type card-id))
  (setting [_this setting-key]
    (setting metadata-provider cache setting-key))

  lib.metadata.protocols/CachedMetadataProvider
  (cached-metadatas [_this metadata-type metadata-ids]
    (cached-metadatas cache metadata-type metadata-ids))
  (store-metadata! [_this a-metadata]
    (store-metadata! cache (:lib/type a-metadata) (:id a-metadata) a-metadata))
  (cached-value [_this k not-found]
    (cached-value cache k not-found))
  (cache-value! [_this k v]
    (cache-value! cache k v))
  (has-cache? [_this]
    true)

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? CachedProxyMetadataProvider another)
         (= metadata-provider
            (.-metadata-provider ^CachedProxyMetadataProvider another))))

  #?@(:clj
      [pretty/PrettyPrintable
       (pretty [_this]
               (list `cached-metadata-provider metadata-provider))]))

(defn cached-metadata-provider
  "Wrap `metadata-provider` with an implementation that automatically caches results."
  ^CachedProxyMetadataProvider [metadata-provider]
  (log/debugf "Wrapping %s in CachedProxyMetadataProvider" (pr-str metadata-provider))
  (->CachedProxyMetadataProvider (atom {}) metadata-provider))
