(ns metabase-enterprise.semantic-search.util
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.app-db.core :as mdb]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.engine :as search.engine]
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
  "Does an index named `index-name` exist in the pgvector DB's pg_indexes?
  A schema-qualified (dotted) name matches only within its schema; an unqualified name matches any schema."
  [pgvector index-name]
  (let [[schema index] (qualified-table-parts index-name)]
    (-> (jdbc/execute-one! pgvector
                           (if schema
                             ["SELECT exists (select 1 FROM pg_indexes WHERE schemaname = ? AND indexname = ?) index_exists"
                              schema index]
                             ["SELECT exists (select 1 FROM pg_indexes WHERE indexname = ?) index_exists"
                              index])
                           {:builder-fn jdbc.rs/as-unqualified-lower-maps})
        (:index_exists false))))

(defn semantic-search-configured?
  "Might this instance have a pgvector DB: a dedicated MB_PGVECTOR_DB_URL, or a Postgres app DB
  (which may support pgvector -- [[semantic-search-capable?]] runs the probe that answers for sure).
  The boot-static input: gates Quartz job scheduling, which happens once at startup, so it must be
  cheap and infallible -- it never queries the DB. The runtime gates (license, kill switch, engine
  activity) are checked per job execution instead, so flipping them never requires a restart."
  []
  (or (semantic.db.datasource/dedicated-url-configured?)
      (= :postgres (mdb/db-type))))

(defn semantic-search-capable?
  "Does this instance have the infrastructure for semantic search: the premium feature and a pgvector DB.
  Deliberately excludes the kill switch, which is checked per execution so it works at runtime."
  []
  ;; Feature first: the pgvector check may probe the app DB, and instances that can't use the answer
  ;; must never probe.
  (and (premium-features/has-feature? :semantic-search)
       (semantic.db.datasource/pgvector-configured?)))

(defn semantic-search-available?
  "Whether semantic search can run on this instance: capable and not disabled by the kill switch.
  Engine selection, hygiene tasks, and metrics key off this."
  []
  (and (semantic-search-capable?)
       (semantic.settings/semantic-search-enabled)))

(defn semantic-search-active?
  "Is the semantic index being maintained on this instance?
  Anything that writes to the index (or pays for embeddings) must gate on this, not on availability:
  a supported engine that is neither the default nor an additional engine has no index worth feeding."
  []
  (contains? (set (search.engine/active-engines)) :search.engine/semantic))
