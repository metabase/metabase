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

(def ^:private default-engine :in-place)

(defn- query-fn [search-engine]
  (or
   (case search-engine
     :fulltext (when (is-postgres?) search.postgres/search)
     :minimal  (when (is-postgres?) search.postgres/search)
     :in-place search.impl/in-place
     nil)

   (recur default-engine)))

(defn- model-set-fn [search-engine]
  (or
   (case search-engine
     :fulltext (when (is-postgres?) search.postgres/model-set)
     :minimal  (when (is-postgres?) search.postgres/model-set)
     :in-place search.impl/query-model-set
    nil)

   (log/warnf "%s search not supported for your AppDb, using %s" search-engine default-engine)
   (recur default-engine)))

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
  (let [engine    (:search-engine search-ctx :in-place)
        query-fn  (query-fn engine)
        models-fn (model-set-fn engine)]
    (search.impl/search
     query-fn
     models-fn
     search-ctx)))
