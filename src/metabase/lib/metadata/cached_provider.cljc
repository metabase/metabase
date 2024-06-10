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

(mu/defn ^:private store-metadata!
  [cache
   metadata-type :- ::lib.schema.metadata/type
   id            :- pos-int?
   metadata      :- [:multi
                     {:dispatch :lib/type}
                     [:metadata/database      ::lib.schema.metadata/database]
                     [:metadata/table         ::lib.schema.metadata/table]
                     [:metadata/column        ::lib.schema.metadata/column]
                     [:metadata/card          ::lib.schema.metadata/card]
                     [:metadata/legacy-metric ::lib.schema.metadata/legacy-metric]
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
    (log/debugf "Getting %s metadata with IDs %s" metadata-type (pr-str (sort ids)))
    (let [existing-ids (set (keys (get @cache metadata-type)))
          missing-ids  (set/difference (set ids) existing-ids)]
      (log/debugf "Already fetched %s: %s" metadata-type (pr-str (sort (set/intersection (set ids) existing-ids))))
      (when (seq missing-ids)
        (log/debugf "Need to fetch %s: %s" metadata-type (pr-str (sort missing-ids)))
        ;; TODO -- we should probably store `::nil` markers for things we tried to fetch that didn't exist
        (doseq [instance (lib.metadata.protocols/metadatas uncached-provider metadata-type missing-ids)]
          (store-in-cache! cache [metadata-type (:id instance)] instance))))
    (into []
          (comp (map (fn [id]
                       (get-in-cache cache [metadata-type id])))
                (filter some?))
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
                :metadata/legacy-metric ::table-legacy-metrics
                :metadata/segment       ::table-segments)
        thunk (fn []
                (let [objects (lib.metadata.protocols/metadatas-for-table metadata-provider metadata-type table-id)]
                  (doseq [metadata objects]
                    (store-in-cache! cache [(:lib/type metadata) (:id metadata)] metadata))
                  objects))]
    (get-in-cache-or-fetch cache [k table-id] thunk)))

(defn- metadatas-for-tables [metadata-provider cache metadata-type table-ids]
  (let [k        (case metadata-type
                   :metadata/column  ::table-fields
                   :metadata/legacy-metric  ::table-metrics
                   :metadata/segment ::table-segments)
        uncached (filter #(nil? (get-in-cache cache [k %])) table-ids)
        objects  (lib.metadata.protocols/metadatas-for-tables metadata-provider metadata-type uncached)]
    (doseq [metadata objects]
      (store-in-cache! cache [(:lib/type metadata) (:id metadata)] metadata))
    (doseq [[table-id table-metadatas] (group-by :table-id objects)]
      (store-in-cache! cache [k table-id] table-metadatas))
    (mapcat #(get-in-cache cache [k %]) table-ids)))

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
  (metadatas-for-tables [_this metadata-type table-ids]
    (metadatas-for-tables metadata-provider cache metadata-type table-ids))
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
