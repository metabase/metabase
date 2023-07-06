(ns metabase-enterprise.advanced-config.caching
  (:require
   [metabase.public-settings.premium-features :refer [defenterprise]]))

(defenterprise granular-ttl
  "Returns the granular cache ttl (in seconds) for a card. On EE, this first checking whether there is a stored value
   for the card, dashboard, or database (in that order of decreasing preference). Returns nil on OSS."
  :feature :advanced-config
  [card dashboard database]
  (let [ttls              [(:cache_ttl card) (:cache_ttl dashboard) (:cache_ttl database)]
        most-granular-ttl (first (filter some? ttls))]
    (when most-granular-ttl ; stored TTLs are in hours; convert to seconds
      (* most-granular-ttl 3600))))
