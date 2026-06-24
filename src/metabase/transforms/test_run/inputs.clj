(ns metabase.transforms.test-run.inputs
  "Strict input resolution for transform test runs.

  Two public entry points:

  - [[required-input-tables]] — given a transform value, compute its required
    input tables fail-closed. Any extraction or resolution failure throws a
    typed error. Never returns a partial set. Each table-info carries:
    `:id` (app-DB Table id), `:schema` (string), `:name` (string), and
    `:columns` — the column schema:
    `[{:name <string> :base-type <kw> :nullable? <bool>} ...]`.

  - [[match-fixtures]] — given the required-tables list and the set of fixture
    keys provided by the caller (table ids), verify every required table has
    exactly one fixture and no unknown keys were supplied. Throws typed errors
    for missing or unknown keys.

  ## Supported transform types

  Only `:query`-type transforms (native SQL and MBQL) are supported. Python
  transforms and any other source type throw `::unsupported-transform-type`.

  ## Error taxonomy (`:error-type` keys in ex-data)

  All errors are `ex-info` with a namespaced `:error-type` keyword. The API
  layer (`transforms_rest.api.transform`) maps these to HTTP response codes and
  user-facing messages.

  | `:error-type`                        | Meaning |
  |--------------------------------------|---------|
  | `::unsupported-transform-type`       | Transform source type is not `:query` (e.g. `:python`). |
  | `::cannot-determine-inputs`          | `table-dependencies` threw; extraction failed. |
  | `::table-not-found`                  | A `{:table id}` or `{:table-ref ...}` dep has no matching synced Table row. |
  | `::transform-dep-not-supported`      | A `{:transform id}` dep (output of another transform) is not supported in test runs. |
  | `::missing-fixtures`                 | One or more required tables have no fixture key in the provided set. |
  | `::unknown-fixture-keys`             | One or more fixture keys have no matching required table. |"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.transforms-base.interface :as transforms-base.i]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Internal helpers
;;; ---------------------------------------------------------------------------

(defn- source-type
  "Extract the transform source type as a keyword."
  [transform]
  (-> transform :source :type keyword))

(defn- field->column
  "Convert a :model/Field row to a column descriptor `{:name :base-type :nullable?}`."
  [field]
  {:name      (:name field)
   :base-type (:base_type field)
   ;; database_is_nullable is the authoritative NOT-NULL constraint from the DB schema.
   ;; nil (unknown) is treated as nullable (safe default).
   :nullable? (not (false? (:database_is_nullable field)))})

(defn- table-row->table-info
  "Resolve a :model/Table row to a table-info map including its column schema."
  [table]
  (let [fields (t2/select :model/Field
                          :table_id (:id table)
                          :active true
                          {:order-by [[:position :asc]]})]
    {:id      (:id table)
     :schema  (:schema table)
     :name    (:name table)
     :columns (mapv field->column fields)}))

;;; ---------------------------------------------------------------------------
;;; Public: resolve a single dep spec to a table-info (also exposed for tests)
;;; ---------------------------------------------------------------------------

(defn resolve-table-dep
  "Resolve a single dependency spec to a table-info map.

  Accepted dep shapes (from `transforms-base.i/table-dependencies`):
  - `{:table <id>}`               — look up by app-DB Table id.
  - `{:table-ref {:database_id :schema :table}}` — look up by (db-id, schema, name).
  - `{:transform <id>}`           — throws `::transform-dep-not-supported`
    (the target table of another transform does not yet exist as a synced Table).

  Throws `ex-info` with typed `:error-type` on any resolution failure."
  [{dep-table :table dep-transform :transform :keys [table-ref]}]
  (cond
    dep-transform
    (throw (ex-info
            (str "Cannot resolve transform dependency " dep-transform
                 " — test runs do not support transforms that depend on another"
                 " transform's output table (the target table has not yet been"
                 " materialised into the app DB).")
            {:error-type   ::transform-dep-not-supported
             :transform-id dep-transform}))

    dep-table
    (let [row (t2/select-one :model/Table :id dep-table :active true)]
      (if row
        (table-row->table-info row)
        (throw (ex-info
                (str "Cannot resolve table dependency: no synced Table with id "
                     dep-table " found in the app DB. Has this table been synced?")
                {:error-type ::table-not-found
                 :table-id   dep-table}))))

    table-ref
    (let [{:keys [database_id schema table]} table-ref
          row (t2/select-one :model/Table
                             :db_id  database_id
                             :schema schema
                             :name   table
                             :active true)]
      (if row
        (table-row->table-info row)
        (throw (ex-info
                (str "Cannot resolve table-ref dependency: no synced Table found"
                     " for database_id=" database_id
                     " schema=" (pr-str schema)
                     " table=" (pr-str table)
                     ". Has this table been synced?")
                {:error-type ::table-not-found
                 :table-ref  table-ref}))))

    :else
    (throw (ex-info
            (str "Unrecognised dependency spec shape: " (pr-str {:table dep-table
                                                                 :transform dep-transform
                                                                 :table-ref table-ref}))
            {:error-type ::cannot-determine-inputs}))))

;;; ---------------------------------------------------------------------------
;;; Public API
;;; ---------------------------------------------------------------------------

(defn required-input-tables
  "Compute the required input tables for `transform`, fail-closed.

  Arguments:
  - `transform` — a transform value (map with `:source` key; may be a DB row or
    a hand-constructed test value).

  Returns a vector of table-info maps, one per required input table:
  ```
  [{:id      <app-DB Table id>
    :schema  <string>
    :name    <string>
    :columns [{:name <string> :base-type <kw> :nullable? <bool>} ...]}
   ...]
  ```

  Throws `ex-info` with typed `:error-type` in ex-data on any failure:
  - `::unsupported-transform-type` — source type is not `:query` (e.g. `:python`).
  - `::cannot-determine-inputs`   — dependency extraction threw.
  - `::table-not-found`           — a dep spec resolved to no synced Table.
  - `::transform-dep-not-supported` — a dep on another transform's output."
  [transform]
  (let [stype (source-type transform)]
    (when (not= :query stype)
      (throw (ex-info
              (str "Transform source type " (pr-str stype)
                   " is not supported in test runs."
                   " Only :query transforms (native SQL and MBQL) are supported.")
              {:error-type      ::unsupported-transform-type
               :source-type     stype}))))
  ;; Extract deps strictly: any exception from table-dependencies is wrapped.
  ;; Source-card MBQL transforms ({:source-table "card__N"}) are resolved
  ;; transitively here by table-dependencies (via qp.preprocess); deps come back
  ;; as {:table <physical-id>}, resolved normally — no special-casing needed.
  (let [raw-deps (try
                   (transforms-base.i/table-dependencies transform)
                   (catch Throwable e
                     (throw (ex-info
                             (str "Cannot determine input tables for this transform."
                                  " Dependency extraction failed: " (.getMessage e))
                             {:error-type ::cannot-determine-inputs}
                             e))))]
    ;; Resolve each dep spec to a full table-info. resolve-table-dep throws on failure.
    (mapv resolve-table-dep raw-deps)))

(defn match-fixtures
  "Verify that `provided-fixture-keys` (a set of table ids) covers exactly the
  tables in `required-tables`, then return a match plan.

  Arguments:
  - `required-tables`      — the output of [[required-input-tables]]; a vector of
                             table-info maps (each has at least `:id`, `:schema`,
                             `:name`).
  - `provided-fixture-keys` — a set of table ids (integers) from the multipart
                              request, keyed by `input-<table-id>`.

  Returns a vector of match entries on success:
  ```
  [{:table-id   <integer>   ; app-DB Table id
    :fixture-key <integer>  ; same as :table-id (fixture keyed by table id)
    :table-info  <map>}     ; the full table-info from required-tables
   ...]
  ```

  Throws `ex-info` with typed `:error-type`:
  - `::missing-fixtures`     — one or more required tables have no fixture.
                               `:missing-tables` in ex-data lists id/schema/name.
  - `::unknown-fixture-keys` — one or more fixture keys have no matching required table.
                               `:unknown-keys` in ex-data is the set of unknown ids."
  [required-tables provided-fixture-keys]
  (let [required-ids  (set (map :id required-tables))
        missing-ids   (set/difference required-ids provided-fixture-keys)
        unknown-keys  (set/difference provided-fixture-keys required-ids)]
    (when (seq missing-ids)
      (let [id->tbl (into {} (map (juxt :id identity)) required-tables)]
        (throw (ex-info
                (str "Missing fixture(s) for required input table(s): "
                     (str/join ", "
                               (for [id   (sort missing-ids)
                                     :let [t (id->tbl id)]]
                                 (str (:schema t) "." (:name t)
                                      " (id=" id ")"))))
                {:error-type     ::missing-fixtures
                 :missing-tables (mapv id->tbl (sort missing-ids))}))))
    (when (seq unknown-keys)
      (throw (ex-info
              (str "Unknown fixture key(s) (no matching required input table): "
                   (str/join ", " (sort unknown-keys)))
              {:error-type   ::unknown-fixture-keys
               :unknown-keys unknown-keys})))
    ;; Happy path: all required tables covered, no unknown keys.
    (mapv (fn [tbl]
            {:table-id    (:id tbl)
             :fixture-key (:id tbl)
             :table-info  tbl})
          required-tables)))
