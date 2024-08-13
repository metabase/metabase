(ns metabase.lib.metadata.composed-provider
  (:require
   #?(:clj [pretty.core :as pretty])
   [clojure.core.protocols]
   [clojure.datafy :as datafy]
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.lib.metadata.protocols :as metadata.protocols]))

(defn- cached-providers [providers]
  (filter metadata.protocols/cached-metadata-provider? providers))

(defn- invocation-tracker-providers [providers]
  (filter #(satisfies? metadata.protocols/InvocationTracker %)
          providers))

(defn- metadatas-for-f [f providers metadata-type ids]
  (loop [[provider & more-providers] providers, unfetched-ids (set ids), fetched []]
    (cond
      (empty? unfetched-ids)
      fetched

      (not provider)
      fetched

      :else
      (let [newly-fetched     (f provider metadata-type unfetched-ids)
            newly-fetched-ids (into #{} (map :id) newly-fetched)
            unfetched-ids     (set/difference unfetched-ids newly-fetched-ids)]
        (recur more-providers
               unfetched-ids
               (into fetched newly-fetched))))))

(defn- metadatas [providers metadata-type ids]
  (metadatas-for-f metadata.protocols/metadatas providers metadata-type ids))

(defn- cached-metadatas [providers metadata-type ids]
  (metadatas-for-f metadata.protocols/cached-metadatas
                   (cached-providers providers)
                   metadata-type
                   ids))

(defn- store-metadata! [metadata-providers metadata]
  (when-first [provider (cached-providers metadata-providers)]
    (metadata.protocols/store-metadata! provider metadata)))

(defn- tables [metadata-providers]
  (m/distinct-by :id (mapcat metadata.protocols/tables metadata-providers)))

(defn- metadatas-for-table [metadata-type table-id metadata-providers]
  (into []
        (comp
         (mapcat (fn [provider]
                   (metadata.protocols/metadatas-for-table provider metadata-type table-id)))
         (m/distinct-by :id))
        metadata-providers))

(defn- metadatas-for-card [metadata-type card-id metadata-providers]
  (into []
        (comp
         (mapcat (fn [provider]
                   (metadata.protocols/metadatas-for-card provider metadata-type card-id)))
         (m/distinct-by :id))
        metadata-providers))

(defn- setting [metadata-providers setting-key]
  (some (fn [provider]
          (metadata.protocols/setting provider setting-key))
        metadata-providers))

(deftype ComposedMetadataProvider [metadata-providers]
  metadata.protocols/MetadataProvider
  (database [_this]
    (some metadata.protocols/database metadata-providers))
  (metadatas [_this metadata-type ids]
    (metadatas metadata-providers metadata-type ids))
  (tables [_this]
    (tables metadata-providers))
  (metadatas-for-table [_this metadata-type table-id]
    (metadatas-for-table metadata-type table-id metadata-providers))
  (metadatas-for-card [_this metadata-type card-id]
    (metadatas-for-card metadata-type card-id metadata-providers))
  (setting [_this setting-key]
    (setting metadata-providers setting-key))

  metadata.protocols/CachedMetadataProvider
  (cached-metadatas [_this metadata-type metadata-ids]
    (cached-metadatas metadata-providers metadata-type metadata-ids))
  (store-metadata! [_this metadata]
    (store-metadata! metadata-providers metadata))

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
  (->ComposedMetadataProvider metadata-providers))
