(ns metabase-enterprise.transforms-test.inputs
  "Strict input resolution for transform test runs.

  Two public entry points:

  - [[resolve-table-dep]] — resolve one raw dependency spec to a table-info map,
    fail-closed.
  - [[match-fixtures]] — verify the provided fixture keys cover exactly the
    required tables."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.transforms-test.errors :as errors]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Internal helpers
;;; ---------------------------------------------------------------------------

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
  - `{:transform <id>}`           — throws `::errors/transform-dep-not-supported`
    (the target table of another transform does not yet exist as a synced Table).

  Throws `ex-info` with typed `:error-type` on any resolution failure."
  [{dep-table :table dep-transform :transform :keys [table-ref]}]
  (cond
    dep-transform
    (throw (errors/ex ::errors/transform-dep-not-supported
                      (str "Cannot resolve transform dependency " dep-transform
                           " — test runs do not support transforms that depend on another"
                           " transform's output table (the target table has not yet been"
                           " materialised into the app DB).")
                      {:transform-id dep-transform}))

    dep-table
    (let [row (t2/select-one :model/Table :id dep-table :active true)]
      (if row
        (table-row->table-info row)
        (throw (errors/ex ::errors/table-not-found
                          (str "Cannot resolve table dependency: no synced Table with id "
                               dep-table " found in the app DB. Has this table been synced?")
                          {:table-id dep-table}))))

    table-ref
    (let [{:keys [database_id schema table]} table-ref
          row (t2/select-one :model/Table
                             :db_id  database_id
                             :schema schema
                             :name   table
                             :active true)]
      (if row
        (table-row->table-info row)
        (throw (errors/ex ::errors/table-not-found
                          (str "Cannot resolve table-ref dependency: no synced Table found"
                               " for database_id=" database_id
                               " schema=" (pr-str schema)
                               " table=" (pr-str table)
                               ". Has this table been synced?")
                          {:table-ref table-ref}))))

    :else
    (throw (errors/ex ::errors/cannot-determine-inputs
                      (str "Unrecognised dependency spec shape: " (pr-str {:table dep-table
                                                                           :transform dep-transform
                                                                           :table-ref table-ref}))
                      {}))))

;;; ---------------------------------------------------------------------------
;;; Public API
;;; ---------------------------------------------------------------------------

(defn match-fixtures
  "Verify that `provided-fixture-keys` (a set of table ids) covers exactly the
  tables in `required-tables`. Validation only — returns nil.

  Arguments:
  - `required-tables`      — a vector of table-info maps (each has at least
                             `:id`, `:schema`, `:name`).
  - `provided-fixture-keys` — a set of table ids (integers) from the multipart
                              request, keyed by `input-<table-id>`.

  Throws `ex-info` with typed `:error-type`:
  - `::errors/missing-fixtures`     — one or more required tables have no fixture.
                               `:missing-tables` in ex-data lists id/schema/name.
  - `::errors/unknown-fixture-keys` — one or more fixture keys have no matching required table.
                               `:unknown-keys` in ex-data is the set of unknown ids."
  [required-tables provided-fixture-keys]
  (let [required-ids  (set (map :id required-tables))
        missing-ids   (set/difference required-ids provided-fixture-keys)
        unknown-keys  (set/difference provided-fixture-keys required-ids)]
    (when (seq missing-ids)
      (let [id->tbl (into {} (map (juxt :id identity)) required-tables)]
        (throw (errors/ex ::errors/missing-fixtures
                          (str "Missing fixture(s) for required input table(s): "
                               (str/join ", "
                                         (for [id   (sort missing-ids)
                                               :let [t (id->tbl id)]]
                                           (str (:schema t) "." (:name t)
                                                " (id=" id ")"))))
                          {:missing-tables (mapv id->tbl (sort missing-ids))}))))
    (when (seq unknown-keys)
      (throw (errors/ex ::errors/unknown-fixture-keys
                        (str "Unknown fixture key(s) (no matching required input table): "
                             (str/join ", " (sort unknown-keys)))
                        {:unknown-keys unknown-keys})))
    nil))
