(ns metabase.cache.core
  (:require
   [metabase.cache.models.cache-config]
   [metabase.cache.settings]
   [potemkin :as p]))

(comment metabase.cache.models.cache-config/keep-me
         metabase.cache.settings/keep-me)

;; the re-exported var carries the docstring; kondo can't see through import-def
#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.cache.models.cache-config/invalidate! invalidate-config!)

(p/import-vars
 [metabase.cache.models.cache-config
  card-strategy
  root-strategy]
 [metabase.cache.settings
  enable-query-caching
  query-caching-max-kb
  query-caching-max-ttl])
