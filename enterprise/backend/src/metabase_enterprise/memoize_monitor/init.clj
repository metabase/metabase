(ns metabase-enterprise.memoize-monitor.init
  "Reports the entry count of a curated set of in-memory memoization caches as telemetry.

  Some memoization caches in the app are keyed on argument spaces that can grow large or unbounded (field IDs, table
  IDs, decrypted-secret ciphertexts, per-request collection-visibility configs, serialization paths, ...). Rather than
  instrument each cache at its definition site, this namespace references the vars that hold those caches directly and
  reads each cache's current size on a periodic basis via a Prometheus `pull-collector` (the
  `:metabase-memoize/cache-size` gauge, declared in [[metabase.analytics.prometheus]]).

  This lives in enterprise because the monitored caches span both OSS and enterprise modules
  ([[metabase-enterprise.serialization.dump]]); an OSS namespace cannot depend on enterprise code. OSS-only builds get
  no memoize-cache telemetry.

  Only caches built with [[clojure.core.memoize]] (`memo`, `ttl`, and
  [[metabase.app-db.core/memoize-for-application-db]], which is built on `memo`) can be measured, because their
  backing cache is reachable through the memoized function's metadata. The size is read directly off that cache, which
  is O(1) and copies nothing (unlike `clojure.core.memoize/snapshot`)."
  (:require
   [metabase-enterprise.serialization.dump :as serialization.dump]
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.core :as analytics]
   [metabase.audit-app.impl :as audit-app.impl]
   [metabase.collections.models.collection :as collection]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.warehouse-schema.models.field :as schema.field]
   [metabase.warehouses.models.database :as database])
  (:import
   (clojure.core.memoize PluggableMemoization)))

(set! *warn-on-reflection* true)

(def ^:private monitored-cache-vars
  "The vars holding the memoization caches whose entry counts we export. Each must hold a
  [[clojure.core.memoize]]-backed function (see the namespace docstring)."
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

(defn- cache-size
  "Entry count of a [[clojure.core.memoize]]-backed function `f`, or `nil` if its backing cache isn't readable."
  [f]
  (when-let [cache-atom (:clojure.core.memoize/cache (meta f))]
    (let [pm @cache-atom]
      (when (instance? PluggableMemoization pm)
        (count (.cache ^PluggableMemoization pm))))))

(defn- cache-sizes
  "Map of cache-name (the var's fully-qualified symbol, as a string) -> current entry count, for every monitored cache
  whose size can be read."
  []
  (into {}
        (keep (fn [cache-var]
                (when-let [n (cache-size @cache-var)]
                  [(str (symbol cache-var)) (long n)])))
        monitored-cache-vars))

;; Export the entry count of every monitored memoization cache, one gauge sample per cache. Reading a cache's size is
;; O(1) and copies nothing, so refreshing once a minute is cheap.
(defmethod analytics/pull-collector ::memoize-cache-sizes [_]
  {:min-interval-s 60
   :f (fn []
        (doseq [[cache-name n] (cache-sizes)]
          (analytics.interface/set-gauge! :metabase-memoize/cache-size {:cache cache-name} n)))})
