(ns metabase-enterprise.workspaces.copy
  "How the copies that a workspace's transforms write differ from the Tables and Fields that every workspace shares.
   The shared metadata stays as the instance's own sync leaves it. A workspace's copy rows hold only the differences,
   so a copy with the shape of its canonical table has none:

   - a column only the copy has: an inactive shared Field, and an active row with the copy's types;
   - a column the copy gives another type or position: an active row with the copy's types;
   - a column the copy lacks: an inactive row, for the column and every Field nested in it;
   - a Table only the workspace has: an inactive shared Table, and an active table copy row."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Recording ------------------------------------------------

(defn- copy-columns
  "The columns of a workspace_field_copy row for the copy column `column`."
  [{:keys [base-type database-type database-position]}]
  {:active            true
   :base_type         base-type
   :effective_type    base-type
   :database_type     database-type
   :database_position database-position})

(defn- same-shape?
  "Whether the active shared Field `field` has the types and position of the copy column `column`."
  [field {:keys [base-type database-type database-position]}]
  (and (:active field)
       (= (:base_type field) base-type)
       (= (:database_type field) database-type)
       (= (:database_position field) database-position)))

(defn- shared-field-id!
  "The id of the top-level shared Field of the Table with `table-id` for the copy column `column`: the one named so,
  or a new inactive one. A request in another workspace may insert the same Field meanwhile; then it is read back."
  [table-id fields-by-name column]
  (or (:id (get fields-by-name (:name column)))
      (try
        (ws.db/insert-inactive-field! table-id column)
        (catch Exception e
          (or (ws.db/top-level-field-id table-id (:name column))
              (throw e))))))

(defn- nested-field-ids
  "The ids of `fields` nested, at any depth, in the Fields with `parent-ids`."
  [fields parent-ids]
  (let [children-of (group-by :parent_id fields)]
    (loop [ids #{}, frontier parent-ids]
      (if-let [children (seq (mapcat children-of frontier))]
        (let [child-ids (into #{} (map :id) children)]
          (recur (into ids child-ids) child-ids))
        ids))))

(defn- desired-field-copies
  "The workspace_field_copy rows, as a map of Field id to columns, that say how the copy with `columns` differs from
  the shared `fields` of the Table with `table-id`."
  [table-id fields columns]
  (let [top-level      (remove :parent_id fields)
        fields-by-name (into {} (map (juxt :name identity)) top-level)
        column-names   (into #{} (map :name) columns)
        present        (into {}
                             (keep (fn [column]
                                     (let [field (get fields-by-name (:name column))]
                                       (when-not (some-> field (same-shape? column))
                                         [(shared-field-id! table-id fields-by-name column) (copy-columns column)]))))
                             columns)
        dropped-ids    (into #{}
                             (comp (filter :active) (remove #(column-names (:name %))) (map :id))
                             top-level)]
    (into present
          (map (fn [field-id] [field-id {:active false}]))
          (into dropped-ids (nested-field-ids fields dropped-ids)))))

(defn- row-columns
  "The columns of the workspace_field_copy row `row` that [[desired-field-copies]] sets."
  [row]
  (cond-> {:active (:active row)}
    (:active row) (merge (select-keys row [:base_type :effective_type :database_type :database_position]))))

(defn- write-field-copies!
  "Make the workspace_field_copy rows of `workspace-id` of the Table with `table-id` those of `desired`."
  [workspace-id table-id desired]
  (let [existing (into {} (map (juxt :field_id identity)) (ws.db/field-copies-of-table workspace-id table-id))]
    (ws.db/delete-field-copies! (into [] (comp (remove (comp desired key)) (map (comp :id val))) existing))
    (ws.db/insert-field-copies! workspace-id (into {} (remove (comp existing key)) desired))
    (doseq [[field-id columns] desired
            :let  [row (get existing field-id)]
            :when (and row (not= columns (row-columns row)))]
      (ws.db/update-field-copy! (:id row) (merge {:base_type nil :effective_type nil :database_type nil
                                                  :database_position nil}
                                                 columns)))))

(defn record-copy!
  "Record, for the workspace with `workspace-id`, how the copy of `table` that its transform wrote differs from the
  shared metadata of `table`. `database` is the Lib metadata of the Database; the request's table remapping
  redirects a describe of `table` to the copy."
  [workspace-id database table]
  (let [columns (sync/table-fields-metadata database table)]
    (t2/with-transaction [_conn]
      (write-field-copies! workspace-id (:id table) (desired-field-copies (:id table) (ws.db/table-fields (:id table)) columns))
      (if (:active table)
        (ws.db/delete-table-copy! workspace-id (:id table))
        (ws.db/upsert-table-copy! workspace-id (:id table))))
    (log/infof "Recorded the copy of table %d in workspace %d: %d columns" (:id table) workspace-id (count columns))
    nil))

;;; ------------------------------------------------ query_metadata -----------------------------------------------

(defn apply-field-copy
  "The Field `field`, with snake_case keys, with the types of its copy row `copy` over it. When the copy has another
  base type, the shared coercion does not apply."
  [field {:keys [active base_type effective_type database_type database_position]}]
  (cond-> (assoc field :active active)
    base_type                                           (assoc :base_type base_type)
    effective_type                                      (assoc :effective_type effective_type)
    (and base_type (not= base_type (:base_type field))) (assoc :coercion_strategy nil)
    database_type                                       (assoc :database_type database_type)
    database_position                                   (assoc :database_position database_position)))

(defn- field-order
  "The order of the Fields of a Table, as `metabase.warehouse-schema.db/field-order-rule` gives it."
  [field]
  [(:position field) (some-> ^String (:name field) .toLowerCase)])

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
  "`tables`, each with its hydrated `:fields`, with the copy rows of the workspace with `workspace-id` over them: a
  Table is active as its copy row says, a Field the copy lacks is left out, a Field only the copy has is added,
  hydrated with `hydrate-fields`, and each Field has the copy's types."
  [workspace-id tables hydrate-fields]
  (let [table-ids    (into [] (keep :id) tables)
        field-copies (when (seq table-ids) (ws.db/field-copies-of-tables workspace-id table-ids))
        table-copies (when (seq table-ids) (ws.db/table-copies-of-tables workspace-id table-ids))]
    (if (and (empty? field-copies) (empty? table-copies))
      tables
      (let [field-copy   (into {} (map (juxt :field_id identity)) field-copies)
            table-copy   (into {} (map (juxt :table_id identity)) table-copies)
            extra-fields (group-by :table_id
                                   (some->> (seq (into [] (comp (filter :active) (map :field_id)) field-copies))
                                            ws.db/inactive-fields
                                            (map #(apply-field-copy % (field-copy (:id %))))
                                            hydrate-fields))]
        (for [{table-id :id :as table} tables]
          (let [present     (into #{} (map :id) (:fields table))
                retyped-ids (into #{}
                                  (keep (fn [{:keys [id base_type]}]
                                          (when-let [copy-type (:base_type (field-copy id))]
                                            (when (not= copy-type base_type) id))))
                                  (:fields table))
                fields      (concat (:fields table) (remove #(present (:id %)) (get extra-fields table-id)))]
            (cond-> table
              (contains? table-copy table-id)
              (assoc :active (:active (table-copy table-id)))

              (some #(contains? field-copy (:id %)) fields)
              (assoc :fields (-> (->> fields
                                      (keep (fn [field]
                                              (if-let [copy (field-copy (:id field))]
                                                (when (:active copy) (apply-field-copy field copy))
                                                field)))
                                      (sort-by field-order))
                                 (rehydrate-retyped retyped-ids hydrate-fields))))))))))
