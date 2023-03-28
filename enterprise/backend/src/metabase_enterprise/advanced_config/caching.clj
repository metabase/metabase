(ns metabase-enterprise.advanced-config.caching
  (:require
   [metabase.public-settings.premium-features :refer [defenterprise]]))

(defenterprise db-cache-ttl
  "Fetches the cache TTL set for a given database. Since this is EE-only functionality, the corresponding OSS function
  always returns nil."
  :feature :advanced-config
  [database]
  (:cache_ttl database))
