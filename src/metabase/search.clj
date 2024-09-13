(ns metabase.search
  "API namespace for the `metabase.search` module.

  TODO: a lot of this stuff wouldn't need to be exposed if we moved more of the search stuff
  from [[metabase.api.search]] into the `metabase.search` module."
  (:require
   [metabase.db]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [potemkin :as p]))

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
  (= :postgres (metabase.db/db-type)))

(defn- query-fn [search-engine]
  (case search-engine
    :fulltext (if (is-postgres?)
                search.postgres/search
                (do (log/warn ":fulltext search not supported for your AppDb, using :in-place")
                    search.impl/in-place))
    :minimal  (if (is-postgres?)
                search.postgres/search-minimal
                (do (log/warn ":minimal search not supported for your AppDb, using :in-place")
                    search.impl/in-place))
    :in-place search.impl/in-place))

(defn supports-index?
  "Does this instance support a search index, e.g. has the right kind of AppDb"
  []
  (is-postgres?))

(defn init-index!
  "Ensure there is an index ready to be populated."
  [& {:keys [force-reset?]}]
  (when (is-postgres?)
    (search.postgres/init! force-reset?)))

(defn reindex!
  "Populate a new index, and make it active. Simultaneously updates the current index."
  []
  (when (is-postgres?)
    (search.postgres/reindex!)))

(mu/defn search
  "Builds a search query that includes all the searchable entities and runs it"
  [search-ctx :- search.config/SearchContext]
  (let [query-fn (query-fn (:search-engine search-ctx :in-place))]
    (search.impl/search query-fn search-ctx)))
