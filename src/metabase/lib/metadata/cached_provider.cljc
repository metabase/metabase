(ns metabase.lib.metadata.cached-provider
  (:require
   [clojure.set :as set]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   #?@(:clj ([pretty.core :as pretty]))))

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

(mu/defn ^:private store-database!
  [cache
   database-metadata :- lib.metadata/DatabaseMetadata]
  (let [database-metadata (-> database-metadata
                              (update-keys u/->kebab-case-en)
                              (assoc :lib/type :metadata/database))]
    (store-in-cache! cache [:metadata/database] database-metadata)))

(mu/defn ^:private store-metadata!
  [cache
   metadata-type :- [:enum :metadata/database :metadata/table :metadata/column :metadata/card :metadata/metric :metadata/segment]
   id            :- ::lib.schema.common/positive-int
   metadata      :- [:multi
                     {:dispatch :lib/type}
                     [:metadata/database lib.metadata/DatabaseMetadata]
                     [:metadata/table    lib.metadata/TableMetadata]
                     [:metadata/column   lib.metadata/ColumnMetadata]
                     [:metadata/card     ::lib.schema.metadata/card]
                     [:metadata/metric   lib.metadata/LegacyMetricMetadata]
                     [:metadata/segment  lib.metadata/SegmentMetadata]]]
  (let [metadata (-> metadata
                     (update-keys u/->kebab-case-en)
                     (assoc :lib/type metadata-type))]
    (store-in-cache! cache [metadata-type id] metadata)))

(defn- get-in-cache-or-fetch [cache ks fetch-thunk]
  (if-some [cached-value (get-in @cache ks)]
    (when-not (= cached-value ::nil)
      cached-value)
    (store-in-cache! cache ks (fetch-thunk))))

(defn- bulk-metadata [cache uncached-provider metadata-type ids]
  (when (seq ids)
    (log/debugf "Getting %s metadata with IDs %s" metadata-type (pr-str (sort ids)))
    (let [existing-ids (set (keys (get @cache metadata-type)))
          missing-ids  (set/difference (set ids) existing-ids)]
      (log/debugf "Already fetched %s: %s" metadata-type (pr-str (sort (set/intersection (set ids) existing-ids))))
      (when (seq missing-ids)
        (log/debugf "Need to fetch %s: %s" metadata-type (pr-str (sort missing-ids)))
        ;; TODO -- we should probably store `::nil` markers for things we tried to fetch that didn't exist
        (doseq [instance (lib.metadata.protocols/bulk-metadata uncached-provider metadata-type missing-ids)]
          (store-in-cache! cache [metadata-type (:id instance)] instance))))
    (for [id ids]
      (get-in-cache cache [metadata-type id]))))

(defn- tables [metadata-provider cache]
  (let [fetched-tables #(lib.metadata.protocols/tables metadata-provider)]
    (doseq [table fetched-tables]
      (store-in-cache! cache [:metadata/table (:id table)] table))
    fetched-tables))

(defn- fields [metadata-provider cache table-id]
  (let [fetched-fields (lib.metadata.protocols/fields metadata-provider table-id)]
    (doseq [field fetched-fields]
      (store-in-cache! cache [:metadata/column (:id field)] field))
    fetched-fields))

(defn- metrics [metadata-provider cache table-id]
  (let [fetched-metrics (lib.metadata.protocols/metrics metadata-provider table-id)]
    (doseq [metric fetched-metrics]
      (store-in-cache! cache [:metadata/metric (:id metric)] metric))
    fetched-metrics))

;;; wraps another metadata provider and caches results. Implements
;;; the [[lib.metadata.protocols/CachedMetadataProvider]] protocol which allows warming the cache before use.
(deftype CachedProxyMetadataProvider [cache metadata-provider]
  lib.metadata.protocols/MetadataProvider
  (database [_this]            (get-in-cache-or-fetch cache [:metadata/database]            #(lib.metadata.protocols/database metadata-provider)))
  (table    [_this table-id]   (get-in-cache-or-fetch cache [:metadata/table table-id]      #(lib.metadata.protocols/table    metadata-provider table-id)))
  (field    [_this field-id]   (get-in-cache-or-fetch cache [:metadata/column field-id]     #(lib.metadata.protocols/field    metadata-provider field-id)))
  (card     [_this card-id]    (get-in-cache-or-fetch cache [:metadata/card card-id]        #(lib.metadata.protocols/card     metadata-provider card-id)))
  (metric   [_this metric-id]  (get-in-cache-or-fetch cache [:metadata/metric metric-id]    #(lib.metadata.protocols/metric   metadata-provider metric-id)))
  (segment  [_this segment-id] (get-in-cache-or-fetch cache [:metadata/segment segment-id]  #(lib.metadata.protocols/segment  metadata-provider segment-id)))
  (tables   [_this]            (get-in-cache-or-fetch cache [::database-tables]             #(tables metadata-provider cache)))
  (fields   [_this table-id]   (get-in-cache-or-fetch cache [::table-fields table-id]       #(fields metadata-provider cache table-id)))
  (metrics  [_this table-id]   (get-in-cache-or-fetch cache [::table-metrics table-id]      #(metrics metadata-provider cache table-id)))
  (setting  [_this setting]    (lib.metadata.protocols/setting metadata-provider setting))

  lib.metadata.protocols/CachedMetadataProvider
  (cached-database [_this]                           (get-in-cache    cache [:metadata/database]))
  (cached-metadata [_this metadata-type id]          (get-in-cache    cache [metadata-type id]))
  (store-database! [_this database-metadata]         (store-database! cache database-metadata))
  (store-metadata! [_this metadata-type id metadata] (store-metadata! cache metadata-type id metadata))

  ;; these only work if the underlying metadata provider is also a [[BulkMetadataProvider]].
  lib.metadata.protocols/BulkMetadataProvider
  (bulk-metadata [_this metadata-type ids]
    (bulk-metadata cache metadata-provider metadata-type ids))

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
  "Wrap `metadata-provider` with an implementation that automatically caches results.

  If the metadata provider implements [[lib.metadata.protocols/BulkMetadataProvider]],
  then [[lib.metadata.protocols/bulk-metadata]] will work as expected; it can be done for side-effects as well."
  ^CachedProxyMetadataProvider [metadata-provider]
  (->CachedProxyMetadataProvider (atom {}) metadata-provider))
