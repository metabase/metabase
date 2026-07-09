(ns metabase-enterprise.semantic-search.util
  (:require
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.engine :as search.engine]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(defn table-exists?
  "Does the table-name exist in pgvector DB's information_schema.tables?"
  [pgvector table-name]
  (-> (jdbc/execute-one! pgvector
                         ["SELECT exists (select 1 FROM information_schema.tables WHERE table_name = ?) table_exists"
                          table-name]
                         {:builder-fn jdbc.rs/as-unqualified-lower-maps})
      (:table_exists false)))

(defn index-exists?
  "Does an index named `index-name` exist in the pgvector DB's pg_indexes?"
  [pgvector index-name]
  (-> (jdbc/execute-one! pgvector
                         ["SELECT exists (select 1 FROM pg_indexes WHERE indexname = ?) index_exists"
                          index-name]
                         {:builder-fn jdbc.rs/as-unqualified-lower-maps})
      (:index_exists false)))

(defn semantic-search-available?
  "Whether semantic search can run on this instance.
  The canonical capability gate: engine selection, hygiene tasks, and metrics key off this."
  []
  (and (string? (not-empty semantic.db.datasource/db-url))
       (premium-features/has-feature? :semantic-search)
       (semantic.settings/semantic-search-enabled)))

(defn semantic-search-active?
  "Is the semantic index being maintained on this instance?
  Anything that writes to the index (or pays for embeddings) must gate on this, not on availability:
  a supported engine that is neither the default nor an additional engine has no index worth feeding."
  []
  (and (semantic-search-available?)
       (contains? (set (search.engine/active-engines)) :search.engine/semantic)))
