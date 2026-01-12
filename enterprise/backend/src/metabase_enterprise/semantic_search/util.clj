(ns metabase-enterprise.semantic-search.util
  (:require
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase.premium-features.core :as premium-features]
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

(defn semantic-search-available?
  "Predicate to check whether semantic search is available on the instance."
  []
  (and (string? (not-empty semantic.db.datasource/db-url))
       (premium-features/has-feature? :semantic-search)))
