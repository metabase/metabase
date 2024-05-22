(ns metabase.search
  "API namespace for the `metabase.search` module.

  TODO: a lot of this stuff wouldn't need to be exposed if we moved more of the search stuff
  from [[metabase.api.search]] into the `metabase.search` module."
  (:require
   [metabase.search.config]
   [metabase.search.impl]
   [potemkin :as p]))

(comment
  metabase.search.config/keep-me
  metabase.search.impl/keep-me)

(p/import-vars
  [metabase.search.config
   SearchableModel
   all-models]
  [metabase.search.impl
   query-model-set
   search-context
   search])
