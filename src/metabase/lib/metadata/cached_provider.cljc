(ns metabase.lib.metadata.cached-provider
  (:require
   [clojure.set :as set]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
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

(defn- database [cache metadata-provider]
  (get-in-cache-or-fetch cache [:metadata/database] #(lib.metadata.protocols/database metadata-provider)))

(defn- metadatas [cache uncached-provider metadata-type ids]
  (when (seq ids)
    (log/tracef "Getting %s metadata with IDs %s" metadata-type (pr-str (sort ids)))
    (let [metadata-cache (get @cache metadata-type)]
      (when-not (every? #(contains? metadata-cache %) ids)
        (let [existing-ids (set (keys metadata-cache))
              missing-ids  (set/difference (set ids) existing-ids)]
          (log/tracef "Already fetched %s: %s" metadata-type (pr-str (sort (set/intersection (set ids) existing-ids))))
          (when (seq missing-ids)
            (log/tracef "Need to fetch %s: %s" metadata-type (pr-str (sort missing-ids)))
            ;; TODO -- we should probably store `::nil` markers for things we tried to fetch that didn't exist
            (doseq [instance (lib.metadata.protocols/metadatas uncached-provider metadata-type missing-ids)]
              (store-in-cache! cache [metadata-type (:id instance)] instance))))))
    (into []
          (keep (fn [id]
                  (get-in-cache cache [metadata-type id])))
          ids)))

(defn- cached-metadatas [cache metadata-type metadata-ids]
  (into []
        (keep (fn [id]
                (get-in-cache cache [metadata-type id])))
        metadata-ids))

(defn- tables [metadata-provider cache]
  (let [fetched-tables #(lib.metadata.protocols/tables metadata-provider)]
    (doseq [table fetched-tables]
      (store-in-cache! cache [:metadata/table (:id table)] table))
    fetched-tables))

(defn- metadatas-for-table [metadata-provider cache metadata-type table-id]
  (let [k     (case metadata-type
                :metadata/column        ::table-fields
                :metadata/metric        ::table-metrics
                :metadata/segment       ::table-segments)
        thunk (fn []
                (let [objects (lib.metadata.protocols/metadatas-for-table metadata-provider metadata-type table-id)]
                  (doseq [metadata objects]
                    (store-in-cache! cache [(:lib/type metadata) (:id metadata)] metadata))
                  objects))]
    (get-in-cache-or-fetch cache [k table-id] thunk)))

(defn- metadatas-for-card [metadata-provider cache metadata-type card-id]
  (let [k     (case metadata-type
                :metadata/metric        ::table-metrics)
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
    (metadatas cache metadata-provider metadata-type ids))
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
  (->CachedProxyMetadataProvider (atom {}) metadata-provider))
