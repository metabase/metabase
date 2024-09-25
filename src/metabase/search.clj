(ns metabase.search
  "API namespace for the `metabase.search` module"
  (:require
   [metabase.db :as mdb]
   [metabase.search.api :as search.api]
   [metabase.search.config :as search.config]
   [metabase.search.fulltext :as search.fulltext]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.core :as search.postgres]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  search.api/keep-me
  search.config/keep-me
  search.impl/keep-me)

(p/import-vars
 [search.config
  SearchableModel
  all-models]
 [search.api
  model-set]
 [search.impl
  search
  ;; We could avoid exposing this by wrapping `query-model-set` and `search` with it.
  search-context])

;; TODO The following need to be cleaned up to use multimethods.

(defn init-index!
  "Ensure there is an index ready to be populated."
  [& {:keys [force-reset?]}]
  (when (search.fulltext/supported-db? (mdb/db-type))
    (search.postgres/init! force-reset?)))

(defn supports-index?
  "Does this instance support a search index?"
  []
  (search.fulltext/supported-db? (mdb/db-type)))

(defn reindex!
  "Populate a new index, and make it active. Simultaneously updates the current index."
  []
  (when (supports-index?)
    (search.postgres/reindex!)))
