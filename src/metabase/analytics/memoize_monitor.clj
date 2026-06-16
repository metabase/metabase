(ns metabase.analytics.memoize-monitor
  "Reports the entry count of a curated set of in-memory memoization caches as telemetry.

  Some memoization caches in the app are keyed on argument spaces that can grow large or unbounded (field IDs, table
  IDs, decrypted-secret ciphertexts, per-request collection-visibility configs, ...). Rather than instrument each
  cache at its definition site, this namespace names the vars that hold those caches and reads each cache's current
  size on a periodic basis (see the `:metabase-memoize/cache-size` Prometheus gauge, refreshed by
  [[metabase.analytics.prometheus]]).

  Only caches built with [[clojure.core.memoize]] (`memo`, `ttl`, `lru`, and
  [[metabase.app-db.core/memoize-for-application-db]], which is built on `memo`) can be measured, because their
  backing cache is reachable through the memoized function's metadata. The size is read directly off that cache,
  which is O(1) and copies nothing (unlike `clojure.core.memoize/snapshot`). Vars are referenced lazily by symbol so
  this namespace does not depend on the modules that define the caches."
  (:require
   [metabase.util.log :as log])
  (:import
   (clojure.core.memoize PluggableMemoization)))

(set! *warn-on-reflection* true)

(def ^:private monitored-cache-vars
  "Fully-qualified symbols of the vars holding the memoization caches whose entry counts we export. Each must resolve
  to a [[clojure.core.memoize]]-backed function (see the namespace docstring)."
  '[metabase.warehouse-schema.models.field/field-id->table-id
    metabase.warehouses.models.database/table-id->database-id
    metabase.warehouses.models.database/db-id->router-db-id
    metabase.audit-app.impl/memoized-select-audit-entity*
    metabase.driver.util/memoized-supports?*
    metabase.driver.util/memoized-features*
    metabase.models.interface/cached-encrypted-json-out
    metabase.collections.models.collection/can-access-root-collection?
    metabase.collections.models.collection/visible-collection-ids*
    metabase-enterprise.serialization.dump/serialization-sorted-map])

(defn- cache-size
  "Entry count of a [[clojure.core.memoize]]-backed function `f`, or `nil` if `f` isn't such a function (or its cache
  isn't readable right now)."
  [f]
  (when-let [cache-atom (:clojure.core.memoize/cache (meta f))]
    (let [pm @cache-atom]
      (when (instance? PluggableMemoization pm)
        (count (.cache ^PluggableMemoization pm))))))

(defn cache-sizes
  "Map of cache-name (the var's fully-qualified symbol, as a string) -> current entry count, for every monitored cache
  whose size can be read. A var that can't be resolved or whose value isn't a measurable cache is omitted."
  []
  (into {}
        (keep (fn [sym]
                (when-let [n (try
                               (some-> (requiring-resolve sym) deref cache-size)
                               (catch Throwable e
                                 (log/warn e "Error reading memoization cache size" sym)
                                 nil))]
                  [(str sym) (long n)])))
        monitored-cache-vars))
