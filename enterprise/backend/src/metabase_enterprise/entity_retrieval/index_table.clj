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
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:dynamic *vectors-table*
  "Vectors table name. Dynamic so tests can rebind it to an isolated table."
  "library_entity_index")

(def ^:dynamic *meta-table*
  "Meta table name. Dynamic so tests can rebind it to an isolated table."
  "library_entity_index_meta")

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
  (-> (sql.helpers/create-table (keyword *meta-table*) :if-not-exists)
      (sql.helpers/with-columns
        [[:id :smallint [:primary-key] [:default 1] [:check [:= :id 1]]]
         [:provider :text :not-null]
         [:model_name :text :not-null]
         [:vector_dimensions :int :not-null]
         [:schema_version :int :not-null]
         [:updated_at :timestamp-with-time-zone :not-null]
         ;; When a full reconcile last verified the index against the appdb. Distinct from updated_at (which
         ;; write-meta! bumps on an empty create/rebuild), so NLQ staleness isn't reset by a rebuild that
         ;; hasn't been reconciled yet. Nullable: null = never reconciled since the (re)build.
         [:reconciled_at :timestamp-with-time-zone]])
      sql-format-quoted))

(defn- create-vectors-table-sql [dims]
  (-> (sql.helpers/create-table (keyword *vectors-table*) :if-not-exists)
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
                     [(format "SELECT provider, model_name, vector_dimensions, schema_version FROM \"%s\" WHERE id = 1"
                              *meta-table*)]
                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- write-meta! [tx embedding-model]
  (let [{:keys [provider model_name vector_dimensions schema_version]} (model-identity embedding-model)]
    (jdbc/execute! tx
                   (-> (sql.helpers/insert-into (keyword *meta-table*))
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

(defn touch-reconciled-at!
  "Set the meta row's `reconciled_at` to the pgvector clock, recording that a full reconcile just verified the
  index against the appdb. Read by the NLQ staleness health metric as a 'time since the index was last
  confirmed fresh' bound. Deliberately NOT `updated_at`, which write-meta! bumps on an empty create/rebuild --
  that would read as fresh before anything was reconciled. A no-op before the meta row exists."
  [tx]
  (jdbc/execute! tx [(format "UPDATE \"%s\" SET reconciled_at = now() WHERE id = 1" *meta-table*)]))

(defn- clear-reconciled-at!
  "Null the meta row's `reconciled_at`, marking the index as not-reconciled-since-(re)build. A no-op before the
  meta row exists (and harmless when already null)."
  [tx]
  (jdbc/execute! tx [(format "UPDATE \"%s\" SET reconciled_at = NULL WHERE id = 1" *meta-table*)]))

(defn- create-tables! [tx dims]
  (jdbc/execute! tx (create-vectors-table-sql dims)))

(defn- vectors-table-exists? [tx]
  (some? (:exists (jdbc/execute-one! tx [(format "SELECT to_regclass('%s') AS exists" *vectors-table*)]
                                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn index-compatible?
  "Whether the meta row matches `embedding-model` and the current [[schema-version]] — i.e. the vectors
  table holds embeddings the configured model can be queried against.
  False when the meta row is missing or describes a different provider/model/dimensions/format, meaning the
  index is stale and a rebuild is still pending; the same comparison [[ensure-tables!]] uses to decide a
  rebuild.
  Reads the meta table directly, so a caller must guard against the table not existing yet (it throws a SQL
  error before the first [[ensure-tables!]] of the process)."
  [pgvector embedding-model]
  (= (read-meta pgvector) (model-identity embedding-model)))

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
    (jdbc/execute! tx (create-meta-table-sql))
    ;; Backfill reconciled_at onto meta tables created before it existed (create-table IF NOT EXISTS won't add
    ;; a column to an existing table). Idempotent.
    (jdbc/execute! tx [(format "ALTER TABLE \"%s\" ADD COLUMN IF NOT EXISTS reconciled_at timestamp with time zone"
                               *meta-table*)])
    (let [stored  (read-meta tx)
          current (model-identity embedding-model)
          dims    (:vector_dimensions current)
          result  (cond
                    (nil? stored)
                    (do (create-tables! tx dims)
                        (write-meta! tx embedding-model)
                        :created)

                    (not= stored current)
                    (do (jdbc/execute! tx [(format "DROP TABLE IF EXISTS \"%s\"" *vectors-table*)])
                        (create-tables! tx dims)
                        (write-meta! tx embedding-model)
                        :rebuilt)

                    :else
                    ;; Meta matches. Re-issue the IF NOT EXISTS DDL so a manually dropped vectors table heals
                    ;; itself, and report :created when it had actually gone missing — the recreated table is
                    ;; empty, so a targeted reconcile must repopulate the whole library rather than fill it
                    ;; with one entity.
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
