(ns metabase-enterprise.advanced-config.caching
  (:require
   [metabase.public-settings.premium-features :refer [defenterprise]]))

(defenterprise granular-ttl
  "Returns the cache ttl (in seconds), by first checking whether there is a stored value for the database,
      dashboard, or card (in that order of increasing preference)."
  :feature :advanced-config
  [card dashboard database]
  (let [ttls              [(:cache_ttl card) (:cache_ttl dashboard) (:cache_ttl database)]
        most-granular-ttl (first (filter some? ttls))]
    (and most-granular-ttl ; stored TTLs are in hours; convert to seconds
         (* most-granular-ttl 3600))))
