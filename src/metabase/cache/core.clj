(ns metabase.cache.core
  (:require
   [metabase.cache.settings]
   [potemkin :as p]))

(comment metabase.cache.settings/keep-me)

(p/import-vars
 [metabase.cache.settings
  enable-query-caching
  query-caching-max-kb
  query-caching-max-ttl])
