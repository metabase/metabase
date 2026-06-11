(ns metabase.models.serialization.resolve.mp
  "Metadata-provider-backed implementations of the serdes resolver protocols.

  Unlike `metabase.models.serialization.resolve.db`, this resolver does not touch toucan2 /
  the application database for *warehouse-schema* lookups (tables, fields) - it works off a
  `lib.metadata/MetadataProvider`, which may be the live application-DB-backed provider, a
  test-only mock provider, or any cached variant.

  It does, however, touch the application DB for *Metabase-model* lookups (cards by
  `entity_id`, etc.) because the lib metadata protocol doesn't support filtering by
  `entity_id`, and cards in any case live in the application DB independently of whose
  warehouse the metadata provider points at.

  Primary consumer: the agent-lib representations pipeline, which converts LLM-authored
  portable MBQL queries (with FK paths like `[DB, SCHEMA, TABLE, FIELD]`) into numeric-ID
  MBQL suitable for `lib.query/query` / the QP.

  Implemented scope for the representations pipeline:
    * `import-table-fk`, `import-field-fk`, `export-table-fk`, `export-field-fk` for
      warehouse metadata.
    * `import-fk-keyed` / `export-fk-keyed` for `:model/Database` by `:name`.
    * `import-fk` for `Card` / `:model/Card` by `entity_id` (source-card and metric refs).
    * `export-fk` for `Card` / `:model/Card` by `entity_id` (exporting final pMBQL back to
      portable representations YAML).

  Everything else throws `:not-implemented-yet` for now.

  Asset vs metadata split:
    The resolver has two orthogonal lookup responsibilities:
      * **Warehouse metadata** (databases, tables, fields) is resolved through a
        `lib.metadata/MetadataProvider`.
      * **Metabase content / assets** (cards, snippets, segments, …) is resolved through a
        [[ContentStore]] on import, where callers may need permission-aware lookups. Exporting
        card ids uses the same database-scoped metadata provider, which already contains card
        metadata in app-backed and mock-provider contexts. The default app-DB-backed store goes
        through `serdes/lookup-by-id`, but a different store (e.g. backed by the checker's YAML
        index, an in-memory test fixture, or a snapshot) can be supplied to make import usable
        without an application database."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.serialization :as serdes]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.util.i18n :refer [tru]]
   [potemkin.types :as p.types]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Helpers
;;; ============================================================

(defn- db-name [metadata-provider]
  (:name (lib.metadata/database metadata-provider)))

(defn- matching-tables-via-provider
  "Return active tables matching `table-name` in `metadata-provider`, post-filtered by `schema`
  (`schema` may be `nil` for schemaless databases).

  Used as a fallback for mock and checker providers. NOT safe for production: the
  application's cached metadata provider keys its by-name cache on `[type :name k]` with
  `:schema` dropped, so two warehouse tables sharing a `name` across schemas collapse to
  whichever one wrote the cache entry last. The schema post-filter here then yields 0
  candidates for the loser's schema. App-DB-backed callers must use
  [[matching-tables-via-app-db]]."
  [metadata-provider schema table-name]
  (->> (lib.metadata.protocols/metadatas metadata-provider
                                         {:lib/type :metadata/table
                                          :name     #{table-name}})
       ;; By-name lookups skip the provider's SQL `active = true` filter (it only guards
       ;; enumerate-all queries), so inactive rows reach here. `false?` keeps mocks with no
       ;; `:active` key.
       (filter #(and (= (:schema %) schema)
                     (not (false? (:active %)))))))

(defn- matching-tables-via-app-db
  "Return all tables matching the `(db-id, schema, table-name)` triple by direct application-DB
  query — same shape `resolve.db/import-table-fk` has always used. Bypasses the metadata
  provider entirely.

  Returns inactive rows too: the app DB is authoritative for *existence*, and
  [[table-candidates]] needs to tell \"no row at all\" (fall back to the provider) apart from
  \"only inactive rows\" (an authoritative miss). It does the `:active` filtering itself.

  Defective `(db_id, schema, name)` duplicates (allowed by the
  `001_update_migrations.yaml` `is_defective_duplicate` carve-out for pre-constraint rows)
  return more than one candidate so [[find-table]] can raise `:ambiguous-table`."
  [db-id schema table-name]
  (t2/select :metadata/table :db_id db-id :schema schema :name table-name))

(defn- app-db-backed-provider?
  "True when `metadata-provider` is part of the production app-DB-backed wrapper chain
  (`InvocationTracker → CachedProxyMetadataProvider → UncachedApplicationDatabaseMetadataProvider`).

  Mocks built via `lib.tu/mock-metadata-provider` don't extend `CachedMetadataProvider` and
  correctly return `false` here. The rare test that wraps a mock in `cached-metadata-provider`
  will return `true` — callers must treat the app-DB result as authoritative only when it's
  non-empty and otherwise fall back to the provider so that wrapped-mock case still resolves."
  [metadata-provider]
  (and (lib.metadata.protocols/cached-metadata-provider? metadata-provider)
       (mdb/db-is-set-up?)))

(defn- unknown-table-ex-info
  "Build an agent-facing `:unknown-table` error for a miss on portable FK
  `[db schema name]`.

  Deliberately does NOT enumerate schemas, sibling tables, or fuzzy candidates. The metadata
  provider here is un-sandboxed (it exposes every table in the warehouse regardless of the
  caller's data perms), and any string included in this ex-info message is relayed verbatim
  to the LLM via `:agent-error? true`, and from there to the end user. A sandboxed user who
  prompts the agent with a hallucinated `source-table:` would otherwise receive a list of
  schemas / tables they cannot otherwise see.

  For the same reason this single message covers both a never-existed miss and an inactive
  match — [[table-candidates]] drops inactive rows upstream, so both reach [[find-table]] as 0
  candidates. Branching the wording on whether an inactive row exists would be an existence
  oracle, so both get this identical message.

  The LLM can still self-correct in one turn by calling `entity_details` on the parent
  database; the message points it at that path."
  [_metadata-provider [_path-db-name _path-schema _path-table-name :as path]]
  (ex-info (tru "No table found matching portable FK {0}. Call `entity_details` with entity-type `database` and the database''s numeric id to list available tables and schemas, then retry with an exact portable FK from the response."
                (pr-str path))
           {:status-code  400
            :error        :unknown-table
            :agent-error? true
            :path         path}))

(defn- table-candidates
  "Resolve `(schema, table-name)` against `metadata-provider`, returning only active tables.

  For app-DB-backed providers the app DB is authoritative for existence. If
  [[matching-tables-via-app-db]] finds any row for the triple, we return just the active ones:
  an inactive-only match is an authoritative 0-candidate miss, NOT a reason to fall back. The
  fallback must not run here — the provider's by-name cache can hold a stale `:active true`
  row from before the table was deleted / re-uploaded (BOT-739-adjacent), and falling back
  would resurrect it.

  We fall back to [[matching-tables-via-provider]] only when the app DB has no row for the
  triple at all (or the provider isn't app-DB-backed): vanilla mocks (no
  `CachedMetadataProvider`, skip the app-DB attempt entirely), wrapped mocks with synthetic db
  ids that don't exist as `metabase_database` rows, and the rare production case where the
  provider's cache holds a table the app DB has fully dropped. In that last case the
  provider's view becomes authoritative, since the alternative is a confusing `:unknown-table`
  raised for a table the caller can plainly see via `entity_details`."
  [metadata-provider db-id schema table-name]
  (if-let [app-db-rows (and db-id
                            (app-db-backed-provider? metadata-provider)
                            (seq (matching-tables-via-app-db db-id schema table-name)))]
    (filter :active app-db-rows)
    (matching-tables-via-provider metadata-provider schema table-name)))

(defn- find-table
  "Resolve `[db-name, schema, table-name]` to a `:metadata/table` or throw with context.

  On miss, the thrown ex-info carries actionable, tiered hints (see
  [[unknown-table-ex-info]]) so the LLM can self-correct on the next turn instead of
  re-hallucinating the same bad path. All error branches are marked
  `:agent-error? true` so the outer tool wrapper relays the message verbatim.

  Inactive (`:active false`) tables are dropped by [[table-candidates]], so a stale FK to one
  surfaces here as a 0-candidate miss."
  [metadata-provider [path-db-name path-schema path-table-name :as path]]
  (let [{current-db :name, current-db-id :id} (lib.metadata/database metadata-provider)]
    (when-not (= path-db-name current-db)
      (throw (ex-info (tru "Portable table FK references database {0}, but metadata provider is for {1}."
                           (pr-str path-db-name)
                           (pr-str current-db))
                      {:status-code  400
                       :error        :unknown-table
                       :agent-error? true
                       :path         path
                       :expected-db  current-db})))
    (let [candidates (table-candidates metadata-provider current-db-id path-schema path-table-name)]
      (case (count candidates)
        0 (throw (unknown-table-ex-info metadata-provider path))
        1 (first candidates)
        ;; Deliberately do NOT enumerate the matching `[schema name id]` tuples — the metadata
        ;; provider is un-sandboxed, so a leaked candidate list could surface tables the caller
        ;; cannot otherwise see (parity with the `unknown-table-ex-info` strip above).
        (throw (ex-info (tru "Ambiguous portable table FK {0}: {1} candidates. Call `entity_details` with entity-type `database` to list available tables and retry with a more specific portable FK."
                             (pr-str path) (count candidates))
                        {:status-code  400
                         :error        :ambiguous-table
                         :agent-error? true
                         :path         path}))))))

(defn- find-field
  "Resolve a field path `[db schema table field …]` to a `:metadata/column` or throw with context.

  For regular (non-JSON-unfolded) fields, the path has exactly 4 elements and we match on name
  directly. For JSON-unfolded paths (5+ elements), we walk parent/child via `:parent-id` -
  matching the behaviour of `serdes/recursively-find-field-q`."
  [metadata-provider [db schema table-name & field-path :as full-path]]
  (when (empty? field-path)
    (throw (ex-info (tru "Portable field FK {0} must have at least 4 elements." (pr-str full-path))
                    {:status-code 400
                     :error       :invalid-field-fk
                     :path        full-path})))
  (let [table-meta (find-table metadata-provider [db schema table-name])
        columns    (lib.metadata.protocols/metadatas-for-table metadata-provider
                                                               :metadata/column
                                                               (:id table-meta))
        ;; Deliberately do NOT enumerate FK-linked tables that happen to carry the same
        ;; column name. The metadata provider is un-sandboxed, the `:agent-error?` flag
        ;; relays this message verbatim to the user, and a leaked FK-candidate path would
        ;; reveal table names the caller may not be permitted to see. The LLM can recover
        ;; by calling `entity_details` on the parent table to list its columns.
        unknown-field-ex
        (fn [segment]
          (ex-info (tru "No column {0} on table {1}.{2}.{3}. Call `entity_details` on this table to list its columns."
                        (pr-str segment) (pr-str db) (pr-str schema) (pr-str table-name))
                   {:status-code  400
                    :error        :unknown-field
                    :path         full-path
                    :segment      segment
                    :table-id     (:id table-meta)
                    :agent-error? true}))
        ;; Walk nested fields parent-first. At each level, match `:name` and `:parent-id`.
        walk       (fn walk [parent-id [segment & more]]
                     (let [candidates (filter #(and (= (:name %) segment)
                                                    (= (:parent-id %) parent-id))
                                              columns)]
                       (case (count candidates)
                         0 (throw (unknown-field-ex segment))
                         1 (let [col (first candidates)]
                             (if (seq more)
                               (walk (:id col) more)
                               col))
                         (throw (ex-info (tru "Ambiguous column {0} on table {1}.{2}.{3}."
                                              (pr-str segment)
                                              (pr-str db)
                                              (pr-str schema)
                                              (pr-str table-name))
                                         {:status-code 400
                                          :error       :ambiguous-field
                                          :path        full-path
                                          :segment     segment
                                          :candidates  (mapv :id candidates)})))))]
    (walk nil field-path)))

(defn outbound-fks-from-table
  "Return a sequence of FK edges leaving `source-table-id` in `metadata-provider`.

  Each entry is a map with:
    * `:source-field-id`           numeric id of the FK field on the source table;
    * `:source-field`              the full column metadata (convenient for portable-FK export);
    * `:target-field-id`           numeric id of the target field pointed to;
    * `:target-table-id`           numeric id of the target table.

  Uses `lib.metadata.protocols/metadatas-for-table` and `lib.metadata.protocols/field` directly
  (not the `mu/defn`-wrapped accessors) so that missing target-field lookups degrade to `nil`
  rather than throwing Malli errors."
  [metadata-provider source-table-id]
  (->> (lib.metadata.protocols/metadatas-for-table metadata-provider :metadata/column source-table-id)
       (keep (fn [col]
               (when-let [tgt-id (:fk-target-field-id col)]
                 (when-let [tgt (lib.metadata.protocols/field metadata-provider tgt-id)]
                   {:source-field-id  (:id col)
                    :source-field     col
                    :target-field-id  tgt-id
                    :target-table-id  (:table-id tgt)}))))
       vec))

(defn- export-field-path
  "Build the portable FK path for a field, including any JSON-unfolded parent chain."
  [metadata-provider field]
  (let [table (lib.metadata.protocols/table metadata-provider (:table-id field))
        ;; Walk parent chain upward, then reverse to get root -> leaf order.
        chain (loop [acc [(:name field)]
                     pid (:parent-id field)]
                (if pid
                  (let [parent (lib.metadata.protocols/field metadata-provider pid)]
                    (recur (cons (:name parent) acc) (:parent-id parent)))
                  acc))]
    (into [(db-name metadata-provider) (:schema table) (:name table)] chain)))

;;; ============================================================
;;; Content store - Metabase asset lookups (cards, etc.) by portable id
;;; ============================================================

(p.types/defprotocol+ ContentStore
  "Lookup of Metabase content (\"assets\") by portable id.

  Kept separate from the warehouse-metadata `MetadataProvider` so the resolver can be reused in
  contexts without an application database (e.g. the serdes checker, in-memory tests)."
  (card-by-entity-id [this entity-id]
    "Return the card row for the given portable `entity_id`, or nil. The returned map must at
    least carry `:id` and `:database_id` so the resolver can perform cross-database checks.")
  (measure-by-entity-id [this entity-id]
    "Return the measure row for the given portable `entity_id`, or nil. The returned map must
    at least carry `:id` and `:table_id` so the resolver can perform cross-database checks via
    the metadata provider.")
  (segment-by-entity-id [this entity-id]
    "Return the segment row for the given portable `entity_id`, or nil. Same contract as
    `measure-by-entity-id`.")
  (measure-by-id [this measure-id]
    "Return the measure row for the given numeric id, or nil. Same contract as
    `measure-by-entity-id`; used by the export direction (`[:measure {} <id>]` →
    `[:measure {} \"<entity_id>\"]`). The returned map must carry `:entity_id` (or
    `:entity-id`) and `:table_id` (or `:table-id`).")
  (segment-by-id [this segment-id]
    "Return the segment row for the given numeric id, or nil. Same contract as
    `measure-by-id`."))

(def unchecked-app-db-content-store
  "**Unchecked.** No `api/read-check`; appropriate for serdes import / background tasks /
  tests / dev REPL only. **Any HTTP or tool path that runs under an authenticated user must
  wrap this with `metabase.metabot.tools.shared.content-store/read-checked`** (or use
  `shared.content-store/default-store`, which is the wrapped form).

  Default [[ContentStore]] backed by the Metabase application database via
  `serdes/lookup-by-id`. Use this in production code paths that already have an app DB; pass a
  different store implementation when running without one (checker, isolated tests).

  Gated on [[resolve/entity-id?]]: `serdes/lookup-by-id` falls through to a full-table scan via
  `find-by-identity-hash` for non-NanoID strings. LLM-authored entity-id values are untrusted,
  so anything that isn't a 21-char NanoID short-circuits to `nil` and the caller surfaces a
  clear `:unknown-…` agent error."
  (reify ContentStore
    (card-by-entity-id [_ entity-id]
      (when (resolve/entity-id? entity-id)
        (serdes/lookup-by-id 'Card entity-id)))
    (measure-by-entity-id [_ entity-id]
      (when (resolve/entity-id? entity-id)
        (serdes/lookup-by-id 'Measure entity-id)))
    (segment-by-entity-id [_ entity-id]
      (when (resolve/entity-id? entity-id)
        (serdes/lookup-by-id 'Segment entity-id)))
    (measure-by-id [_ measure-id]
      (when measure-id
        (t2/select-one [:model/Measure :id :entity_id :table_id] :id measure-id)))
    (segment-by-id [_ segment-id]
      (when segment-id
        (t2/select-one [:model/Segment :id :entity_id :table_id] :id segment-id)))))

;;; ============================================================
;;; Resolver implementations
;;; ============================================================

(defn- not-implemented! [method]
  (throw (ex-info (tru "{0} is not implemented for the metadata-provider-backed resolver in Phase 1."
                       (name method))
                  {:status-code 501
                   :error       :not-implemented-yet
                   :method      method})))

(defn- import-database-by-name
  "Resolve a database by its portable name (a string) to a numeric id."
  [metadata-provider db-name-value]
  (let [current-name (db-name metadata-provider)
        current-id   (:id (lib.metadata/database metadata-provider))]
    (if (= db-name-value current-name)
      current-id
      (throw (ex-info (tru "Portable database reference {0} does not match metadata provider database {1}."
                           (pr-str db-name-value) (pr-str current-name))
                      {:status-code 400
                       :error       :unknown-database
                       :database    db-name-value
                       :expected-db current-name})))))

(defn- export-database-name
  "Resolve the current database's numeric id back to its portable name."
  [metadata-provider database-id]
  (when database-id
    (let [current-db (lib.metadata/database metadata-provider)]
      (if (= database-id (:id current-db))
        (:name current-db)
        (throw (ex-info (tru "Cannot export database id {0}: metadata provider is for database id {1}."
                             database-id (:id current-db))
                        {:status-code 400
                         :error       :unknown-database-id
                         :database-id database-id
                         :expected-id (:id current-db)}))))))

(defn- card-model? [model]
  (or (= model 'Card) (= model :model/Card)))

(defn- measure-model? [model]
  (or (= model 'Measure) (= model :model/Measure)))

(defn- segment-model? [model]
  (or (= model 'Segment) (= model :model/Segment)))

(defn- table-belongs-to-current-database?
  "True when the table with `table-id` is known to the metadata provider — measures and segments
  are scoped to a table, so this is the cross-database guard for measure/segment refs. Returns
  the table when found so callers can pull its `:db-id` for error messages."
  [metadata-provider table-id]
  (when table-id
    (lib.metadata.protocols/table metadata-provider table-id)))

(defn- export-card-by-id
  "Resolve a saved question / model / metric by numeric id to its portable `entity_id`.

  Uses the metadata provider rather than the generic app-DB serdes resolver so exporting a
  final pMBQL query can stay paired with the same database-scoped provider used for table and
  field FK export. Guards against accidental cross-database card refs."
  [metadata-provider card-id]
  (when card-id
    (let [current-db-id (:id (lib.metadata/database metadata-provider))
          card          (lib.metadata.protocols/card metadata-provider card-id)
          card-db-id    (or (:database-id card) (:database_id card))
          entity-id     (or (:entity-id card) (:entity_id card))]
      (cond
        (nil? card)
        (throw (ex-info (tru "No saved question, model, or metric found with id {0} in metadata provider." card-id)
                        {:status-code 400
                         :error       :unknown-card-id
                         :card-id     card-id}))

        (not= card-db-id current-db-id)
        (throw (ex-info (tru "Saved question / model / metric id {0} belongs to database {1}, but this resolver targets database {2}."
                             card-id card-db-id current-db-id)
                        {:status-code      400
                         :error            :cross-database-card
                         :card-id          card-id
                         :card-database-id card-db-id
                         :expected-database current-db-id}))

        (not (and (string? entity-id) (seq entity-id)))
        (throw (ex-info (tru "Saved question, model, or metric id {0} does not have an entity_id, so it cannot be exported as a portable representation." card-id)
                        {:status-code 400
                         :error       :missing-card-entity-id
                         :card-id     card-id}))

        :else
        entity-id))))

(defn- import-card-by-entity-id
  "Resolve a saved question / model by its portable `entity_id` to its numeric id.

  Guards against the card belonging to a different database than the metadata provider -
  that would produce a broken cross-database query at resolve time, so we surface a clear
  agent-facing error here instead."
  [metadata-provider content-store entity-id]
  (let [current-db-id (:id (lib.metadata/database metadata-provider))
        card          (card-by-entity-id content-store entity-id)
        ;; Card may come from a Toucan2 row (snake_case) or a `lib.metadata` map (kebab-case);
        ;; mirror the defensive read in `export-card-by-id` so the test-side content stores can
        ;; return either shape without breaking the cross-database guard.
        card-db-id    (when card (or (:database-id card) (:database_id card)))]
    (cond
      (nil? card)
      (throw (ex-info (tru "No saved question or model found with entity_id {0}. Do not invent or guess entity_ids: call `entity_details` with `entity-type: question` or `entity-type: model` and the card''s numeric id first, then copy the exact `portable_entity_id` from the response into `source-card:`."
                           (pr-str entity-id))
                      {:agent-error? true
                       :status-code  400
                       :error        :unknown-card
                       :entity-id    entity-id}))

      (not= card-db-id current-db-id)
      (throw (ex-info (tru "Saved question / model {0} belongs to database {1}, but this query targets database {2}. Cross-database queries are not supported."
                           (pr-str entity-id)
                           (pr-str card-db-id)
                           (pr-str current-db-id))
                      {:agent-error?     true
                       :status-code      400
                       :error            :cross-database-card
                       :entity-id        entity-id
                       :card-database-id card-db-id
                       :expected-database current-db-id}))

      :else
      (:id card))))

(defn- import-measure-by-entity-id
  "Resolve a measure by its portable `entity_id` to its numeric id.

  Measures are scoped to a table, so the cross-database guard works through the metadata
  provider: a measure whose `:table_id` is not known to the provider belongs to a different
  database. Same pattern as [[import-card-by-entity-id]]."
  [metadata-provider content-store entity-id]
  (let [measure         (measure-by-entity-id content-store entity-id)
        measure-table-id (when measure (or (:table-id measure) (:table_id measure)))
        measure-table    (when measure-table-id
                           (table-belongs-to-current-database? metadata-provider measure-table-id))
        current-db-id    (:id (lib.metadata/database metadata-provider))]
    (cond
      (nil? measure)
      (throw (ex-info (tru "No measure found with entity_id {0}. Do not invent or guess entity_ids: call `entity_details` on the table that owns the measure and copy the exact `portable_entity_id` from the `<measure>` tag."
                           (pr-str entity-id))
                      {:agent-error? true
                       :status-code  400
                       :error        :unknown-measure
                       :entity-id    entity-id}))

      (nil? measure-table)
      (throw (ex-info (tru "Measure {0} belongs to a table in a different database than this query (target database id {1}). Cross-database queries are not supported."
                           (pr-str entity-id) (pr-str current-db-id))
                      {:agent-error?      true
                       :status-code       400
                       :error             :cross-database-measure
                       :entity-id         entity-id
                       :measure-table-id  measure-table-id
                       :expected-database current-db-id}))

      :else
      (:id measure))))

(defn- export-measure-by-id
  "Resolve a measure by numeric id to its portable `entity_id`. Validates that the measure's
  table belongs to the metadata provider's database (cross-database guard)."
  [metadata-provider content-store measure-id]
  (when measure-id
    (let [measure          (measure-by-id content-store measure-id)
          measure-table-id (when measure (or (:table-id measure) (:table_id measure)))
          measure-table    (when measure-table-id
                             (table-belongs-to-current-database? metadata-provider measure-table-id))
          entity-id        (when measure (or (:entity-id measure) (:entity_id measure)))]
      (cond
        (nil? measure)
        (throw (ex-info (tru "No measure found with id {0}." measure-id)
                        {:status-code 400
                         :error       :unknown-measure-id
                         :measure-id  measure-id}))

        (nil? measure-table)
        (throw (ex-info (tru "Measure id {0} belongs to a table outside this metadata provider''s database."
                             measure-id)
                        {:status-code 400
                         :error       :cross-database-measure
                         :measure-id  measure-id}))

        (not (and (string? entity-id) (seq entity-id)))
        (throw (ex-info (tru "Measure id {0} does not have an entity_id, so it cannot be exported as a portable representation."
                             measure-id)
                        {:status-code 400
                         :error       :missing-measure-entity-id
                         :measure-id  measure-id}))

        :else
        entity-id))))

(defn- export-segment-by-id
  "Resolve a segment by numeric id to its portable `entity_id`. Same pattern as
  [[export-measure-by-id]]."
  [metadata-provider content-store segment-id]
  (when segment-id
    (let [segment          (segment-by-id content-store segment-id)
          segment-table-id (when segment (or (:table-id segment) (:table_id segment)))
          segment-table    (when segment-table-id
                             (table-belongs-to-current-database? metadata-provider segment-table-id))
          entity-id        (when segment (or (:entity-id segment) (:entity_id segment)))]
      (cond
        (nil? segment)
        (throw (ex-info (tru "No segment found with id {0}." segment-id)
                        {:status-code 400
                         :error       :unknown-segment-id
                         :segment-id  segment-id}))

        (nil? segment-table)
        (throw (ex-info (tru "Segment id {0} belongs to a table outside this metadata provider''s database."
                             segment-id)
                        {:status-code 400
                         :error       :cross-database-segment
                         :segment-id  segment-id}))

        (not (and (string? entity-id) (seq entity-id)))
        (throw (ex-info (tru "Segment id {0} does not have an entity_id, so it cannot be exported as a portable representation."
                             segment-id)
                        {:status-code 400
                         :error       :missing-segment-entity-id
                         :segment-id  segment-id}))

        :else
        entity-id))))

(defn- import-segment-by-entity-id
  "Resolve a segment by its portable `entity_id` to its numeric id. Same pattern as
  [[import-measure-by-entity-id]]."
  [metadata-provider content-store entity-id]
  (let [segment          (segment-by-entity-id content-store entity-id)
        segment-table-id (when segment (or (:table-id segment) (:table_id segment)))
        segment-table    (when segment-table-id
                           (table-belongs-to-current-database? metadata-provider segment-table-id))
        current-db-id    (:id (lib.metadata/database metadata-provider))]
    (cond
      (nil? segment)
      (throw (ex-info (tru "No segment found with entity_id {0}. Do not invent or guess entity_ids: call `entity_details` on the table that owns the segment and copy the exact `portable_entity_id` from the `<segment>` tag."
                           (pr-str entity-id))
                      {:agent-error? true
                       :status-code  400
                       :error        :unknown-segment
                       :entity-id    entity-id}))

      (nil? segment-table)
      (throw (ex-info (tru "Segment {0} belongs to a table in a different database than this query (target database id {1}). Cross-database queries are not supported."
                           (pr-str entity-id) (pr-str current-db-id))
                      {:agent-error?      true
                       :status-code       400
                       :error             :cross-database-segment
                       :entity-id         entity-id
                       :segment-table-id  segment-table-id
                       :expected-database current-db-id}))

      :else
      (:id segment))))

(defn import-resolver
  "Build a `SerdesImportResolver` backed by `metadata-provider` (warehouse metadata) and
  `content-store` (Metabase content / assets).

  The 1-arity form uses [[unchecked-app-db-content-store]] - i.e. it goes through
  `serdes/lookup-by-id` for content lookups and therefore requires the application database.
  **Note the \"unchecked\" prefix:** the default store does NOT apply `api/read-check`. HTTP /
  tool paths that run under an authenticated user must pass an explicit content-store wrapped
  with `metabase.metabot.tools.shared.content-store/read-checked`.

  Implemented methods:
    * `import-table-fk`, `import-field-fk` (Phase 1).
    * `import-fk-keyed` for `:model/Database` by `:name` (Phase 1 - needed because
      `resolve/import-mbql` dispatches on `:database` keys).
    * `import-fk` for `Card` / `:model/Card` by `entity_id` (Phase 2, step 11).

  Other methods throw `:not-implemented-yet`."
  ([metadata-provider]
   (import-resolver metadata-provider unchecked-app-db-content-store))
  ([metadata-provider content-store]
   (reify resolve/SerdesImportResolver
     (import-fk       [_ eid model]
       (cond
         (nil? eid)             nil
         (card-model? model)    (import-card-by-entity-id metadata-provider content-store eid)
         (measure-model? model) (import-measure-by-entity-id metadata-provider content-store eid)
         (segment-model? model) (import-segment-by-entity-id metadata-provider content-store eid)
         :else                  (not-implemented! :import-fk)))
     (import-fk-keyed [_ portable model field]
       (cond
         (and (or (= model :model/Database) (= model 'Database))
              (= field :name))
         (import-database-by-name metadata-provider portable)

         :else
         (not-implemented! :import-fk-keyed)))
     (import-user     [_ _email]                  (not-implemented! :import-user))
     (import-table-fk [_ path]
       (when path
         (:id (find-table metadata-provider path))))
     (import-field-fk [_ path]
       (when path
         (:id (find-field metadata-provider path)))))))

(defn export-resolver
  "Build a `SerdesExportResolver` backed by `metadata-provider`.

  Implemented methods:
    * `export-table-fk`, `export-field-fk` for warehouse metadata.
    * `export-fk-keyed` for `:model/Database` by `:name`.
    * `export-fk` for `Card` / `:model/Card` by `entity_id` (source-card and metric refs).
    * `export-fk` for `:model/Measure` and `:model/Segment` by `entity_id`.

  Other methods throw `:not-implemented-yet`."
  ([metadata-provider]
   (export-resolver metadata-provider unchecked-app-db-content-store))
  ([metadata-provider content-store]
   (reify resolve/SerdesExportResolver
     (export-fk       [_ id model]
       (cond
         (nil? id)              nil
         (card-model? model)    (export-card-by-id metadata-provider id)
         (measure-model? model) (export-measure-by-id metadata-provider content-store id)
         (segment-model? model) (export-segment-by-id metadata-provider content-store id)
         :else                  (not-implemented! :export-fk)))
     (export-fk-keyed [_ id model field]
       (cond
         (nil? id) nil

         (and (or (= model :model/Database) (= model 'Database))
              (= field :name))
         (export-database-name metadata-provider id)

         :else
         (not-implemented! :export-fk-keyed)))
     (export-user     [_ _id]               (not-implemented! :export-user))
     (export-table-fk [_ table-id]
       (when table-id
         (let [t (lib.metadata.protocols/table metadata-provider table-id)]
           (when-not t
             (throw (ex-info (tru "No table with id {0} in metadata provider." table-id)
                             {:status-code 400
                              :error       :unknown-table-id
                              :table-id    table-id})))
           [(db-name metadata-provider) (:schema t) (:name t)])))
     (export-field-fk [_ field-id]
       (when field-id
         (let [f (lib.metadata.protocols/field metadata-provider field-id)]
           (when-not f
             (throw (ex-info (tru "No field with id {0} in metadata provider." field-id)
                             {:status-code 400
                              :error       :unknown-field-id
                              :field-id    field-id})))
           (export-field-path metadata-provider f)))))))
