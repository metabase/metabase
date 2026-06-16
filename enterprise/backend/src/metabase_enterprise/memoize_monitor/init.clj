(ns metabase-enterprise.memoize-monitor.init
  "Reports the size of a curated set of in-memory memoization caches as telemetry.

  Some memoization caches in the app are keyed on argument spaces that can grow large or unbounded (field IDs, table
  IDs, decrypted-secret ciphertexts, per-request collection-visibility configs, serialization paths, ...). Rather than
  instrument each cache at its definition site, this namespace references the vars that hold those caches directly and
  reads each cache's size on a periodic basis via a Prometheus `pull-collector`. For each monitored cache we emit:

  - `:metabase-memoize/cache-size`             -- number of entries
  - `:metabase-memoize/cache-bytes`            -- approximate retained size in bytes, estimated by measuring a sample
                                                  of entries and extrapolating ([[clj-memory-meter.core]])
  - `:metabase-memoize/cache-measure-duration-ms` -- wall-clock time spent producing that estimate, so the cost of
                                                     running this monitor is itself observable

  This lives in enterprise because the monitored caches span both OSS and enterprise modules
  ([[metabase-enterprise.serialization.dump]]); an OSS namespace cannot depend on enterprise code. OSS-only builds get
  no memoize-cache telemetry.

  Only caches built with [[clojure.core.memoize]] (`memo`, `ttl`, and
  [[metabase.app-db.core/memoize-for-application-db]], which is built on `memo`) can be measured, because their
  backing cache is reachable through the memoized function's metadata.

  NOTE: counting entries is O(1) and copies nothing. The byte figure is an estimate from a small sample of entries
  (see [[estimate-cache-bytes]]) rather than a full-cache walk, keeping the cost roughly constant regardless of cache
  size; we still export the measurement duration so its cost stays observable."
  (:require
   [clj-memory-meter.core :as mm]
   [metabase-enterprise.serialization.dump :as serialization.dump]
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.core :as analytics]
   [metabase.audit-app.impl :as audit-app.impl]
   [metabase.collections.models.collection :as collection]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.warehouse-schema.models.field :as schema.field]
   [metabase.warehouses.models.database :as database])
  (:import
   (clojure.core.memoize PluggableMemoization)))

(set! *warn-on-reflection* true)

(def ^:private monitored-cache-vars
  "The vars holding the memoization caches whose sizes we export. Each must hold a [[clojure.core.memoize]]-backed
  function (see the namespace docstring)."
  [#'schema.field/field-id->table-id
   #'database/table-id->database-id
   #'database/db-id->router-db-id
   #'audit-app.impl/memoized-select-audit-entity*
   #'driver.u/memoized-supports?*
   #'driver.u/memoized-features*
   #'mi/cached-encrypted-json-out
   #'collection/can-access-root-collection?
   #'collection/visible-collection-ids*
   #'serialization.dump/serialization-sorted-map])

(defn- cache-object
  "The backing cache of a [[clojure.core.memoize]]-memoized function `f`, or `nil` if it isn't reachable. The returned
  object is a `clojure.core.cache` cache that is both `count`able and measurable."
  [f]
  (when-let [pm (some-> f meta :clojure.core.memoize/cache deref)]
    (when (instance? PluggableMemoization pm)
      (.cache ^PluggableMemoization pm))))

(def ^:private memory-measurement-available?
  (contains? #{"" "true"} (System/getProperty "jdk.attach.allowAttachSelf")))

(def ^:private sample-size
  "Number of cache entries to actually measure before extrapolating to the full entry count."
  10)

(defn- estimate-cache-bytes
  "Approximate retained size in bytes of `cache` (a `clojure.core.cache` cache holding `entries` entries).

  Rather than walk the whole cache (potentially millions of entries) on every scrape, measure a small sample of
  entries and scale by the total count. This keeps the cost roughly constant regardless of cache size; the result is
  an estimate, not an exact figure (a uniform per-entry size is assumed, and structure shared across entries is
  effectively counted once per sample then scaled up)."
  [cache entries]
  (let [sample (into [] (take sample-size) cache)]
    (if (empty? sample)
      0
      (long (* (mm/measure sample :bytes true)
               (/ entries (double (count sample))))))))

(defn- memoization-cache-stats
  "Map of `{:cache name, :entries n, :bytes b, :measure-ms ms}` given a var holding a memoized function with a
  reachable backing cache, or `nil` otherwise.

  Entry counts are always reported. The byte estimate (see [[estimate-cache-bytes]]) self-attaches a memory-
  measurement Java agent, so it only runs when [[memory-measurement-available?]]; otherwise `:bytes` and `:measure-ms`
  are nil. `:bytes` is also nil if measurement throws. `:measure-ms` is the time spent producing the estimate."
  [cache-var]
  (when-let [cache (cache-object @cache-var)]
    (let [entries (count cache)
          [bytes measure-ms] (when memory-measurement-available?
                               (let [start-ns (System/nanoTime)
                                     bytes    (try
                                                (estimate-cache-bytes cache entries)
                                                (catch Throwable e
                                                  (log/warn e "Error measuring memoization cache size" (symbol cache-var))
                                                  nil))]
                                 [bytes (/ (- (System/nanoTime) start-ns) 1e6)]))]
      {:cache      (str (symbol cache-var))
       :entries    entries
       :bytes      bytes
       :measure-ms measure-ms})))

(defn- all-cache-stats
  []
  (keep memoization-cache-stats monitored-cache-vars))

;; Export the size of every monitored memoization cache, one sample per cache per metric. The byte measurement is
;; potentially expensive, so we also export how long each measurement took and refresh no more than once every 10
;; minutes.
(defmethod analytics/pull-collector ::memoize-cache-sizes [_]
  {:min-interval-s (* 10 60)
   :f              (fn []
                     (doseq [{:keys [cache entries bytes measure-ms]} (all-cache-stats)]
                       (analytics.interface/set-gauge! :metabase-memoize/cache-size {:cache cache} entries)
                       (when measure-ms
                         (analytics.interface/set-gauge! :metabase-memoize/cache-measure-duration-ms {:cache cache} measure-ms))
                       (when bytes
                         (analytics.interface/set-gauge! :metabase-memoize/cache-bytes {:cache cache} bytes))))})
