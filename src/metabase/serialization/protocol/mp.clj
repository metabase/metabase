(ns metabase.serialization.protocol.mp
  "The metadata-provider-backed [[metabase.serialization.protocol/Store]] that agents resolve references with, serving
  only the reads they need: Databases, Tables and Fields from a `lib.metadata/MetadataProvider`, and Cards, Measures
  and Segments from a [[ContentStore]], which may be permission-checked; any other read and every write throws
  `:not-implemented-yet`."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.serialization.db :as serialization.db]
   [metabase.serialization.mbql :as mbql]
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.protocol.app-db :as protocol.app-db]
   [metabase.util.i18n :refer [tru]]
   [potemkin.types :as p.types]))

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
  query. Bypasses the metadata provider entirely.

  Returns inactive rows too: the app DB is authoritative for *existence*, and
  [[table-candidates]] needs to tell \"no row at all\" (fall back to the provider) apart from
  \"only inactive rows\" (an authoritative miss). It does the `:active` filtering itself.

  Defective `(db_id, schema, name)` duplicates (allowed by the
  `001_update_migrations.yaml` `is_defective_duplicate` carve-out for pre-constraint rows)
  return more than one candidate so [[find-table]] can raise `:ambiguous-table`."
  [db-id schema table-name]
  (filter #(= schema (:schema %))
          (serialization.db/tables-by-names [db-id] [table-name] [:id :active :schema])))

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
  "Build an agent-facing `:unknown-table` error for a miss on the Table reference
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

  The LLM can still self-correct in one turn by listing the parent database's tables with
  the calling surface's discovery tool; the message points it at that path."
  [metadata-provider [_path-db-name _path-schema _path-table-name :as path]]
  (ex-info (tru "No table found matching portable FK {0}." (pr-str path))
           {:status-code  400
            :error        :unknown-table
            :agent-error? true
            :path         path
            :database-id  (:id (lib.metadata/database metadata-provider))}))

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
  raised for a table the caller can plainly see via `read_resource`."
  [metadata-provider db-id schema table-name]
  (if-let [app-db-rows (and db-id
                            (app-db-backed-provider? metadata-provider)
                            (seq (matching-tables-via-app-db db-id schema table-name)))]
    (filter :active app-db-rows)
    (matching-tables-via-provider metadata-provider schema table-name)))

(declare import-database-by-name)

(defn- find-table
  "The `{:id :db_id :schema :name}` row of the one active Table with the `[db-name schema table-name]` ref in the
  database of `metadata-provider`, throwing an agent-facing error, which carries the provider's unchecked
  `:database-id`, when the ref names another database, or when there is no such Table or several."
  [metadata-provider [db-name schema table-name]]
  (import-database-by-name metadata-provider db-name)
  (let [{current-db :name, current-db-id :id} (lib.metadata/database metadata-provider)
        path                                  [current-db schema table-name]
        candidates                            (table-candidates metadata-provider current-db-id schema table-name)]
    (case (count candidates)
      0 (throw (unknown-table-ex-info metadata-provider path))
      1 {:id (:id (first candidates)) :db_id current-db-id :schema schema :name table-name}
      ;; Deliberately do NOT enumerate the matching `[schema name id]` tuples — the metadata
      ;; provider is un-sandboxed, so a leaked candidate list could surface tables the caller
      ;; cannot otherwise see (parity with the `unknown-table-ex-info` strip above).
      (throw (ex-info (tru "Ambiguous portable table FK {0}: {1} candidates."
                           (pr-str path) (count candidates))
                      {:status-code  400
                       :error        :ambiguous-table
                       :agent-error? true
                       :path         path
                       :database-id  current-db-id})))))

(defn- field-path
  "The `[db-name schema table-name & field-names]` ref of the Field named `field-name` under the Field with
  `parent-id` in `table`."
  [metadata-provider table parent-id field-name]
  (let [ancestors (loop [id parent-id names ()]
                    (if-let [parent (some->> id (lib.metadata.protocols/field metadata-provider))]
                      (recur (:parent-id parent) (conj names (:name parent)))
                      names))]
    (-> [(db-name metadata-provider) (:schema table) (:name table)]
        (into ancestors)
        (conj field-name))))

(defn- find-field
  "The `{:id :table_id :parent_id :name}` row of the one Field named `field-name` under the Field with `parent-id` in
  the Table with `table-id`, throwing an agent-facing error when there is none or several."
  [metadata-provider [table-id parent-id field-name]]
  (let [table      (lib.metadata.protocols/table metadata-provider table-id)
        db         (db-name metadata-provider)
        full-path  (field-path metadata-provider table parent-id field-name)
        candidates (filter #(and (= (:name %) field-name) (= (:parent-id %) parent-id))
                           (lib.metadata.protocols/metadatas-for-table metadata-provider :metadata/column table-id))]
    (case (count candidates)
      ;; Deliberately do NOT enumerate FK-linked tables that happen to carry the same
      ;; column name. The metadata provider is un-sandboxed, the `:agent-error?` flag
      ;; relays this message verbatim to the user, and a leaked FK-candidate path would
      ;; reveal table names the caller may not be permitted to see. The LLM can recover
      ;; by listing the parent table's fields with the calling surface's discovery tool.
      0 (throw (ex-info (tru "No column {0} on table {1}.{2}.{3}."
                             (pr-str field-name) (pr-str db) (pr-str (:schema table)) (pr-str (:name table)))
                        {:status-code  400
                         :error        :unknown-field
                         :path         full-path
                         :segment      field-name
                         :table-id     table-id
                         :agent-error? true}))
      1 {:id (:id (first candidates)) :table_id table-id :parent_id parent-id :name field-name}
      (throw (ex-info (tru "Ambiguous column {0} on table {1}.{2}.{3}."
                           (pr-str field-name) (pr-str db) (pr-str (:schema table)) (pr-str (:name table)))
                      {:status-code 400
                       :error       :ambiguous-field
                       :path        full-path
                       :segment     field-name
                       :candidates  (mapv :id candidates)})))))

(defn- find-field-by-ref
  "The row of the one Field with the `[db-name schema table-name & field-names]` ref `ref` in the database of
  `metadata-provider`, found one nesting level at a time, throwing an agent-facing error when there is none or
  several."
  [metadata-provider ref]
  (let [table-id (:id (find-table metadata-provider (subvec (vec ref) 0 3)))]
    (reduce (fn [parent field-name]
              (find-field metadata-provider [table-id (:id parent) field-name]))
            nil
            (drop 3 ref))))

(defn outbound-fks-from-table
  "Return a sequence of FK edges leaving `source-table-id` in `metadata-provider`.

  Each entry is a map with:
    * `:source-field-id`           numeric id of the FK field on the source table;
    * `:source-field`              the full column metadata (convenient for exporting its reference);
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

;;; ============================================================
;;; Content store - Metabase content by entity id or numeric id
;;; ============================================================

(p.types/defprotocol+ ContentStore
  "Metabase content (\"assets\") by entity id or numeric id.

  Kept separate from the warehouse-metadata `MetadataProvider` so the store can be reused in
  contexts without an application database (e.g. the serdes checker, in-memory tests)."
  (card-by-entity-id [this entity-id]
    "Return the card row for the given `entity_id`, or nil. The returned map must at
    least carry `:id` and `:database_id` so the store can perform cross-database checks.")
  (measure-by-entity-id [this entity-id]
    "Return the measure row for the given `entity_id`, or nil. The returned map must
    at least carry `:id` and `:table_id` so the store can perform cross-database checks via
    the metadata provider.")
  (segment-by-entity-id [this entity-id]
    "Return the segment row for the given `entity_id`, or nil. Same contract as
    `measure-by-entity-id`.")
  (card-by-id [this card-id]
    "Return the card row for the given numeric id, or nil. Used by the export direction
    (a numeric `source-card` / metric ref → its `entity_id`). The returned map must
    carry `:entity_id` (or `:entity-id`) and `:database_id` (or `:database-id`) for the
    cross-database guard.")
  (measure-by-id [this measure-id]
    "Return the measure row for the given numeric id, or nil. Same contract as
    `measure-by-entity-id`; used by the export direction (`[:measure {} <id>]` →
    `[:measure {} \"<entity_id>\"]`). The returned map must carry `:entity_id` (or
    `:entity-id`) and `:table_id` (or `:table-id`).")
  (segment-by-id [this segment-id]
    "Return the segment row for the given numeric id, or nil. Same contract as
    `measure-by-id`."))

(defn- app-db-row
  "The row of `model` in the app DB whose primary key, or entity id when `by` is `:entity-id`, is `k`, with only
  `columns` unless nil, or nil."
  [model by k columns]
  (case by
    :pk        (first (protocol/select-by-pks protocol.app-db/store model #{k} columns))
    :entity-id (get (protocol/select-by-refs protocol.app-db/store model #{k} columns) k)))

(def unchecked-app-db-content-store
  "**Unchecked.** No `api/read-check`; appropriate for serdes import / background tasks /
  tests / dev REPL only. **Any HTTP or tool path that runs under an authenticated user must
  wrap this with `metabase.metabot.tools.shared.content-store/read-checked`** (or use
  `shared.content-store/default-store`, which is the wrapped form).

  Default [[ContentStore]] backed by the application database store
  [[metabase.serialization.protocol.app-db/store]]. Use this in production code paths that already have an app DB;
  pass a different store implementation when running without one (checker, isolated tests).

  Entity-id reads are gated on [[mbql/entity-id?]]: LLM-authored values are
  untrusted, so anything that isn't a 21-char NanoID short-circuits to `nil` and the caller
  surfaces a clear `:unknown-…` agent error. A numeric Card read selects only the columns `api/read-check` and the
  cross-database guard need, never the whole dataset_query."
  (reify ContentStore
    (card-by-entity-id [_ entity-id]
      (when (mbql/entity-id? entity-id)
        (app-db-row :model/Card :entity-id entity-id nil)))
    (measure-by-entity-id [_ entity-id]
      (when (mbql/entity-id? entity-id)
        (app-db-row :model/Measure :entity-id entity-id nil)))
    (segment-by-entity-id [_ entity-id]
      (when (mbql/entity-id? entity-id)
        (app-db-row :model/Segment :entity-id entity-id nil)))
    (card-by-id [_ card-id]
      (when (int? card-id)
        (app-db-row :model/Card :pk card-id [:id :entity_id :collection_id :database_id])))
    (measure-by-id [_ measure-id]
      (when measure-id
        (app-db-row :model/Measure :pk measure-id [:id :entity_id :table_id])))
    (segment-by-id [_ segment-id]
      (when segment-id
        (app-db-row :model/Segment :pk segment-id [:id :entity_id :table_id])))))

;;; ============================================================
;;; Store reads
;;; ============================================================

(defn- not-implemented! [method]
  (throw (ex-info (tru "{0} is not implemented for the metadata-provider-backed resolver in Phase 1."
                       (name method))
                  {:status-code 501
                   :error       :not-implemented-yet
                   :method      method})))

(defn- import-database-by-name
  "Resolve a database by its name, its ref, to a numeric id."
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
  "Resolve the current database's numeric id back to its name."
  [metadata-provider database-id]
  (when database-id
    (let [current-db (lib.metadata/database metadata-provider)]
      (if (= database-id (:id current-db))
        (:name current-db)
        (throw (ex-info (tru "Cannot export database id {0}: metadata provider is for database id {1}."
                             (str database-id) (str (:id current-db)))
                        {:status-code 400
                         :error       :unknown-database-id
                         :database-id database-id
                         :expected-id (:id current-db)}))))))

(defn- table-belongs-to-current-database?
  "True when the table with `table-id` is known to the metadata provider — measures and segments
  are scoped to a table, so this is the cross-database guard for measure/segment refs. Returns
  the table when found so callers can pull its `:db-id` for error messages."
  [metadata-provider table-id]
  (when table-id
    (lib.metadata.protocols/table metadata-provider table-id)))

(defn- export-card-by-id
  "Resolve a saved question / model / metric by numeric id to its `entity_id`.

  The row comes from `content-store`, not the metadata provider: the provider is
  permission-agnostic, so a read-checked store is what keeps an unreadable Card's stable id
  out of the export. The stored `database_id` guards against cross-database card refs, like
  `table-belongs-to-current-database?` does for measures and segments."
  [metadata-provider content-store card-id]
  (when card-id
    (let [current-db-id (:id (lib.metadata/database metadata-provider))
          card          (card-by-id content-store card-id)
          card-db-id    (when card (or (:database-id card) (:database_id card)))
          entity-id     (when card (or (:entity-id card) (:entity_id card)))]
      (cond
        (nil? card)
        (throw (ex-info (tru "No saved question, model, or metric found with id {0}." (str card-id))
                        {:status-code 400
                         :error       :unknown-card-id
                         :card-id     card-id}))

        (not= card-db-id current-db-id)
        (throw (ex-info (tru "Saved question / model / metric id {0} belongs to database {1}, but this query targets database {2}. Cross-database queries are not supported."
                             (str card-id) (str card-db-id) (str current-db-id))
                        {:status-code      400
                         :error            :cross-database-card
                         :card-id          card-id
                         :card-database-id card-db-id
                         :expected-database current-db-id}))

        (or (not (string? entity-id)) (str/blank? entity-id))
        (throw (ex-info (tru "Saved question, model, or metric id {0} does not have an entity_id, so it cannot be exported as a portable representation."
                             (str card-id))
                        {:status-code 400
                         :error       :missing-card-entity-id
                         :card-id     card-id}))

        :else
        entity-id))))

(defn- import-card-by-entity-id
  "Resolve a saved question / model by its `entity_id` to its numeric id.

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
      (throw (ex-info (tru "No saved question or model found with entity_id {0}." (pr-str entity-id))
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

(defn- import-card-by-id
  "Read-check a bare numeric `source-card` and return its id, on a surface that accepts numeric
  ids.

  The numeric dialect's counterpart to [[import-card-by-entity-id]]. It resolves to the id it
  was handed, so the return value is not the point — routing the read through `content-store`
  is: the agent-facing store is `read-checked`, so this is where a card the caller cannot read
  is turned away instead of flowing on into repair. The store collapses that denial to `nil`,
  which the `(nil? card)` branch below reports as the same not-found error an absent id gets —
  deliberately, so the response cannot be used to tell a hidden card from a missing one. Without it a numeric id skips
  the store entirely (`entity-id?` matches strings only), and the repair pass's column-name inference
  would name the card's columns back to a caller who cannot read it.

  Carries the same cross-database guard as the entity id path, for the same reason."
  [metadata-provider content-store card-id]
  (let [current-db-id (:id (lib.metadata/database metadata-provider))
        card          (card-by-id content-store card-id)
        card-db-id    (when card (or (:database-id card) (:database_id card)))]
    (cond
      (nil? card)
      (throw (ex-info (tru "No saved question or model found with id {0}." (str card-id))
                      {:agent-error? true
                       :status-code  400
                       :error        :unknown-card-id
                       :card-id      card-id}))

      (not= card-db-id current-db-id)
      (throw (ex-info (tru "Saved question / model {0} belongs to database {1}, but this query targets database {2}. Cross-database queries are not supported."
                           (str card-id)
                           (str card-db-id)
                           (str current-db-id))
                      {:agent-error?      true
                       :status-code       400
                       :error             :cross-database-card
                       :card-id           card-id
                       :card-database-id  card-db-id
                       :expected-database current-db-id}))

      :else
      (:id card))))

(defn- import-measure-by-entity-id
  "Resolve a measure by its `entity_id` to its numeric id.

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
      (throw (ex-info (tru "No measure found with entity_id {0}." (pr-str entity-id))
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

(defn- import-measure-by-id
  "Read-check a bare numeric measure id and return it, on a surface that accepts numeric ids.

  The numeric counterpart to [[import-measure-by-entity-id]]; see [[import-card-by-id]] for why
  the read has to go through `content-store` even though the id needs no translation. Carries
  the same table-scoped cross-database guard as the entity id path."
  [metadata-provider content-store measure-id]
  (let [measure          (measure-by-id content-store measure-id)
        measure-table-id (when measure (or (:table-id measure) (:table_id measure)))
        measure-table    (when measure-table-id
                           (table-belongs-to-current-database? metadata-provider measure-table-id))
        current-db-id    (:id (lib.metadata/database metadata-provider))]
    (cond
      (nil? measure)
      (throw (ex-info (tru "No measure found with id {0}." (str measure-id))
                      {:agent-error? true
                       :status-code  400
                       :error        :unknown-measure-id
                       :measure-id   measure-id}))

      (nil? measure-table)
      (throw (ex-info (tru "Measure {0} belongs to a table in a different database than this query (target database id {1}). Cross-database queries are not supported."
                           (str measure-id) (str current-db-id))
                      {:agent-error?      true
                       :status-code       400
                       :error             :cross-database-measure
                       :measure-id        measure-id
                       :measure-table-id  measure-table-id
                       :expected-database current-db-id}))

      :else
      (:id measure))))

(defn- export-measure-by-id
  "Resolve a measure by numeric id to its `entity_id`. Validates that the measure's
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
        (throw (ex-info (tru "No measure found with id {0}." (str measure-id))
                        {:status-code 400
                         :error       :unknown-measure-id
                         :measure-id  measure-id}))

        (nil? measure-table)
        (throw (ex-info (tru "Measure id {0} belongs to a table in a different database than this query. Cross-database queries are not supported."
                             (str measure-id))
                        {:status-code 400
                         :error       :cross-database-measure
                         :measure-id  measure-id}))

        (not (and (string? entity-id) (seq entity-id)))
        (throw (ex-info (tru "Measure id {0} does not have an entity_id, so it cannot be exported as a portable representation."
                             (str measure-id))
                        {:status-code 400
                         :error       :missing-measure-entity-id
                         :measure-id  measure-id}))

        :else
        entity-id))))

(defn- export-segment-by-id
  "Resolve a segment by numeric id to its `entity_id`. Same pattern as
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
        (throw (ex-info (tru "No segment found with id {0}." (str segment-id))
                        {:status-code 400
                         :error       :unknown-segment-id
                         :segment-id  segment-id}))

        (nil? segment-table)
        (throw (ex-info (tru "Segment id {0} belongs to a table in a different database than this query. Cross-database queries are not supported."
                             (str segment-id))
                        {:status-code 400
                         :error       :cross-database-segment
                         :segment-id  segment-id}))

        (not (and (string? entity-id) (seq entity-id)))
        (throw (ex-info (tru "Segment id {0} does not have an entity_id, so it cannot be exported as a portable representation."
                             (str segment-id))
                        {:status-code 400
                         :error       :missing-segment-entity-id
                         :segment-id  segment-id}))

        :else
        entity-id))))

(defn- import-segment-by-entity-id
  "Resolve a segment by its `entity_id` to its numeric id. Same pattern as
  [[import-measure-by-entity-id]]."
  [metadata-provider content-store entity-id]
  (let [segment          (segment-by-entity-id content-store entity-id)
        segment-table-id (when segment (or (:table-id segment) (:table_id segment)))
        segment-table    (when segment-table-id
                           (table-belongs-to-current-database? metadata-provider segment-table-id))
        current-db-id    (:id (lib.metadata/database metadata-provider))]
    (cond
      (nil? segment)
      (throw (ex-info (tru "No segment found with entity_id {0}." (pr-str entity-id))
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

(defn- import-segment-by-id
  "Read-check a bare numeric segment id and return it, on a surface that accepts numeric ids.

  The numeric counterpart to [[import-segment-by-entity-id]]; see [[import-card-by-id]] for why
  the read has to go through `content-store`. Same table-scoped cross-database guard."
  [metadata-provider content-store segment-id]
  (let [segment          (segment-by-id content-store segment-id)
        segment-table-id (when segment (or (:table-id segment) (:table_id segment)))
        segment-table    (when segment-table-id
                           (table-belongs-to-current-database? metadata-provider segment-table-id))
        current-db-id    (:id (lib.metadata/database metadata-provider))]
    (cond
      (nil? segment)
      (throw (ex-info (tru "No segment found with id {0}." (str segment-id))
                      {:agent-error? true
                       :status-code  400
                       :error        :unknown-segment-id
                       :segment-id   segment-id}))

      (nil? segment-table)
      (throw (ex-info (tru "Segment {0} belongs to a table in a different database than this query (target database id {1}). Cross-database queries are not supported."
                           (str segment-id) (str current-db-id))
                      {:agent-error?      true
                       :status-code       400
                       :error             :cross-database-segment
                       :segment-id        segment-id
                       :segment-table-id  segment-table-id
                       :expected-database current-db-id}))

      :else
      (:id segment))))

(def ^:private served-columns
  "The columns the store serves of each model it looks up."
  {:model/Database #{:id :name}
   :model/Table    #{:id :db_id :schema :name}
   :model/Field    #{:id :name :parent_id :table_id}
   :model/Card     #{:id :entity_id}
   :model/Measure  #{:id :entity_id}
   :model/Segment  #{:id :entity_id}})

(def served-reads
  "The `[model read]` pairs the store serves, a read being by `:pks` or by `:refs`."
  #{[:model/Database :pks] [:model/Database :refs]
    [:model/Table :pks]    [:model/Table :refs]
    [:model/Field :pks]    [:model/Field :refs]
    [:model/Card :pks]     [:model/Card :refs]
    [:model/Measure :pks]  [:model/Measure :refs]
    [:model/Segment :pks]  [:model/Segment :refs]})

(defn- check-served
  "Throws `:not-implemented-yet` unless the store serves the `read` of `model` with `columns`."
  [model read columns]
  (when-not (and (served-reads [model read])
                 (some? columns)
                 (every? (served-columns model) columns))
    (not-implemented! (keyword (str (name read) "-" (name model))))))

(defn- export-content-row
  "The `{:id :entity_id}` row of the Card, Measure or Segment of `model` with `id`, for an export."
  [metadata-provider content-store model id]
  {:id        id
   :entity_id (case model
                :model/Card    (export-card-by-id metadata-provider content-store id)
                :model/Measure (export-measure-by-id metadata-provider content-store id)
                :model/Segment (export-segment-by-id metadata-provider content-store id))})

(defn- import-content-row
  "The `{:id}` row of the Card, Measure or Segment of `model` with the numeric `id`, checked for an import."
  [metadata-provider content-store model id]
  {:id (case model
         :model/Card    (import-card-by-id metadata-provider content-store id)
         :model/Measure (import-measure-by-id metadata-provider content-store id)
         :model/Segment (import-segment-by-id metadata-provider content-store id))})

(defn- content-row-by-entity-id
  "The `{:id :entity_id}` row of the Card, Measure or Segment of `model` with `entity-id`."
  [metadata-provider content-store model entity-id]
  {:id        (case model
                :model/Card    (import-card-by-entity-id metadata-provider content-store entity-id)
                :model/Measure (import-measure-by-entity-id metadata-provider content-store entity-id)
                :model/Segment (import-segment-by-entity-id metadata-provider content-store entity-id))
   :entity_id entity-id})

(defn- row-by-pk
  "The row of `model` with the primary key `pk`, its numeric content ids checked the way `direction` needs."
  [metadata-provider content-store direction model pk]
  (case model
    :model/Database {:id pk :name (export-database-name metadata-provider pk)}
    :model/Table    (let [t (lib.metadata.protocols/table metadata-provider pk)]
                      (when-not t
                        (throw (ex-info (tru "No table found with id {0}." (str pk))
                                        {:status-code 400
                                         :error       :unknown-table-id
                                         :table-id    pk})))
                      {:id pk :db_id (:db-id t) :schema (:schema t) :name (:name t)})
    :model/Field    (let [f (lib.metadata.protocols/field metadata-provider pk)]
                      (when-not f
                        (throw (ex-info (tru "No field found with id {0}." (str pk))
                                        {:status-code 400
                                         :error       :unknown-field-id
                                         :field-id    pk})))
                      {:id pk :name (:name f) :parent_id (:parent-id f) :table_id (:table-id f)})
    (case direction
      :export (export-content-row metadata-provider content-store model pk)
      :import (import-content-row metadata-provider content-store model pk))))

(defn- row-by-ref
  "The row of `model` with the ref `ref`."
  [metadata-provider content-store model ref]
  (case model
    :model/Database {:id (import-database-by-name metadata-provider ref) :name ref}
    :model/Table    (find-table metadata-provider ref)
    :model/Field    (find-field-by-ref metadata-provider ref)
    (content-row-by-entity-id metadata-provider content-store model ref)))

(defn- store
  "The store of `metadata-provider` and `content-store`, checking numeric Card, Measure and Segment ids the way an
  `:import` or an `:export` `direction` needs."
  [metadata-provider content-store direction]
  (reify protocol/Store
    (select-by-pks [_ model pks columns]
      (check-served model :pks columns)
      (mapv #(row-by-pk metadata-provider content-store direction model %) (remove nil? pks)))
    (select-by-refs [_ model refs columns]
      (check-served model :refs columns)
      (into {}
            (keep (fn [ref]
                    (when-some [row (row-by-ref metadata-provider content-store model ref)]
                      (when (some? (:id row))
                        [ref row]))))
            refs))
    (select-by-parent-pks [_ model _parent-pks _columns]
      (not-implemented! (keyword (str "children-" (name model)))))
    (insert-rows! [_ model _rows]
      (not-implemented! (keyword (str "insert-" (name model)))))
    (update-row! [_ model _pk _changes]
      (not-implemented! (keyword (str "update-" (name model)))))
    (delete-rows! [_ model _pks]
      (not-implemented! (keyword (str "delete-" (name model)))))
    (transact [_ _opts f]
      (f))))

(defn import-store
  "The store that agents import references with, backed by `metadata-provider` (warehouse metadata) and
  `content-store` (Metabase content), where the 1-arity form uses [[unchecked-app-db-content-store]], which does NOT
  apply `api/read-check`, so HTTP and tool paths under an authenticated user must pass a store wrapped with
  `metabase.metabot.tools.shared.content-store/read-checked`."
  ([metadata-provider]
   (import-store metadata-provider unchecked-app-db-content-store))
  ([metadata-provider content-store]
   (store metadata-provider content-store :import)))

(defn export-store
  "The store that agents export ids to references with, backed by `metadata-provider` and `content-store`,
  where the 1-arity form uses [[unchecked-app-db-content-store]] and agent-facing callers must pass a permission-aware
  store so exported content entity ids are read-checked."
  ([metadata-provider]
   (export-store metadata-provider unchecked-app-db-content-store))
  ([metadata-provider content-store]
   (store metadata-provider content-store :export)))
