(ns metabase-enterprise.curated-search.index-table
  "Lifecycle of the pgvector tables backing the library entity index.

  Two tables live in the pgvector store:

  - the vectors table (`library_entity_index`): many rows per library entity — one *embedded* document
    per value (the entity's name, its description, each ai_context synonym, each ai_context example).
    Each row carries `doc_embedding`, the `doc_text` it was embedded from, flat `entity_type` /
    `entity_local_id` columns, and the entity's `instructions` (carried, not embedded). The primary key
    `doc_id` is content-addressed over the embedded text (see [[reconcile]]), so a text edit mints a new
    row and the reconciler GCs the old one.
  - a single-row meta table recording the embedding model identity and schema version the vectors table
    was built for.

  There is deliberately no HNSW index: search orders by similarity over a small curated set, an exact
  scan is microseconds, and the per-entity dedup happens in app code rather than SQL.

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
  "Version of the vectors table schema.
  Bump it to force a drop-and-rebuild on instances whose meta row records an older version."
  ;; 2: dropped the HNSW index.
  ;; 3: per-value docs — content-addressed doc_id PK; flat entity_type/entity_local_id/doc_type/doc_text/
  ;;    instructions columns replace the old 1-row-per-entry shape.
  3)

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
         [:updated_at :timestamp-with-time-zone :not-null]])
      sql-format-quoted))

(defn- create-vectors-table-sql [dims]
  (-> (sql.helpers/create-table (keyword *vectors-table*) :if-not-exists)
      (sql.helpers/with-columns
        ;; doc_id = base64(sha1("entity_type|entity_local_id|doc_type|doc_text")) — content-addresses the
        ;; embedded text only (instructions is excluded so an instructions edit never re-embeds).
        [[:doc_id :text [:primary-key]]
         [:entity_type :text :not-null]
         [:entity_local_id :bigint :not-null]
         [:doc_type :text :not-null]
         [:doc_text :text :not-null]
         ;; The entity's ai_context instructions, denormalized onto every one of its docs; carried, not
         ;; embedded. Nullable — most library entities have no ai_context.
         [:instructions :text]
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
  (jdbc/execute-one! tx [(format "SELECT provider, model_name, vector_dimensions, schema_version FROM \"%s\" WHERE id = 1" *meta-table*)]
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

(defn- create-tables! [tx dims]
  (jdbc/execute! tx (create-vectors-table-sql dims)))

(defn ensure-tables!
  "Idempotently create the vectors + meta tables for `embedding-model`, rebuilding on model change.

  When the meta row's model identity (provider, model name, dimensions) or schema version no longer
  matches, the vectors table is dropped and recreated empty — the next reconcile re-embeds every row.
  Serialized across nodes with an advisory lock. Returns :created, :rebuilt or :ok."
  [pgvector embedding-model]
  (jdbc/with-transaction [tx pgvector]
    (jdbc/execute! tx [(format "SELECT pg_advisory_xact_lock(%d)" ensure-lock-id)])
    (jdbc/execute! tx (sql/format (sql.helpers/create-extension :vector :if-not-exists)))
    (jdbc/execute! tx (create-meta-table-sql))
    (let [stored  (read-meta tx)
          current (model-identity embedding-model)
          dims    (:vector_dimensions current)]
      (cond
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
        ;; Re-issue the IF NOT EXISTS DDL so a manually dropped vectors table heals itself.
        (do (create-tables! tx dims)
            :ok)))))
