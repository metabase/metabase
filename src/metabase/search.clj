(ns metabase.search
  "Legacy API namespace for the `metabase.search` module. Migrating to the new `metabase.search.core` structure."
  (:require
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.impl :as search.impl]
   [metabase.search.spec :as search.spec]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  search.config/keep-me
  search.engine/keep-me
  search.impl/keep-me
  search.spec/keep-me)

(p/import-vars
 [search.config
  SearchableModel
  all-models]

 [search.engine
  model-set]

 [search.impl
  search
  ;; We could avoid exposing this by wrapping `query-model-set` and `search` with it.
  search-context]

 [search.spec
  define-spec])
