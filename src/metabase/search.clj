(ns metabase.search
  "API namespace for the `metabase.search` module.

  TODO: a lot of this stuff wouldn't need to be exposed if we moved more of the search stuff
  from [[metabase.api.search]] into the `metabase.search` module."
  (:require
   [potemkin :as p]
   [metabase.search.config]
   [metabase.search.filter]
   [metabase.search.scoring]
   [metabase.search.util]))

'[[metabase.api.search metabase.search.util]
  [metabase.api.search metabase.search.config]
  [metabase.api.search metabase.search.scoring]
  [metabase.api.search metabase.search.filter]]

(comment
  metabase.search.config/keep-me
  metabase.search.filter/keep-me
  metabase.search.scoring/keep-me
  metabase.search.util/keep-me)

(p/import-vars
  [metabase.search.config
   SearchableModel
   SearchContext
   all-models
   all-search-columns
   columns-for-model
   column-with-model-alias
   max-filtered-results
   model-to-db-model
   search-model->revision-model]
  [metabase.search.filter
   build-filters
   search-context->applicable-models]
  [metabase.search.scoring
   score-and-result
   serialize
   top-results]
  [metabase.search.util
   normalize
   wildcard-match])

(defn db-max-results
  "Number of raw results to fetch from the database. This number is in place to prevent massive application DB load by
  returning tons of results."
  []
  metabase.search.config/*db-max-results*)
