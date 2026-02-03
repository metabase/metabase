(ns metabase.lib.metadata.composed-provider
  (:refer-clojure :exclude [empty? not-empty run! some])
  (:require
   #?(:clj [pretty.core :as pretty])
   [better-cond.core :as b]
   [clojure.core.protocols]
   [clojure.datafy :as datafy]
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [empty? not-empty run! some]]))

(mu/defn- cached-providers :- [:sequential ::metadata.protocols/cached-metadata-provider]
  [providers :- [:maybe [:sequential ::metadata.protocols/metadata-provider]]]
  (filter metadata.protocols/cached-metadata-provider? providers))

(defn- invocation-tracker-providers [providers]
  (filter #(satisfies? metadata.protocols/InvocationTracker %)
          providers))

(defn- metadatas* [providers k unfetched-keys f]
  (loop [[provider & more-providers] providers, unfetched-keys (set unfetched-keys), fetched []]
    (cond
      (empty? unfetched-keys)
      fetched

      (not provider)
      fetched

      :else
      (let [newly-fetched      (f provider unfetched-keys)
            newly-fetched-keys (into #{} (map k) newly-fetched)
            unfetched-keys     (set/difference unfetched-keys newly-fetched-keys)]
        (recur more-providers
               unfetched-keys
               (into fetched newly-fetched))))))

(defn- metadatas [providers {metadata-type :lib/type, id-set :id, name-set :name, :as metadata-spec}]
  (if-not (or id-set name-set)
    (when-let [ids (not-empty
                    (into #{}
                          (comp (mapcat #(metadata.protocols/metadatas % metadata-spec))
                                (m/distinct-by :id)
                                (map :id))
                          providers))]
      ;; Once we fetch the combined set of everything from all of the underlying metadata providers, we need to
      ;; refetch-everything by ID and apply the xform to remove inactive stuff. This is because if something like
      ;; ORDERS.TAX is inactive in MP 1 but not MP 2, MP 1 won't return it for [[metabase.lib.metadata/fields]] but MP
      ;; 2 will; we want the MP 1 to shadow the MP 2 version (and remove it from the final results).
      ;; See [[metabase.lib.metadata.composed-provider-test/deleted-columns-metadata-provider-sanity-check-test]].
      (into []
            (metadata.protocols/default-spec-filter-xform metadata-spec)
            (metadatas providers {:lib/type metadata-type, :id ids})))
    (let [k (if id-set :id :name)]
      (metadatas*
       providers
       k
       (k metadata-spec)
       (fn [provider unfetched-keys]
         (metadata.protocols/metadatas provider (assoc metadata-spec k unfetched-keys)))))))

(defn- cached-metadatas [providers metadata-type ids]
  (metadatas*
   (cached-providers providers)
   :id
   ids
   (fn [provider unfetched-ids]
     (metadata.protocols/cached-metadatas provider metadata-type unfetched-ids))))

(defn- cached-value [metadata-providers k not-found]
  (loop [[cached-provider & more] (cached-providers metadata-providers)]
    (b/cond
      (not cached-provider)
      not-found

      :let [v (metadata.protocols/cached-value cached-provider k not-found)]

      (not= v not-found)
      v

      :else
      (recur more))))

(defn- cache-value! [metadata-providers k v]
  (when-let [cached-provider (first (cached-providers metadata-providers))]
    (metadata.protocols/cache-value! cached-provider k v)))

(defn- has-cache? [metadata-providers]
  (some metadata.protocols/has-cache?
        (cached-providers metadata-providers)))

(defn- clear-cache! [metadata-providers]
  (run! #(when (metadata.protocols/cached-metadata-provider? %)
           (metadata.protocols/clear-cache! %))
        metadata-providers))

(defn- store-metadata! [metadata-providers metadata]
  (when-first [provider (cached-providers metadata-providers)]
    (metadata.protocols/store-metadata! provider metadata)))

(defn- setting [metadata-providers setting-key]
  (some (fn [provider]
          (metadata.protocols/setting provider setting-key))
        metadata-providers))

(deftype ComposedMetadataProvider [metadata-providers]
  metadata.protocols/MetadataProvider
  (database [_this]
    (some metadata.protocols/database metadata-providers))
  (metadatas [_this metadata-spec]
    (metadatas metadata-providers metadata-spec))
  (setting [_this setting-key]
    (setting metadata-providers setting-key))

  metadata.protocols/CachedMetadataProvider
  (cached-metadatas [_this metadata-type metadata-ids]
    (cached-metadatas metadata-providers metadata-type metadata-ids))
  (store-metadata! [_this metadata]
    (store-metadata! metadata-providers metadata))
  (cached-value [_this k not-found]
    (cached-value metadata-providers k not-found))
  (cache-value! [_this k v]
    (cache-value! metadata-providers k v))
  (has-cache? [_this]
    (has-cache? metadata-providers))
  (clear-cache! [_this]
    (clear-cache! metadata-providers))

  metadata.protocols/InvocationTracker
  (invoked-ids [_this metadata-type]
    (when-first [provider (invocation-tracker-providers metadata-providers)]
      (metadata.protocols/invoked-ids provider metadata-type)))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? ComposedMetadataProvider another)
         (= metadata-providers
            (.-metadata-providers ^ComposedMetadataProvider another))))

  clojure.core.protocols/Datafiable
  (datafy [_this]
    (cons `composed-metadata-provider (map datafy/datafy metadata-providers)))

  #?@(:clj
      [pretty/PrettyPrintable
       (pretty [_this]
               (list* `composed-metadata-provider metadata-providers))]))

(defn composed-metadata-provider
  "A metadata provider composed of several different `metadata-providers`. Methods try each constituent provider in
  turn from left to right until one returns a truthy result."
  [& metadata-providers]
  (clear-cache! metadata-providers)
  (->ComposedMetadataProvider metadata-providers))
