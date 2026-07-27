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
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def app-db-schema
  "Schema holding the library entity index when it shares the application database.
  Not semantic search's: [[metabase-enterprise.semantic-search.db.migration.impl]] wipes that one wholesale."
  "library_retrieval")

;; TODO (Chris 2026-07-14) -- these names carry no version, so an on-disk upgrade has nothing to key off.
;; Revisit when the semantic-search indexing mechanism is reworked, sharing its scheme.
(def default-tables
  "Table names for a dedicated pgvector database (MB_PGVECTOR_DB_URL)."
  {:vectors "library_entity_index"
   :meta    "library_entity_index_meta"})

(def app-db-tables
  "Table names when the index shares the application database, qualified so nothing here can resolve
  against an application table."
  {:schema  app-db-schema
   :vectors (str app-db-schema ".library_entity_index")
   :meta    (str app-db-schema ".library_entity_index_meta")})

(def ^:dynamic *tables*
  "Table names to use, or nil to derive them from the pgvector mode. Bound by tests to isolated names."
  nil)

(defn tables
  "[[default-tables]] or [[app-db-tables]], per the pgvector mode. Resolved per use: the mode can change
  without a restart."
  []
  (or *tables*
      (if (= :app-db (semantic.db.datasource/pgvector-mode))
        app-db-tables
        default-tables)))

(defn vectors-table
  "Name of the vectors table, schema-qualified in app-db mode.
  For raw SQL use [[vectors-table-sql]]: interpolated into `\"%s\"`, a qualified name reads as one
  identifier."
  []
  (:vectors (tables)))

(defn meta-table
  "Name of the meta table, schema-qualified in app-db mode. For raw SQL use [[meta-table-sql]]."
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
  "Canonical version of the index's *document format* — both the vectors table schema and the
  doc-derivation contract (doc_id scheme, doc_type set, doc_text source, dedup/key rules).
  It's part of the meta row's [[model-identity]], so bumping it makes [[ensure-tables!]] drop and rebuild
  the vectors table; the post-upgrade startup reconcile then repopulates from the appdb under the new
  format. Bump on ANY format-affecting change in [[metabase-enterprise.entity-retrieval.reconcile]] or
  the table schema: a vectors-table column/type change, a new or renamed doc_type, a changed doc_text
  source, or a changed doc_id / dedup / key scheme — anything that makes old rows incomparable to newly
  derived desired docs. A bump forces a full re-embed of the library on every instance at upgrade, so do
  it only when the format truly moved, never as a refresh convenience."
  ;; v1 — initial schema.
  1)

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
  (-> (sql.helpers/create-table (keyword (meta-table)) :if-not-exists)
      (sql.helpers/with-columns
        [[:id :smallint [:primary-key] [:default 1] [:check [:= :id 1]]]
         [:provider :text :not-null]
         [:model_name :text :not-null]
         [:vector_dimensions :int :not-null]
         [:schema_version :int :not-null]
         [:updated_at :timestamp-with-time-zone :not-null]
         ;; Captured immediately before a successful full reconcile reads the appdb. Distinct from updated_at
         ;; (which write-meta! bumps on an empty create/rebuild), so NLQ staleness isn't reset by a rebuild
         ;; that hasn't been reconciled yet. Nullable: null = never reconciled since the (re)build.
         [:reconciled_at :timestamp-with-time-zone]])
      sql-format-quoted))

(defn- create-vectors-table-sql [dims]
  (-> (sql.helpers/create-table (keyword (vectors-table)) :if-not-exists)
      (sql.helpers/with-columns
        [[:doc_id :text [:primary-key]]
         [:entity_type :text :not-null]
         [:entity_local_id :bigint :not-null]
         [:doc_type :text :not-null]
         [:doc_text :text :not-null]
         [:doc_embedding [:raw (format "vector(%d)" dims)] :not-null]])
      sql-format-quoted))

(defn- model-identity
  "The part of the meta row that identifies what the vectors table was built for."
  [embedding-model]
  {:provider          (:provider embedding-model)
   :model_name        (:model-name embedding-model)
   :vector_dimensions (:vector-dimensions embedding-model)
   :schema_version    schema-version})

(defn- read-meta [tx]
  (jdbc/execute-one! tx
                     [(format "SELECT provider, model_name, vector_dimensions, schema_version FROM %s WHERE id = 1"
                              (meta-table-sql))]
                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- write-meta! [tx embedding-model]
  (let [{:keys [provider model_name vector_dimensions schema_version]} (model-identity embedding-model)]
    (jdbc/execute! tx
                   (-> (sql.helpers/insert-into (keyword (meta-table)))
                       (sql.helpers/values [{:id                1
                                             :provider          provider
                                             :model_name        model_name
                                             :vector_dimensions vector_dimensions
                                             :schema_version    schema_version
                                             :updated_at        (Instant/now)}])
                       (sql.helpers/on-conflict :id)
                       (sql.helpers/do-update-set :provider :model_name :vector_dimensions
                                                  :schema_version :updated_at)
                       sql-format-quoted))))

(defn- create-tables! [tx dims]
  (jdbc/execute! tx (create-vectors-table-sql dims)))

(defn- ensure-schema!
  "Create the app-db schema; a no-op for a dedicated store.
  Nothing else creates it: semantic search provisions its own, and library retrieval runs without it."
  [tx]
  (when-let [schema (:schema (tables))]
    (jdbc/execute! tx [(format "CREATE SCHEMA IF NOT EXISTS %s" (semantic.util/quote-ident schema))])))

(defn vectors-table-exists?
  "Whether the configured entity-retrieval vectors table exists."
  [tx]
  ;; to_regclass takes a string literal, so a qualified name is valid input.
  (some? (:exists (jdbc/execute-one! tx [(format "SELECT to_regclass('%s') AS exists" (vectors-table))]
                                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- meta-column-exists? [tx column]
  (some? (jdbc/execute-one! tx [(str "SELECT 1 FROM pg_attribute"
                                     " WHERE attrelid = to_regclass(?) AND attname = ? AND NOT attisdropped")
                                (meta-table) column])))

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
    (jdbc/execute! tx (sql/format (sql.helpers/create-extension :vector :if-not-exists)))
    (ensure-schema! tx)
    (jdbc/execute! tx (create-meta-table-sql))
    ;; CREATE TABLE IF NOT EXISTS does not add columns to an existing table. Upgrade when this role owns it;
    ;; grant-only roles keep reconciling without the optional freshness timestamp.
    (ensure-reconciled-at-column! tx)
    (let [stored  (read-meta tx)
          current (model-identity embedding-model)
          dims    (:vector_dimensions current)
          result  (cond
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
                    ;; table is empty, so a targeted reconcile must repopulate the whole library rather than
                    ;; fill it with one entity.
                    (let [existed? (vectors-table-exists? tx)]
                      (create-tables! tx dims)
                      (if existed? :ok :created)))]
      ;; Any empty (re)build invalidates reconciled_at: the table is empty until a full reconcile repopulates
      ;; it, and neither write-meta! (:rebuilt) nor the heal branch touches reconciled_at, so a prior build's
      ;; timestamp would linger and make NLQ staleness read fresh over an empty/incomplete index. Clear it;
      ;; touch-reconciled-at! (converged reconciles only) sets it again once the index is actually verified.
      (when (not= result :ok)
        (clear-reconciled-at! tx))
      result)))
