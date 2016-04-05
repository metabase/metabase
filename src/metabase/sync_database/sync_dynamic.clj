(ns metabase.sync-database.sync-dynamic
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [schema.core :as schema]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.models.common :as common]
            [metabase.models.field :as field]
            [metabase.models.table :as table]
            [metabase.sync-database.sync :as sync]
            [metabase.util :as u]))


(declare save-nested-fields!)

(defn- update-field!
  "Update an existing `Field` from the given FIELD-DEF.  Then save any nested fields if needed."
  [{:keys [id], :as existing-field} {field-name :name, :keys [base-type nested-fields], :as field-def}]
  (let [special-type (or (:special_type existing-field)
                         (sync/infer-field-special-type field-def))]
    ;; if we have a different base-type or special-type, then update
    (when (or (not= base-type (:base_type existing-field))
              (not= special-type (:special_type existing-field)))
      (db/upd field/Field id
        :display_name (or (:display_name existing-field)
                          (common/name->human-readable-name field-name))
        :base_type    base-type
        :special_type special-type)))
  (when nested-fields
    (save-nested-fields! existing-field nested-fields)))


(defn- create-field!
  "Create a new `Field` from the given FIELD-DEF.  Then save any nested fields if needed."
  [table-id {field-name :name, :keys [base-type nested-fields parent-id], :as field-def}]
  (when-let [new-field (db/ins field/Field
                         :table_id       table-id
                         :name           field-name
                         :display_name   (common/name->human-readable-name field-name)
                         :base_type      base-type
                         :special_type   (sync/infer-field-special-type field-def)
                         :parent_id      parent-id)]
    (when nested-fields
      (save-nested-fields! new-field nested-fields))))


(defn- save-nested-fields!
  "Save any nested `Fields` for a given parent `Field`.
   All field-defs provided are assumed to be children of the given FIELD."
  [{parent-id :id, table-id :table_id, :as parent-field} nested-field-defs]
  ;; NOTE: remember that we never retire any fields in dynamic-schema tables
  (let [existing-field-name->field (into {} (for [{table-name :name, :as tbl} (db/sel :many field/Field, :visibility_type [not= "retired"], :parent_id parent-id)]
                                              {table-name tbl}))]
    (u/prog1 (set/difference (set (map :name nested-field-defs)) (set (keys existing-field-name->field)))
      (when (seq <>)
        (log/debug (u/format-color 'blue "Found new nested fields for field '%s': %s" (:name parent-field) <>))))

    (doseq [nested-field-def nested-field-defs]
      (let [nested-field-def (assoc nested-field-def :parent-id parent-id)]
        ;; NOTE: this recursively creates fields until we hit the end of the nesting
        (if-let [existing-field (existing-field-name->field (:name nested-field-def))]
          ;; field already exists, so we UPDATE it
          (update-field! existing-field nested-field-def)
          ;; looks like a new field, so we CREATE it
          (create-field! table-id nested-field-def))))))


(defn save-table-fields!
  "Save all `Fields` in the provided `Table`.

   Since this is expected to be a table from a `:dynamic-schema` we actually do a `(describe-table)` here and use its
   output as the basis for the synced fields.

   NOTE: we never retire/disable any fields in a dynamic schema database, so this process will only add/update `Fields`."
  [{table-id :id, :as tbl}]
  (let [database            (table/database tbl)
        driver              (driver/engine->driver (:engine database))
        table-def           (u/prog1 (driver/describe-table driver database (select-keys tbl [:name :schema]))
                              (schema/validate driver/DescribeTable <>))
        field-name->field   (into {} (for [{field-name :name, :as fld} (db/sel :many field/Field, :table_id table-id, :parent_id nil)]
                                       {field-name fld}))]
    ;; NOTE: with dynamic schemas we never disable fields automatically because we don't know when that's appropriate

    ;; create/update the fields
    (doseq [{field-name :name, :as field-def} (:fields table-def)]
      (if-let [existing-field (get field-name->field field-name)]
        ;; field already exists, so we UPDATE it
        (update-field! existing-field field-def)
        ;; looks like a new field, so we CREATE it
        (create-field! table-id field-def)))))
