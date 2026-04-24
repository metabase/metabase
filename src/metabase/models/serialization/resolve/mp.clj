(ns metabase.models.serialization.resolve.mp
  "Metadata-provider-backed implementations of the serdes resolver protocols.

  Unlike `metabase.models.serialization.resolve.db`, this resolver does not touch toucan2 /
  the application database for *warehouse-schema* lookups (tables, fields) \u2014 it works off a
  `lib.metadata/MetadataProvider`, which may be the live application-DB-backed provider, a
  test-only mock provider, or any cached variant.

  It does, however, touch the application DB for *Metabase-model* lookups (cards by
  `entity_id`, etc.) because the lib metadata protocol doesn't support filtering by
  `entity_id`, and cards in any case live in the application DB independently of whose
  warehouse the metadata provider points at.

  Primary consumer: the agent-lib representations pipeline, which converts LLM-authored
  portable MBQL queries (with FK paths like `[DB, SCHEMA, TABLE, FIELD]`) into numeric-ID
  MBQL suitable for `lib.query/query` / the QP.

  Phase 1 scope (per `repr-plan.md`):
    * `import-table-fk`, `import-field-fk`, `export-table-fk`, `export-field-fk` are real.
    * Everything else throws `:not-implemented-yet` for now.

  Phase 2 additions (per `repr-plan.md`):
    * `import-fk` for `Card` / `:model/Card` by `entity_id` (step 11)."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.serialization :as serdes]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Helpers
;;; ============================================================

(defn- db-name [metadata-provider]
  (:name (lib.metadata/database metadata-provider)))

(defn- matching-tables
  "Return all tables in `metadata-provider` that match `table-name`, optionally filtered by `schema`
  (where `schema` may be nil for schemaless databases).

  Uses `metadatas-by-name`-style query via `metadatas` to avoid O(tables) scans on large providers."
  [metadata-provider schema table-name]
  (->> (lib.metadata.protocols/metadatas metadata-provider
                                         {:lib/type :metadata/table
                                          :name     #{table-name}})
       (filter #(= (:schema %) schema))))

(defn- fqn [t]
  (str (:schema t) "." (:name t)))

(defn- tokenize
  "Split `s` into lower-case tokens on non-alphanumeric boundaries. Filters tokens shorter than
  3 chars and normalizes trailing `s` (crude plural → singular: `cards` → `card`, `orders` →
  `order`) so that `fct_cards` and `int_brex_card_dim` share the token `card`."
  [s]
  (when s
    (into #{}
          (comp (map (fn [tok]
                       (let [lc (u/lower-case-en tok)]
                         (cond-> lc
                           (and (> (count lc) 3) (str/ends-with? lc "s"))
                           (subs 0 (dec (count lc)))))))
                (filter #(>= (count %) 3)))
          (str/split s #"[^A-Za-z0-9]+"))))

(defn- candidate-score
  "Score a table against `needle-tokens` and optional `preferred-schema`. Higher = closer match.

  Token-level Jaccard on `(schema, name)` tokens (so `int_brex_card_dim` lights up for
  `fct_cards` via the shared `card` token). Tables in the preferred schema get a fixed
  boost so that — when the LLM got the schema right but invented the table name — the real
  sibling tables surface first."
  [table needle-tokens preferred-schema]
  (let [table-tokens (into (tokenize (:schema table))
                           (tokenize (:name table)))
        overlap      (count (set/intersection needle-tokens table-tokens))
        schema-boost (if (and preferred-schema (= (:schema table) preferred-schema)) 1 0)]
    (+ (* 10 overlap) schema-boost)))

(defn- substring-table-candidates
  "Rank up to 5 tables that plausibly match `needle` given the user wrote `preferred-schema`.
  Primary signal: token-level overlap (plural-normalized). Secondary: same-schema boost.
  Fallback: raw substring match for the single-word / no-underscore case.

  Returns a vector of `\"schema.name\"` strings — LLM-friendly and short enough to inline in
  the error message."
  [all-tables needle preferred-schema]
  (when (seq needle)
    (let [needle-tokens (tokenize needle)
          token-hits    (->> all-tables
                             (keep (fn [t]
                                     (let [s (candidate-score t needle-tokens preferred-schema)]
                                       (when (pos? s) [s t]))))
                             (sort-by (fn [[s t]] [(- s) (count (:name t))]))
                             (take 5)
                             (mapv (comp fqn second)))]
      (if (seq token-hits)
        token-hits
        ;; Fallback: raw substring (handles tables with single-word names and no `_`).
        (let [needle-lc (u/lower-case-en needle)]
          (->> all-tables
               (filter (fn [t]
                         (when-let [n (:name t)]
                           (let [n-lc (u/lower-case-en n)]
                             (or (str/includes? n-lc needle-lc)
                                 (str/includes? needle-lc n-lc))))))
               (sort-by #(count (:name %)))
               (take 5)
               (mapv fqn)))))))

(defn- unknown-table-ex-info
  "Build an agent-facing `:unknown-table` / `:unknown-schema` error for a miss on portable FK
  `[db schema name]`.

  The message is tiered so the LLM gets the most specific signal it can act on:
    1. If `schema` isn't in the database at all → `:unknown-schema` + the real schema list.
       (Addresses the observed `public` hallucination: Postgres warehouses in Metabase
       rarely use `public` — real schemas come from domain names like `customerio_data`.)
    2. If a table named `name` exists in _other_ schemas → `:unknown-table` naming them.
    3. Otherwise → `:unknown-table` with up to 5 substring candidates."
  [metadata-provider [path-db-name path-schema path-table-name :as path]]
  (let [all-tables (lib.metadata.protocols/tables metadata-provider)
        schemas    (->> all-tables (map :schema) (remove nil?) distinct sort)
        same-name  (filter #(= (:name %) path-table-name) all-tables)]
    (cond
      ;; Case 1: schema isn't in the DB at all (and we know what a schema looks like
      ;; in this DB — i.e. the DB has any non-nil schema).
      (and (some? path-schema)
           (seq schemas)
           (not (contains? (set schemas) path-schema)))
      (ex-info (tru "No schema {0} in database {1}. Available schemas: {2}. Do not invent schema names; pick one from this list."
                    (pr-str path-schema)
                    (pr-str path-db-name)
                    (str/join ", " schemas))
               {:status-code      400
                :error            :unknown-schema
                :agent-error?     true
                :path             path
                :available-schemas (vec schemas)})

      ;; Case 2: there IS a table by that name, just in different schema(s).
      (seq same-name)
      (ex-info (tru "No table {0} in database {1}. A table named {2} does exist in: {3}. Use one of those fully-qualified names (or pick a different base table)."
                    (pr-str path)
                    (pr-str path-db-name)
                    (pr-str path-table-name)
                    (str/join ", " (map fqn same-name)))
               {:status-code  400
                :error        :unknown-table
                :agent-error? true
                :path         path
                :candidates   (mapv fqn same-name)})

      ;; Case 3: fuzzy / substring candidates on name (boosted by same-schema).
      :else
      (let [subs (substring-table-candidates all-tables path-table-name path-schema)]
        (ex-info (tru "No table found matching portable FK {0}.{1}"
                      (pr-str path)
                      (if (seq subs)
                        (str " Closest tables in this database: " (str/join ", " subs) ".")
                        ""))
                 {:status-code  400
                  :error        :unknown-table
                  :agent-error? true
                  :path         path
                  :candidates   (vec subs)})))))

(defn- find-table
  "Resolve `[db-name, schema, table-name]` to a `:metadata/table` or throw with context.

  On miss, the thrown ex-info carries actionable, tiered hints (see
  [[unknown-table-ex-info]]) so the LLM can self-correct on the next turn instead of
  re-hallucinating the same bad path. All error branches are marked
  `:agent-error? true` so the outer tool wrapper relays the message verbatim."
  [metadata-provider [path-db-name path-schema path-table-name :as path]]
  (let [current-db (db-name metadata-provider)]
    (when-not (= path-db-name current-db)
      (throw (ex-info (tru "Portable table FK references database {0}, but metadata provider is for {1}."
                           (pr-str path-db-name)
                           (pr-str current-db))
                      {:status-code  400
                       :error        :unknown-table
                       :agent-error? true
                       :path         path
                       :expected-db  current-db}))))
  (let [candidates (matching-tables metadata-provider path-schema path-table-name)]
    (case (count candidates)
      0 (throw (unknown-table-ex-info metadata-provider path))
      1 (first candidates)
      (throw (ex-info (tru "Ambiguous portable table FK {0}: {1} candidates." (pr-str path) (count candidates))
                      {:status-code  400
                       :error        :ambiguous-table
                       :agent-error? true
                       :path         path
                       :candidates   (mapv (juxt :schema :name :id) candidates)})))))

(declare outbound-fks-from-table)

(defn- find-field
  "Resolve a field path `[db schema table field …]` to a `:metadata/column` or throw with context.

  For regular (non-JSON-unfolded) fields, the path has exactly 4 elements and we match on name
  directly. For JSON-unfolded paths (5+ elements), we walk parent/child via `:parent-id` \u2014
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
        ;; For root-level "column does not exist" errors, offer a hint if the same
        ;; column name lives on an FK-reachable table — LLM typically guesses
        ;; `[db, schema, <source-table>, name]` when it actually wants
        ;; `[db, schema, <fk-target-table>, name]` via an implicit join. Surfacing the
        ;; candidate path lets the LLM self-correct in one turn instead of giving up.
        fk-field-hints
        (fn [segment]
          (try
            (->> (outbound-fks-from-table metadata-provider (:id table-meta))
                 (keep (fn [{:keys [target-table-id]}]
                         (when-let [tgt-tbl (lib.metadata.protocols/table metadata-provider target-table-id)]
                           (let [tgt-cols (lib.metadata.protocols/metadatas-for-table
                                           metadata-provider :metadata/column target-table-id)]
                             (when (some #(and (= (:name %) segment)
                                               (nil? (:parent-id %)))
                                         tgt-cols)
                               [(db-name metadata-provider)
                                (:schema tgt-tbl)
                                (:name tgt-tbl)
                                segment])))))
                 (take 5)
                 vec)
            (catch Exception _ [])))
        unknown-field-ex
        (fn [segment]
          (let [hints (fk-field-hints segment)
                base  (tru "No column {0} on table {1}.{2}.{3}."
                           (pr-str segment) (pr-str db) (pr-str schema) (pr-str table-name))
                msg   (if (seq hints)
                        (str base
                             " "
                             (tru "It exists on FK-linked tables: {0}."
                                  (str/join ", " (map pr-str hints)))
                             " "
                             (tru "If you meant the related field, use that full path — the query processor will fill in the implicit join via the foreign key."))
                        base)]
            (ex-info msg
                     (cond-> {:status-code   400
                              :error         :unknown-field
                              :path          full-path
                              :segment       segment
                              :table-id      (:id table-meta)
                              :agent-error?  true}
                       (seq hints) (assoc :fk-candidates hints)))))
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

(defn- card-model? [model]
  (or (= model 'Card) (= model :model/Card)))

(defn- import-card-by-entity-id
  "Resolve a saved question / model by its portable `entity_id` to its numeric id.

  Guards against the card belonging to a different database than the metadata provider \u2014
  that would produce a broken cross-database query at resolve time, so we surface a clear
  agent-facing error here instead."
  [metadata-provider entity-id]
  (let [current-db-id (:id (lib.metadata/database metadata-provider))
        card          (serdes/lookup-by-id 'Card entity-id)]
    (cond
      (nil? card)
      (throw (ex-info (tru "No saved question or model found with entity_id {0}. Do not invent or guess entity_ids: call `entity_details` with `entity-type: question` or `entity-type: model` and the card''s numeric id first, then copy the exact `portable_entity_id` from the response into `source-card:`."
                           (pr-str entity-id))
                      {:agent-error? true
                       :status-code  400
                       :error        :unknown-card
                       :entity-id    entity-id}))

      (not= (:database_id card) current-db-id)
      (throw (ex-info (tru "Saved question / model {0} belongs to database {1}, but this query targets database {2}. Cross-database queries are not supported."
                           (pr-str entity-id)
                           (pr-str (:database_id card))
                           (pr-str current-db-id))
                      {:agent-error?     true
                       :status-code      400
                       :error            :cross-database-card
                       :entity-id        entity-id
                       :card-database-id (:database_id card)
                       :expected-database current-db-id}))

      :else
      (:id card))))

(defn import-resolver
  "Build a `SerdesImportResolver` backed by `metadata-provider`.

  Implemented methods:
    * `import-table-fk`, `import-field-fk` (Phase 1).
    * `import-fk-keyed` for `:model/Database` by `:name` (Phase 1 — needed because
      `resolve/import-mbql` dispatches on `:database` keys).
    * `import-fk` for `Card` / `:model/Card` by `entity_id` (Phase 2, step 11).

  Other methods throw `:not-implemented-yet`."
  [metadata-provider]
  (reify resolve/SerdesImportResolver
    (import-fk       [_ eid model]
      (cond
        (nil? eid)          nil
        (card-model? model) (import-card-by-entity-id metadata-provider eid)
        :else               (not-implemented! :import-fk)))
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
        (:id (find-field metadata-provider path))))))

(defn export-resolver
  "Build a `SerdesExportResolver` backed by `metadata-provider`.

  Only `export-table-fk` and `export-field-fk` are implemented in Phase 1. Other methods throw
  `:not-implemented-yet`."
  [metadata-provider]
  (reify resolve/SerdesExportResolver
    (export-fk       [_ _id _model]        (not-implemented! :export-fk))
    (export-fk-keyed [_ _id _model _field] (not-implemented! :export-fk-keyed))
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
          (export-field-path metadata-provider f))))))
