(ns metabase-enterprise.memoize-monitor.init
  "Reports the size of a curated set of in-memory memoization caches as telemetry.

  Some memoization caches in the app are keyed on argument spaces that can grow large or unbounded (field IDs, table
  IDs, decrypted-secret ciphertexts, per-request collection-visibility configs, serialization paths, ...). Rather than
  instrument each cache at its definition site, this namespace references the vars that hold those caches directly and
  reads each cache's size on a periodic basis via a Prometheus `pull-collector`. For each monitored cache we emit:

  - `:metabase-memoize/cache-size`             -- number of entries

  This lives in enterprise because the monitored caches span both OSS and enterprise modules
  ([[metabase-enterprise.serialization.dump]]); an OSS namespace cannot depend on enterprise code. OSS-only builds get
  no memoize-cache telemetry.

  Only caches built with [[clojure.core.memoize]] (`memo`, `ttl`, and
  [[metabase.app-db.core/memoize-for-application-db]], which is built on `memo`) can be measured, because their
  backing cache is reachable through the memoized function's metadata."
  (:require
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

(defn- memoization-cache-stats
  "Map of `{:cache name, :entries n}` given a var holding a memoized function with a reachable backing cache, or `nil`
  otherwise."
  [cache-var]
  (try
    (when-let [cache (cache-object @cache-var)]
      (let [entries (count cache)]
        {:cache      (str (symbol cache-var))
         :entries    entries}))
    (catch Exception e
      (log/warn e "Error measuring memoization cache size" {:cache (str (symbol cache-var))}))))

(defn- all-cache-stats
  []
  (keep memoization-cache-stats monitored-cache-vars))

(defmethod analytics/pull-collector ::memoize-cache-sizes [_]
  {:min-interval-s (* 10 60)
   :f              (fn []
                     (doseq [{:keys [cache entries]} (all-cache-stats)]
                       (analytics.interface/set-gauge! :metabase-memoize/cache-size {:cache cache} entries)))})
