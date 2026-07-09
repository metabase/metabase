(ns metabase-enterprise.semantic-search.util
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase.premium-features.core :as premium-features]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(defn quote-ident
  "Quote a Postgres identifier, escaping embedded double quotes."
  [s]
  (str \" (str/replace s "\"" "\"\"") \"))

(defn qualified-table-parts
  "Split a possibly schema-qualified table name into `[schema table]`; `schema` is nil when unqualified."
  [table-name]
  (let [[a b] (str/split table-name #"\." 2)]
    (if b [a b] [nil a])))

(defn table-name-part
  "The bare table name of a possibly schema-qualified table name.
  Derived identifiers (index names, catalog lookups by `tablename`) must use this, never the full name."
  [table-name]
  (second (qualified-table-parts table-name)))

(defn table-exists?
  "Does the table-name exist in pgvector DB's information_schema.tables?
  A schema-qualified (dotted) name matches only within its schema; an unqualified name matches any schema."
  [pgvector table-name]
  (let [[schema table] (qualified-table-parts table-name)]
    (-> (jdbc/execute-one! pgvector
                           (if schema
                             [(str "SELECT exists (select 1 FROM information_schema.tables"
                                   " WHERE table_schema = ? AND table_name = ?) table_exists")
                              schema table]
                             ["SELECT exists (select 1 FROM information_schema.tables WHERE table_name = ?) table_exists"
                              table])
                           {:builder-fn jdbc.rs/as-unqualified-lower-maps})
        (:table_exists false))))

(defn index-exists?
  "Does an index named `index-name` exist in the pgvector DB's pg_indexes?"
  [pgvector index-name]
  (-> (jdbc/execute-one! pgvector
                         ["SELECT exists (select 1 FROM pg_indexes WHERE indexname = ?) index_exists"
                          index-name]
                         {:builder-fn jdbc.rs/as-unqualified-lower-maps})
      (:index_exists false)))

(defn semantic-search-available?
  "Predicate to check whether semantic search is available on the instance."
  []
  ;; entitlement first: don't query the app db (the pgvector probe) for instances that can't use the answer
  (and (premium-features/has-feature? :semantic-search)
       (semantic.db.datasource/pgvector-configured?)))
