(ns metabase-enterprise.semantic-search.util
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase.app-db.core :as mdb]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.engine :as search.engine]
   [next.jdbc :as jdbc]
   [next.jdbc.quoted :as quoted]
   [next.jdbc.result-set :as jdbc.rs]))

(def quote-ident
  "Quote a Postgres identifier for interpolation into raw SQL, doubling any embedded double quote."
  quoted/postgres)

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

(defn quote-table
  "Quote a possibly schema-qualified `table-name` for raw SQL, quoting schema and table separately so it
  renders as \"schema\".\"table\" rather than one identifier with a literal dot."
  [table-name]
  (let [[schema table] (qualified-table-parts table-name)]
    (if schema
      (str (quote-ident schema) "." (quote-ident table))
      (quote-ident table))))

(defn column-keyword
  "A `table.column` reference as a dotted-name keyword, not a namespaced one.
  HoneySQL quotes a keyword's namespace as one identifier, so a schema-qualified table there renders as a
  single broken identifier. The dotted name renders as separate quoted parts.
  Pass the table name as it should render: qualified for an ordinary FROM/JOIN reference."
  [table-name column]
  (keyword (str table-name "." (name column))))

(defn conflict-target-column
  "A `column-keyword` for an ON CONFLICT clause on a possibly schema-qualified `table-name`.
  Postgres names the conflict target by its bare relation even when the insert target is schema-qualified,
  so the reference drops the schema."
  [table-name column]
  (column-keyword (table-name-part table-name) column))

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

(defn index-ready?
  "Whether `index-name` is present and marked ready and valid by PostgreSQL. An in-progress or abandoned
  concurrent build is not ready. A schema-qualified name matches only within its schema."
  [pgvector index-name]
  (let [[schema index] (qualified-table-parts index-name)]
    (-> (jdbc/execute-one! pgvector
                           (if schema
                             [(str "SELECT exists (SELECT 1 FROM pg_class i "
                                   "JOIN pg_namespace n ON n.oid = i.relnamespace "
                                   "JOIN pg_index x ON x.indexrelid = i.oid "
                                   "WHERE n.nspname = ? AND i.relname = ? "
                                   "AND x.indisready AND x.indisvalid) AS index_ready")
                              schema index]
                             [(str "SELECT exists (SELECT 1 FROM pg_class i "
                                   "JOIN pg_index x ON x.indexrelid = i.oid "
                                   "WHERE i.relname = ? AND x.indisready AND x.indisvalid) AS index_ready")
                              index])
                           {:builder-fn jdbc.rs/as-unqualified-lower-maps})
        (:index_ready false))))

(defn semantic-search-configured?
  "Whether to schedule the semantic-search Quartz jobs at startup.
  True when the `:semantic-search` feature is present and a pgvector store might exist: a dedicated
  MB_PGVECTOR_DB_URL, or a Postgres app DB that [[semantic-search-available?]] can probe to answer for sure.
  Cheap and infallible by contract -- it runs at boot and never queries the DB."
  []
  ;; The license is in this boot gate, not only the per-execution gates, so an unlicensed instance's
  ;; scheduler stays free of no-op jobs. The asymmetry is deliberate: removing the feature at runtime lets
  ;; the scheduled jobs no-op via semantic-search-active?, but adding it needs a restart before they
  ;; schedule. Engine activity stays per-execution so it never needs one.
  (and (premium-features/has-feature? :semantic-search)
       (or (semantic.db.datasource/dedicated-url-configured?)
           (= :postgres (mdb/db-type)))))

(defn semantic-search-available?
  "Does this instance have the infrastructure for semantic search: the premium feature and a pgvector DB.
  Engine selection and hygiene tasks key off this."
  []
  ;; Feature first: the pgvector check may probe the app DB, and instances that can't use the answer
  ;; must never probe.
  (and (premium-features/has-feature? :semantic-search)
       (semantic.db.datasource/pgvector-configured?)))

(defn semantic-search-active?
  "Is the semantic index being maintained on this instance?
  Anything that writes to the index (or pays for embeddings) must gate on this, not on availability:
  a supported engine that is neither the default nor an additional engine has no index worth feeding."
  []
  (contains? (set (search.engine/active-engines)) :search.engine/semantic))
