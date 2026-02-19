(ns metabase.lib.metadata.cached-provider
  (:refer-clojure :exclude [update-keys get-in #?(:clj doseq)])
  (:require
   #?@(:clj ([metabase.util.json :as json]
             [pretty.core :as pretty]))
   [clojure.set :as set]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [update-keys get-in #?(:clj doseq)]]))

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
                     [:metadata/database             ::lib.schema.metadata/database]
                     [:metadata/table                ::lib.schema.metadata/table]
                     [:metadata/column               ::lib.schema.metadata/column]
                     [:metadata/card                 ::lib.schema.metadata/card]
                     [:metadata/measure              ::lib.schema.metadata/measure]
                     [:metadata/metric               ::lib.schema.metadata/metric]
                     [:metadata/segment              ::lib.schema.metadata/segment]
                     [:metadata/native-query-snippet ::lib.schema.metadata/native-query-snippet]]]
  (let [metadata (-> metadata
                     (update-keys u/->kebab-case-en)
                     (assoc :lib/type metadata-type))]
    (store-in-cache! cache [metadata-type :id id] metadata))
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

;; cache key used by this function has the shape [<metadata-type> <id-or-name>]
(defn- metadatas-by-id-or-name
  [cache uncached-provider {metadata-type :lib/type, id-set :id, name-set :name, :as metadata-spec}]
  (let [[col-name key-set] (cond
                             id-set   [:id id-set]
                             name-set [:name name-set])
        cache-key          (fn [col-name k]
                             (case col-name
                               :id   [metadata-type :id k]
                               ;; e.g. `[:metadata/column :name {:table-id 1} "CREATED_AT"]`
                               :name [metadata-type :name (dissoc metadata-spec :lib/type :id :name) k]))]
    (log/tracef "Getting %s metadata with %s IN %s" metadata-type col-name (pr-str (sort key-set)))
    (let [existing-keys (into #{}
                              (let [cache* @cache]
                                ;; [[get-in]] instead of [[get-in-cache]] because we don't want to filter out the
                                ;; `::nil` tombstones. Also a little faster to only deref the atom once instead of for
                                ;; each ID/name
                                (filter #(get-in cache* (cache-key col-name %))))
                              key-set)
          missing-keys (set/difference (set key-set) existing-keys)]
      (log/tracef "Already fetched %s: %s" metadata-type (pr-str (sort (set/intersection (set key-set) existing-keys))))
      (when (seq missing-keys)
        (log/tracef "Need to fetch %s: %s" metadata-type (pr-str (sort missing-keys)))
        (let [newly-fetched-metadatas (lib.metadata.protocols/metadatas uncached-provider (assoc metadata-spec col-name missing-keys))
              newly-fetched-keys      (map col-name newly-fetched-metadatas)
              unfetched-keys          (set/difference (set missing-keys) (set newly-fetched-keys))]
          (when (seq newly-fetched-keys)
            (log/tracef "Fetched %s: %s" metadata-type (pr-str (sort newly-fetched-keys)))
            (doseq [metadata newly-fetched-metadatas
                    ;; store the object under both its `:id` and its `:name`
                    col-name [:id :name]
                    :let     [newly-fetched-key (col-name metadata)]]
              (store-in-cache! cache (cache-key col-name newly-fetched-key) metadata)))
          (when (seq unfetched-keys)
            (log/tracef "Failed to fetch %s: %s" metadata-type (pr-str (sort unfetched-keys)))
            (doseq [unfetched-key unfetched-keys]
              (store-in-cache! cache (cache-key col-name unfetched-key) ::nil))))))
    (into []
          (comp (keep (fn [k]
                        (get-in-cache cache (cache-key col-name k))))
                (lib.metadata.protocols/default-spec-filter-xform metadata-spec))
          key-set)))

(mu/defn- metadatas
  [cache uncached-provider {metadata-type :lib/type, id-set :id, name-set :name, :as metadata-spec} :- ::lib.metadata.protocols/metadata-spec]
  (if (or id-set name-set)
    (metadatas-by-id-or-name cache uncached-provider metadata-spec)
    (get-in-cache-or-fetch cache
                           [::spec metadata-spec]
                           (fn []
                             (u/prog1 (lib.metadata.protocols/metadatas uncached-provider metadata-spec)
                               (doseq [metadata <>
                                       k        [:id :name]]
                                 (store-in-cache! cache [metadata-type k (k metadata)] metadata)))))))

(defn- cached-metadatas [cache metadata-type metadata-ids]
  (into []
        (keep (fn [id]
                (get-in-cache cache [metadata-type :id id])))
        metadata-ids))

(defn- setting [metadata-provider cache setting-key]
  (get-in-cache-or-fetch cache [::setting (keyword setting-key)] #(lib.metadata.protocols/setting metadata-provider setting-key)))

;;; wraps another metadata provider and caches results. Allows warming the cache before use.
(deftype CachedProxyMetadataProvider [cache metadata-provider]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (database cache metadata-provider))
  (metadatas [_this metadata-spec]
    (metadatas cache metadata-provider metadata-spec))
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
  (clear-cache! [_this]
    (reset! cache {})
    nil)

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

#?(:clj
   ;; do not encode MetadataProviders to JSON, just generate `nil` instead.
   (json/add-encoder
    CachedProxyMetadataProvider
    (fn [_mp json-generator]
      (json/generate-nil nil json-generator))))
