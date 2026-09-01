(ns metabase-enterprise.entity-retrieval.index-table
  "Lifecycle of the pgvector tables backing the library entity index.

  Two tables live in the pgvector store:

  - the vectors table (`library_entity_index`): many rows per library entity — one *embedded* document
    per value (the entity's name, its description, each ai_context synonym, each ai_context example).
    Each row carries `doc_embedding`, the `doc_text` it was embedded from, and flat `entity_type` /
    `entity_local_id` columns.
    The primary key `doc_id` is content-addressed over the embedded text (see [[reconcile]]), so a text
    edit mints a new row and the reconciler GCs the old one.
    Curator `instructions` are NOT stored here — the tool reads them live from `osi_ai_context` at query
    time.
  - a single-row meta table recording the embedding model identity and schema version the vectors table
    was built for.

  [[ensure-tables!]] is the only entry point: it idempotently creates both tables and, when the
  configured embedding model or the schema version no longer matches the meta row, drops and recreates
  the vectors table so the next reconcile re-embeds everything.
  That drop-and-rebuild is the entire model-change story — the index is rebuilt from the authoritative
  appdb (library membership + `osi_ai_context`), so rebuilding is cheap."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql SQLException)
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def index-schema
  "Schema holding the library entity index, in a dedicated store and on the app db alike.
  Its own, not semantic search's: [[metabase-enterprise.semantic-search.db.migration.impl]] wipes the
  schema it is given, and a dedicated store's reset sweeps the default schema these tables used to sit in.
  It spares the names it recognizes, and ours were never among them -- but an index should not depend on
  another module's list of what it may destroy."
  "library_retrieval")

;; TODO (Chris 2026-07-14) -- these names carry no version, so an on-disk upgrade has nothing to key off.
;; Revisit when the semantic-search indexing mechanism is reworked, sharing its scheme.
(def default-tables
  "Where the index lives. Qualified in both modes, so nothing here can resolve against an application
  table, and a semantic-search migration cannot reach it."
  {:schema  index-schema
   :vectors (str index-schema ".library_entity_index")
   :meta    (str index-schema ".library_entity_index_meta")})

(def legacy-tables
  "The unqualified names used before [[index-schema]] and immutable embedding-space identities existed."
  {:vectors "library_entity_index"
   :meta    "library_entity_index_meta"})

(def ^:dynamic *tables*
  "Table names to use, or nil for [[default-tables]]. Bound by tests to isolated names."
  nil)

(defn tables
  "The index's table names, as a `{:schema :vectors :meta}` map."
  []
  (or *tables* default-tables))

(defn vectors-table
  "Name of the vectors table, schema-qualified.
  For raw SQL use [[vectors-table-sql]]: interpolated into `\"%s\"`, a qualified name reads as one
  identifier."
  []
  (:vectors (tables)))

(defn meta-table
  "Name of the meta table, schema-qualified. For raw SQL use [[meta-table-sql]]."
  []
  (:meta (tables)))

(defn vectors-table-sql
  "[[vectors-table]] quoted for interpolation into raw SQL."
  []
  (semantic.util/quote-table (vectors-table)))

(defn meta-table-sql
  "[[meta-table]] quoted for interpolation into raw SQL."
  []
  (semantic.util/quote-table (meta-table)))

(def schema-version
  "Canonical version of the persisted index contract — the metadata and vectors table schemas plus the
  doc-derivation contract (doc_id scheme, doc_type set, doc_text source, dedup/key rules).
  It's part of the meta row's [[model-identity]], so bumping it makes [[ensure-tables!]] drop and rebuild
  the vectors table; the post-upgrade startup reconcile then repopulates from the appdb under the new
  format. Bump on ANY compatibility-affecting change in [[metabase-enterprise.entity-retrieval.reconcile]]
  or either table schema: a column/type change, a new or renamed doc_type, a changed doc_text
  source, or a changed doc_id / dedup / key scheme — anything that makes old rows incomparable to newly
  derived desired docs. A bump forces a full re-embed of the library on every instance at upgrade, so do
  it only when the format truly moved, never as a refresh convenience."
  ;; v1 — initial schema; v2 — immutable embedding-space identity.
  2)

;; Advisory lock serializing concurrent ensure-tables! calls (e.g. several cluster nodes starting at
;; once). Arbitrary app-wide-unique constant; semantic-search's migration lock uses 19991.
(def ^:private ensure-lock-id 20011)

(defn- sql-format-quoted [honey-sql]
  (sql/format honey-sql {:quoted true}))

(defn format-embedding
  "Format a float-array embedding as a pgvector SQL literal.
  Throws if any element is not a finite number."
  [embedding]
  (doseq [v embedding]
    ;; NaN/Infinity satisfy `number?` but render as SQL literals pgvector chokes on, so require finite.
    (when-not (and (number? v) (Double/isFinite (double v)))
      (throw (ex-info "Embedding contains invalid value" {:invalid-value v}))))
  (str "'[" (str/join ", " embedding) "]'::vector"))

(defn- create-meta-table-sql []
  (-> (sql.helpers/create-table (keyword (meta-table)) 'if-not-exists)
      (sql.helpers/with-columns
        [['id 'smallint ['primary-key] ['default 1] ['check ['= 'id 1]]]
         ['provider 'text 'not-null]
         ['model_name 'text 'not-null]
         ['vector_dimensions 'int 'not-null]
         ['embedding_space_id 'text 'not-null]
         ['schema_version 'int 'not-null]
         ['updated_at 'timestamp-with-time-zone 'not-null]
         ;; Captured immediately before a successful full reconcile reads the appdb. Distinct from updated_at
         ;; (which write-meta! bumps on an empty create/rebuild), so NLQ staleness isn't reset by a rebuild
         ;; that hasn't been reconciled yet. Nullable: null = never reconciled since the (re)build.
         ['reconciled_at 'timestamp-with-time-zone]])
      sql-format-quoted))

(defn- create-vectors-table-sql [dims]
  (-> (sql.helpers/create-table (keyword (vectors-table)) 'if-not-exists)
      (sql.helpers/with-columns
        [['doc_id 'text ['primary-key]]
         ['entity_type 'text 'not-null]
         ['entity_local_id 'bigint 'not-null]
         ['doc_type 'text 'not-null]
         ['doc_text 'text 'not-null]
         ['doc_embedding ['raw (format "vector(%d)" dims)] 'not-null]])
      sql-format-quoted))

(defn- model-identity
  "The part of the meta row that identifies what the vectors table was built for."
  [embedding-model]
  {:provider          (:provider embedding-model)
   :model_name        (:model-name embedding-model)
   :vector_dimensions (:vector-dimensions embedding-model)
   :embedding_space_id (:embedding-space-id embedding-model)
   :schema_version    schema-version})

(defn- meta-column-exists? [tx column]
  (some? (jdbc/execute-one! tx [(str "SELECT 1 FROM pg_attribute"
                                     " WHERE attrelid = to_regclass(?) AND attname = ? AND NOT attisdropped")
                                (meta-table) column])))

(defn- read-meta
  "The meta row shaped like [[model-identity]], or nil when nothing is built.

  A v1 table has no `embedding_space_id` column. Report it as nil instead of failing the SELECT, so the
  identity comparison in [[index-status]] / [[ensure-tables!]] sees the mismatch and schedules the rebuild
  that fills it in."
  [tx]
  (let [space? (meta-column-exists? tx "embedding_space_id")]
    (some->> (jdbc/execute-one! tx
                                [(format (str "SELECT provider, model_name, vector_dimensions, schema_version%s"
                                              " FROM %s WHERE id = 1")
                                         (if space? ", embedding_space_id" "")
                                         (meta-table-sql))]
                                {:builder-fn jdbc.rs/as-unqualified-lower-maps})
             (merge {:embedding_space_id nil}))))

(defn- write-meta! [tx embedding-model]
  (let [{:keys [provider model_name vector_dimensions embedding_space_id schema_version]}
        (model-identity embedding-model)]
    (jdbc/execute! tx
                   (-> (sql.helpers/insert-into (keyword (meta-table)))
                       (sql.helpers/values [{'id                1
                                             'provider          provider
                                             'model_name        model_name
                                             'vector_dimensions vector_dimensions
                                             'embedding_space_id embedding_space_id
                                             'schema_version    schema_version
                                             'updated_at        (Instant/now)}])
                       (sql.helpers/on-conflict 'id)
                       (sql.helpers/do-update-set 'provider 'model_name 'vector_dimensions
                                                  'embedding_space_id 'schema_version 'updated_at)
                       sql-format-quoted))))

(defn- create-tables! [tx dims]
  (jdbc/execute! tx (create-vectors-table-sql dims)))

(defn- table-exists?
  "Whether `table-name` resolves, schema-qualified or on the search path."
  [tx table-name]
  (some? (:exists (jdbc/execute-one! tx ["SELECT to_regclass(?) AS exists" table-name]
                                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- ensure-schema!
  "Create the index's schema. Nothing else creates it: semantic search provisions its own, and library
  retrieval runs without semantic search."
  [tx]
  (when-let [schema (:schema (tables))]
    (try
      (jdbc/execute! tx [(format "CREATE SCHEMA IF NOT EXISTS %s" (semantic.util/quote-ident schema))])
      (catch SQLException e
        (throw (ex-info (format (str "Failed to create the %s schema for the library entity index."
                                     " Grant CREATE on the database to the Metabase user.")
                                schema)
                        {:type ::schema-creation-failed, :schema schema}
                        e))))))

;; TODO (Chris 2026-08-17) -- delete this once no supported upgrade can start from the bare names.
(defn- legacy-table-in-search-path
  "The first table named `table-name` on the effective search path, excluding the current index schema."
  [tx table-name]
  (when-let [schema-name (:schema_name
                          (jdbc/execute-one!
                           tx
                           [(str "SELECT n.nspname AS schema_name"
                                 " FROM unnest(current_schemas(true)) WITH ORDINALITY AS p(schema_name, search_order)"
                                 " JOIN pg_namespace n ON n.nspname = p.schema_name"
                                 " JOIN pg_class c ON c.relnamespace = n.oid"
                                 " WHERE c.relname = ? AND c.relkind IN ('r', 'p') AND n.nspname <> ?"
                                 " ORDER BY p.search_order LIMIT 1")
                            table-name index-schema]
                           {:builder-fn jdbc.rs/as-unqualified-lower-maps}))]
    {:schema-name schema-name :table-name table-name}))

(defn- drop-legacy-tables!
  "Drop an index built before [[index-schema]] and immutable embedding-space identities existed.

  Its vectors have no trustworthy space identity, so they must be rebuilt rather than moved into the
  current schema. A dedicated store only: an app db may contain unrelated application tables with these
  names. Resolve the effective search path, excluding the current index schema, then drop the resolved
  tables by qualified name."
  [tx]
  (when (and (= default-tables (tables))
             (semantic.db.datasource/dedicated-url-configured?))
    (doseq [k [:vectors :meta]]
      (when-let [{:keys [schema-name table-name]} (legacy-table-in-search-path tx (k legacy-tables))]
        (let [legacy-sql (format "%s.%s"
                                 (semantic.util/quote-ident schema-name)
                                 (semantic.util/quote-ident table-name))]
          (log/infof "Dropping incompatible legacy library entity index table %s.%s" schema-name table-name)
          (jdbc/execute! tx [(format "DROP TABLE %s" legacy-sql)]))))))

(defn vectors-table-exists?
  "Whether the configured entity-retrieval vectors table exists."
  [tx]
  (table-exists? tx (vectors-table)))

(defn- can-alter-meta-table? [tx]
  (:owns_table
   (jdbc/execute-one! tx
                      [(str "SELECT pg_has_role(c.relowner, 'USAGE') AS owns_table"
                            " FROM pg_class c WHERE c.oid = to_regclass(?)")
                       (meta-table)]
                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

(defonce ^:private warned-about-missing-reconciled-at (atom #{}))

(defn- warn-about-missing-reconciled-at-once! []
  (let [table (meta-table)
        [warned-before _] (swap-vals! warned-about-missing-reconciled-at conj table)]
    (when-not (contains? warned-before table)
      (log/warnf "Cannot add reconciled_at to %s because the current role does not own it" table))))

(defn- ensure-reconciled-at-column! [tx]
  (or (meta-column-exists? tx "reconciled_at")
      (if (can-alter-meta-table? tx)
        (do
          (jdbc/execute! tx [(format "ALTER TABLE %s ADD COLUMN IF NOT EXISTS reconciled_at timestamp with time zone"
                                     (meta-table-sql))])
          true)
        (do
          ;; An ALTER permission error would abort ensure-tables!'s transaction. Grant-only installations can
          ;; still reconcile; their staleness metric reports the unavailable timestamp as degraded instead.
          (warn-about-missing-reconciled-at-once!)
          false))))

(defn touch-reconciled-at!
  "Record when a successful full reconcile began reading the appdb.

  Uses the pgvector clock and a separate column from `updated_at`, which changes on an empty rebuild. A
  no-op for legacy meta tables the current database role cannot upgrade."
  [tx reconciled-at]
  (when (meta-column-exists? tx "reconciled_at")
    (jdbc/execute! tx [(format "UPDATE %s SET reconciled_at = ? WHERE id = 1"
                               (meta-table-sql))
                       reconciled-at])))

(defn- clear-reconciled-at! [tx]
  (when (meta-column-exists? tx "reconciled_at")
    (jdbc/execute! tx [(format "UPDATE %s SET reconciled_at = NULL WHERE id = 1"
                               (meta-table-sql))])))

(defn- embedding-space-column-state
  "Whether the meta table's `embedding_space_id` column is `:missing`, `:nullable`, or `:not-null`."
  [tx]
  (if-let [row (jdbc/execute-one! tx
                                  [(str "SELECT attnotnull FROM pg_attribute"
                                        " WHERE attrelid = to_regclass(?) AND attname = 'embedding_space_id'"
                                        " AND NOT attisdropped")
                                   (meta-table)]
                                  {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
    (if (:attnotnull row) :not-null :nullable)
    :missing))

(defn- ensure-embedding-space-column!
  "Add `embedding_space_id` to a meta table built before it existed. Returns the column's prior state.

  Unlike `reconciled_at`, this column is load-bearing: [[read-meta]] reads it and [[model-identity]]
  compares it, so a role that cannot add it can never bring the index to a compatible state. Raise a typed
  error naming the ownership problem rather than letting a bare SQLSTATE 42501 abort the caller's
  transaction — [[metabase-enterprise.entity-retrieval.core/retrieval-status]] reports it as `:unreachable`
  and the retrieval tool stops being offered until an admin fixes the grant."
  [tx]
  (let [state (embedding-space-column-state tx)]
    (when (= :missing state)
      (when-not (can-alter-meta-table? tx)
        (throw (ex-info (format (str "Cannot add embedding_space_id to %s: the current role does not own it."
                                     " Grant ownership of the library entity index tables to the Metabase"
                                     " user, or drop them so they can be recreated.")
                                (meta-table))
                        {:type ::embedding-space-upgrade-failed, :table (meta-table)})))
      (jdbc/execute! tx [(format "ALTER TABLE %s ADD COLUMN embedding_space_id TEXT" (meta-table-sql))]))
    state))

(defn index-status
  "Compatibility of the built index against `embedding-model` and [[schema-version]]:
  - `:missing`      no meta row — nothing built
  - `:incompatible` meta row for a different model/schema — rebuild pending
  - `:compatible`   meta row matches; use [[vectors-table-exists?]] when query readiness matters
  Reads the meta table directly, so it throws an undefined-table error before the first [[ensure-tables!]]."
  [pgvector embedding-model]
  (let [meta (read-meta pgvector)]
    (cond
      (nil? meta)                               :missing
      (= meta (model-identity embedding-model)) :compatible
      :else                                     :incompatible)))

(defn ensure-tables!
  "Idempotently create the vectors + meta tables for `embedding-model`, rebuilding on model change.

  When the meta row's model identity (provider, model name, dimensions) or schema version no longer
  matches, the vectors table is dropped and recreated empty — the next reconcile re-embeds every row.
  Serialized across nodes with an advisory lock.
  Returns :created (the vectors table was just created empty — first build, or healing a manual drop),
  :rebuilt (dropped and recreated empty for a model/format change), or :ok (already present, untouched).
  A caller doing a targeted reconcile must treat :created and :rebuilt alike: both leave an empty table
  that a one-entity write can't fill."
  [pgvector embedding-model]
  (jdbc/with-transaction [tx pgvector]
    (jdbc/execute! tx [(format "SELECT pg_advisory_xact_lock(%d)" ensure-lock-id)])
    (jdbc/execute! tx (sql/format (sql.helpers/create-extension 'vector 'if-not-exists)))
    (ensure-schema! tx)
    ;; Before any CREATE below: remove the pre-embedding-space tables whose vectors cannot be trusted.
    (drop-legacy-tables! tx)
    (jdbc/execute! tx (create-meta-table-sql))
    ;; CREATE TABLE IF NOT EXISTS does not add columns to an existing table. Upgrade when this role owns it;
    ;; grant-only roles keep reconciling without the optional freshness timestamp.
    (ensure-reconciled-at-column! tx)
    (let [space-column (ensure-embedding-space-column! tx)
          stored       (read-meta tx)
          current      (model-identity embedding-model)
          dims         (:vector_dimensions current)
          result       (cond
                         (nil? stored)
                         (do (create-tables! tx dims)
                             (write-meta! tx embedding-model)
                             :created)

                         (not= stored current)
                         (do (jdbc/execute! tx [(format "DROP TABLE IF EXISTS %s"
                                                        (vectors-table-sql))])
                             (create-tables! tx dims)
                             (write-meta! tx embedding-model)
                             :rebuilt)

                         :else
                         ;; Meta matches. Re-issue the IF NOT EXISTS DDL so a manually dropped vectors table
                         ;; heals itself, and report :created when it had actually gone missing — the recreated
                         ;; table is empty, so a targeted reconcile must repopulate the whole library rather
                         ;; than fill it with one entity.
                         (let [existed? (vectors-table-exists? tx)]
                           (create-tables! tx dims)
                           (if existed? :ok :created)))]
      ;; Any empty (re)build invalidates reconciled_at: the table is empty until a full reconcile repopulates
      ;; it, and neither write-meta! (:rebuilt) nor the heal branch touches reconciled_at, so a prior build's
      ;; timestamp would linger and make NLQ staleness read fresh over an empty/incomplete index. Clear it;
      ;; touch-reconciled-at! (converged reconciles only) sets it again once the index is actually verified.
      (when (not= result :ok)
        (clear-reconciled-at! tx))
      ;; Every row carries a space id by now — the mismatch above forced the rebuild that wrote it — so the
      ;; constraint can go on. SET NOT NULL takes an ACCESS EXCLUSIVE lock and needs ownership, so skip it
      ;; when it is already there or the role cannot alter the table; the identity compare, not the
      ;; constraint, is what keeps a stale index from being served.
      (when (and (not= :not-null space-column)
                 (can-alter-meta-table? tx))
        (jdbc/execute! tx [(format "ALTER TABLE %s ALTER COLUMN embedding_space_id SET NOT NULL"
                                   (meta-table-sql))]))
      result)))
