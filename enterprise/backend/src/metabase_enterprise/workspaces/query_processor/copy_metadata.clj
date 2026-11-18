(ns metabase-enterprise.workspaces.query-processor.copy-metadata
  "The metadata that a query in a workspace that the request names reads: the Tables and Fields that every workspace
   shares, with the workspace's copy rows over them ([[metabase-enterprise.workspaces.copy]]). A column only the
   workspace's copy has is an inactive shared Field that is active here, a column the copy lacks is not active here,
   and a column the copy gives another base type has that type, without the shared coercion."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(set! *warn-on-reflection* true)

(defn- apply-field-copy
  "`column` with its copy row `copy` over it."
  [column {:keys [active base_type effective_type database_type database_position]}]
  (cond-> (assoc column :active active)
    (and base_type (not= base_type (:base-type column)))
    (assoc :base-type base_type, :effective-type (or effective_type base_type), :coercion-strategy nil)

    database_type     (assoc :database-type database_type)
    database_position (assoc :database-position database_position)))

(defn- listing?
  "Whether `metadata-spec` lists the active objects, which a provider answers without the inactive ones."
  [metadata-spec]
  (not (or (:id metadata-spec) (:name metadata-spec))))

(defn- overlay
  "`results` of `metadata-spec` with `copy` of each over it, and for a listing, without the inactive ones and with the
  matching `extras`, which the parent leaves out because they are inactive there."
  [metadata-spec results copy-of extras]
  (let [listing? (listing? metadata-spec)
        results  (into [] (map #(if-let [copy (copy-of (:id %))] (copy %) %)) results)]
    (if-not listing?
      results
      (let [present (into #{} (map :id) results)]
        (into []
              (lib.metadata.protocols/default-spec-filter-xform metadata-spec)
              (concat results (remove #(present (:id %)) extras)))))))

(defn- copy-transform
  "The transform for [[lib.metadata/transforming-metadata-provider]] that puts `field-copies` and `table-copies`, the
  copy rows of a workspace, over the metadata of `mp`. Reads the objects that only the workspace has from `mp` now,
  so the transform itself is pure."
  [mp field-copies table-copies]
  (let [field-copy   (into {} (map (juxt :field_id identity)) field-copies)
        table-copy   (into {} (map (juxt :table_id identity)) table-copies)
        extra-fields (into []
                           (map #(apply-field-copy % (field-copy (:id %))))
                           (some->> (seq (into [] (comp (filter :active) (remove :field_active) (map :field_id))
                                               field-copies))
                                    (lib.metadata/bulk-metadata mp :metadata/column)))
        extra-tables (into []
                           (map #(assoc % :active true))
                           (some->> (seq (into [] (comp (filter :active) (map :table_id)) table-copies))
                                    (lib.metadata/bulk-metadata mp :metadata/table)))
        column-copy  (fn [id] (when-let [copy (field-copy id)] #(apply-field-copy % copy)))
        table-active (fn [id] (when-let [copy (table-copy id)] #(assoc % :active (:active copy))))]
    (fn [{metadata-type :lib/type :as metadata-spec} results]
      (case metadata-type
        :metadata/column (overlay metadata-spec results column-copy extra-fields)
        :metadata/table  (overlay metadata-spec results table-active extra-tables)
        results))))

(defn copy-metadata-provider
  "`mp` with the copy rows of the workspace with `workspace-id` over its metadata of the Database with `database-id`,
  or nil when the workspace has none for it."
  [mp workspace-id database-id]
  (let [field-copies (ws.db/field-copies-of-database workspace-id database-id)
        table-copies (ws.db/table-copies-of-database workspace-id database-id)]
    (when (or (seq field-copies) (seq table-copies))
      (lib.metadata/transforming-metadata-provider (copy-transform mp field-copies table-copies) mp))))
