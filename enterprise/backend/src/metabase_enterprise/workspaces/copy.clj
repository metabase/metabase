(ns metabase-enterprise.workspaces.copy
  "How the copies that a workspace's transforms write differ from the Tables and Fields that every workspace shares.
   The shared metadata stays as the instance's own sync leaves it. For a copy of a shared Table, the workspace holds
   only the differences, so a copy with the shape of its canonical table has none:

   - a column only the copy has: a Field the workspace owns (`metabase_field.workspace_id`);
   - a column the copy gives another type or position: a type row in `workspace_field_copy`;
   - a column the copy lacks: a hide row, for the column and every Field nested in it.

   Row-level security shows a workspace its own Fields and hides the shared ones it has hide rows for, so every reader
   of the app DB sees the copy's columns. Only the types of a type row need [[apply-to-tables]] and the query
   processor's copy metadata.

   A Table that only the workspace has is a Table it owns, which the standard sync fills in the workspace."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Recording ------------------------------------------------

(defn- same-shape?
  "Whether the active Field `field` has the types and position of the copy column `column`."
  [field {:keys [base-type database-type database-position]}]
  (and (:active field)
       (= (:base_type field) base-type)
       (= (:database_type field) database-type)
       (= (:database_position field) database-position)))

(defn- type-row
  "The columns of a workspace_field_copy row that gives a shared Field the types of the copy column `column`."
  [{:keys [base-type database-type database-position]}]
  {:active            true
   :base_type         base-type
   :effective_type    base-type
   :database_type     database-type
   :database_position database-position})

(def ^:private hide-row
  "The columns of a workspace_field_copy row that hides a shared Field from the workspace."
  {:active false})

(defn- nested-field-ids
  "The ids of `fields` nested, at any depth, in the Fields with `parent-ids`."
  [fields parent-ids]
  (let [children-of (group-by :parent_id fields)]
    (loop [ids #{}, frontier parent-ids]
      (if-let [children (seq (mapcat children-of frontier))]
        (let [child-ids (into #{} (map :id) children)]
          (recur (into ids child-ids) child-ids))
        ids))))

(defn- by-name
  "The top-level Fields of `fields`, by name."
  [fields]
  (into {} (comp (remove :parent_id) (map (juxt :name identity))) fields))

(defn- desired-field-copies
  "The workspace_field_copy rows, as a map of Field id to columns, that say how the copy with `columns` differs from the
  shared `fields`. A shared Field that the workspace owns a twin of is hidden: the workspace sees its own."
  [shared-fields owned-by-name columns]
  (let [shared-by-name (by-name (filter :active shared-fields))
        column-by-name (into {} (map (juxt :name identity)) columns)
        hidden-ids     (into #{}
                             (keep (fn [[field-name field]]
                                     (when (or (not (column-by-name field-name)) (owned-by-name field-name))
                                       (:id field))))
                             shared-by-name)]
    (merge (into {}
                 (keep (fn [[field-name field]]
                         (let [column (column-by-name field-name)]
                           (when (and column
                                      (not (owned-by-name field-name))
                                      (not (same-shape? field column)))
                             [(:id field) (type-row column)]))))
                 shared-by-name)
           (into {}
                 (map (fn [field-id] [field-id hide-row]))
                 (into hidden-ids (nested-field-ids shared-fields hidden-ids))))))

(defn- row-columns
  "The columns of the workspace_field_copy row `row` that [[desired-field-copies]] sets."
  [row]
  (cond-> {:active (:active row)}
    (:active row) (merge (select-keys row [:base_type :effective_type :database_type :database_position]))))

(defn- write-field-copies!
  "Make the workspace_field_copy rows of `workspace-id` of the shared `fields` those of `desired`."
  [workspace-id shared-fields desired]
  (let [existing (into {}
                       (map (juxt :field_id identity))
                       (ws.db/field-copies-of-fields workspace-id (mapv :id shared-fields)))]
    (ws.db/delete-field-copies! (into [] (comp (remove (comp desired key)) (map (comp :id val))) existing))
    (ws.db/insert-field-copies! workspace-id (into {} (remove (comp existing key)) desired))
    (doseq [[field-id columns] desired
            :let  [row (get existing field-id)]
            :when (and row (not= columns (row-columns row)))]
      (ws.db/update-field-copy! (:id row) (merge {:base_type nil :effective_type nil :database_type nil
                                                  :database_position nil}
                                                 columns)))))

(defn- write-owned-fields!
  "Make the top-level Fields the workspace with `workspace-id` owns of the Table with `table-id` those of the copy
  columns that no active shared Field without a twin has: insert, update or delete them."
  [workspace-id table-id shared-fields owned-by-name columns]
  (let [shared-by-name (by-name (filter :active shared-fields))
        wanted         (into {}
                             (comp (filter #(or (owned-by-name (:name %)) (not (shared-by-name (:name %)))))
                                   (map (juxt :name identity)))
                             columns)]
    (ws.db/delete-owned-fields! workspace-id (into [] (keep (fn [[field-name field]]
                                                              (when-not (wanted field-name) (:id field))))
                                                   owned-by-name))
    (doseq [[field-name column] wanted
            :let [field (owned-by-name field-name)]]
      (cond
        (nil? field)                  (ws.db/insert-owned-field! table-id column)
        (not (same-shape? field column)) (ws.db/update-owned-field! (:id field) column)))))

(defn record-copy!
  "Record, for the workspace with `workspace-id`, how the copy of the shared `table` that its transform wrote differs
  from the shared metadata of `table`, and drop the advanced FieldValues of its Fields, which may hold the old copy's
  values. `database` is the Lib metadata of the Database; the request's table remapping
  redirects a describe of `table` to the copy."
  [workspace-id database table]
  (workspaces/with-workspace-id workspace-id
    (let [columns       (sync/table-fields-metadata database table)
          fields        (ws.db/table-fields-of-workspace workspace-id (:id table))
          shared-fields (filterv (comp nil? :owner_workspace_id) fields)
          owned-by-name (by-name (filter :owner_workspace_id fields))]
      (t2/with-transaction [_conn]
        (write-field-copies! workspace-id shared-fields (desired-field-copies shared-fields owned-by-name columns))
        (write-owned-fields! workspace-id (:id table) shared-fields owned-by-name columns))
      (ws.db/hide-shared-twins! workspace-id)
      ;; Values that a workspace reads are advanced FieldValues keyed by the workspace. A new copy has new values, so
      ;; the old ones go; production's cached values of the same Fields are rebuilt when next read.
      (doseq [{field-id :id} fields]
        (field-values/clear-advanced-field-values-for-field! field-id))
      (log/infof "Recorded the copy of table %d in workspace %d: %d columns" (:id table) workspace-id (count columns))
      nil)))

;;; ------------------------------------------------ query_metadata -----------------------------------------------

(defn apply-field-copy
  "The Field `field`, with snake_case keys, with the types of its type row `copy` over it. When the copy has another
  base type, the shared coercion does not apply."
  [field {:keys [base_type effective_type database_type database_position]}]
  (cond-> field
    base_type                                           (assoc :base_type base_type)
    effective_type                                      (assoc :effective_type effective_type)
    (and base_type (not= base_type (:base_type field))) (assoc :coercion_strategy nil)
    database_type                                       (assoc :database_type database_type)
    database_position                                   (assoc :database_position database_position)))

(defn- rehydrate-retyped
  "`fields`, with each Field whose id is in `retyped-ids` hydrated again with `hydrate-fields`: its `:has_field_values`
  follows its base type, which its copy changes."
  [fields retyped-ids hydrate-fields]
  (if (empty? retyped-ids)
    fields
    (let [rehydrated (into {}
                           (map (juxt :id identity))
                           (hydrate-fields (into [] (comp (filter (comp retyped-ids :id)) (map #(dissoc % :has_field_values)))
                                                 fields)))]
      (mapv #(get rehydrated (:id %) %) fields))))

(defn apply-to-tables
  "`tables`, each with its hydrated `:fields`, with the type rows of the workspace with `workspace-id` over their
  Fields. A Field whose base type changes is hydrated again with `hydrate-fields`. Row-level security already gives
  the workspace the copy's Fields."
  [workspace-id tables hydrate-fields]
  (let [table-ids (into [] (keep :id) tables)
        type-rows (when (seq table-ids) (ws.db/field-type-copies-of-tables workspace-id table-ids))]
    (if (empty? type-rows)
      tables
      (let [type-row (into {} (map (juxt :field_id identity)) type-rows)]
        (for [table tables]
          (if-not (some #(type-row (:id %)) (:fields table))
            table
            (let [retyped-ids (into #{}
                                    (keep (fn [{:keys [id base_type]}]
                                            (when-let [copy-type (:base_type (type-row id))]
                                              (when (not= copy-type base_type) id))))
                                    (:fields table))]
              (assoc table :fields (-> (mapv #(if-let [copy (type-row (:id %))] (apply-field-copy % copy) %)
                                             (:fields table))
                                       (rehydrate-retyped retyped-ids hydrate-fields))))))))))
