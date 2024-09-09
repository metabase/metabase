(ns metabase.search
  "API namespace for the `metabase.search` module.

  TODO: a lot of this stuff wouldn't need to be exposed if we moved more of the search stuff
  from [[metabase.api.search]] into the `metabase.search` module."
  (:require
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.util.malli :as mu]
   [potemkin :as p]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(p/import-vars
 [search.config
  SearchableModel
  all-models]
 [search.impl
  query-model-set
  search-context])

(defn is-postgres?
  "Check whether we can create this index"
  []
  (= "PostgreSQL"
     (t2/with-connection [^java.sql.Connection conn]
       (.. conn getMetaData getDatabaseProductName))))

(mu/defn search
  "Builds a search query that includes all the searchable entities and runs it"
  [search-ctx :- search.config/SearchContext]
  (search.impl/search (if (is-postgres?)
                        search.postgres/search
                        search.impl/in-place)
                      search-ctx))
