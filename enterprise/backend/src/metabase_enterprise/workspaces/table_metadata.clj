(ns metabase-enterprise.workspaces.table-metadata
  "Workspace-scoped streaming export of database/table/field metadata and sampled
   field values. Backs the manager API endpoints that download
   `table_metadata.json` and `field_values.json` for a single workspace.

   Output shape matches what the upstream `@metabase/database-metadata` extractor
   expects (a flat `{:databases :tables :fields}` document, and a flat
   `{:field_values}` document). Visibility is determined entirely by the caller's
   `db-id->schemas` map — there is no per-user permission filter, since workspace
   metadata is admin-only and the workspace's input + output schemas already
   define the slice of the warehouse to expose.

   Both writers stream rows directly to a writer wrapping the response's
   `OutputStream`, so even gigabyte-scale schemas don't have to be materialized
   in memory."
  (:require
   [medley.core :as m]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------- Row formatters --------------------------------------------------

(defn- format-database-info
  [{:keys [id name engine]}]
  {:id id :name name :engine engine})

(defn- format-table-info
  [{:keys [id db_id name schema description]}]
  (m/assoc-some {:id id :db_id db_id :name name}
                :schema schema
                :description description))

(defn- format-field-info
  [{:keys [id table_id parent_id fk_target_field_id name description base_type
           database_type effective_type semantic_type coercion_strategy]}]
  (m/assoc-some {:id id :table_id table_id :name name}
                :parent_id parent_id
                :fk_target_field_id fk_target_field_id
                :description description
                :base_type base_type
                :database_type database_type
                :effective_type (when (and effective_type (not= base_type effective_type)) effective_type)
                :semantic_type semantic_type
                :coercion_strategy coercion_strategy))

(defn- format-field-values-entry
  [{:keys [field_id values human_readable_values has_more_values]}]
  (m/assoc-some {:field_id        field_id
                 :values          (or values [])
                 :has_more_values (boolean has_more_values)}
                :human_readable_values (not-empty human_readable_values)))

;;; ---------------------------------------------- JSON streaming -------------------------------------------------

(defn- write-json-array!
  "Streams a reducible collection as a JSON array to a Writer, applying `format-fn` to each row.

   `run!` is required here because it dispatches through `reduce`, which consumes
   the `IReduceInit` returned by `t2/reducible-select` row-by-row without
   materializing. `doseq` cannot be used: it walks a seq, and producing a seq
   from the reducible would realize every row into memory — defeating the point
   of streaming."
  [^java.io.Writer writer reducible format-fn]
  (.write writer "[")
  (let [first? (volatile! true)]
    (run! (fn [row]
            (if @first?
              (vreset! first? false)
              (.write writer ","))
            (json/encode-to (format-fn row) writer {}))
          reducible))
  (.write writer "]"))

;;; --------------------------------------------- Where clauses ---------------------------------------------------

(def ^:private false-clause
  "Always-false clause used when `db-id->schemas` is empty so the queries return
   no rows without special-casing the SQL builder."
  [:= 1 0])

(defn- db-where
  "Restrict `:metabase_database :d` to the workspace's databases. Excludes the
   audit (internal) database and routing/destination databases — these never
   belong in a bulk export, even if the caller mistakenly listed them."
  [db-id->schemas]
  (if (empty? db-id->schemas)
    false-clause
    [:and
     [:= :d.is_audit false]
     [:= :d.router_database_id nil]
     [:in :d.id (vec (keys db-id->schemas))]]))

(defn- table-where
  "Restrict `:metabase_table :t` to active, non-hidden tables that live in one of
   the workspace's schemas for the table's database."
  [db-id->schemas]
  (let [per-db (for [[db-id schemas] db-id->schemas
                     :when (seq schemas)]
                 [:and [:= :t.db_id db-id] [:in :t.schema (vec schemas)]])]
    (if (empty? per-db)
      false-clause
      [:and
       [:= :t.active true]
       [:= :t.visibility_type nil]
       (into [:or] per-db)])))

(defn- field-where
  "Restrict `:metabase_field :f` to active, non-sensitive fields."
  []
  [:and
   [:= :f.active true]
   [:<> :f.visibility_type "sensitive"]])

(defn- field-values-filter
  "Restrict `:metabase_fieldvalues :fv` to unconstrained `:full` rows. Sandboxed,
   impersonation, and linked-filter variants are user-specific and excluded from
   a bulk export."
  []
  [:and [:= :fv.type "full"] [:= :fv.hash_key nil]])

;;; ----------------------------------------------- Public API ----------------------------------------------------

(defn write-table-metadata!
  "Stream a workspace's databases/tables/fields metadata as JSON to `os` in the
   shape `{\"databases\": [...], \"tables\": [...], \"fields\": [...]}`.

   `db-id->schemas` is `{<database-id> #{schema-name ...}}`; tables outside
   those schemas (and fields under them) are not emitted."
  [^java.io.OutputStream os db-id->schemas]
  (let [d-filter (db-where db-id->schemas)
        t-filter (table-where db-id->schemas)
        f-filter (field-where)
        writer   (java.io.BufferedWriter.
                  (java.io.OutputStreamWriter. os java.nio.charset.StandardCharsets/UTF_8))]
    (.write writer "{\"databases\":")
    (write-json-array! writer
                       (t2/reducible-select [:model/Database :d.id :d.name :d.engine]
                                            {:from  [[:metabase_database :d]]
                                             :where d-filter})
                       format-database-info)
    (.write writer ",\"tables\":")
    (write-json-array! writer
                       (t2/reducible-select [:model/Table :t.id :t.db_id :t.name :t.schema :t.description]
                                            {:from  [[:metabase_table :t]]
                                             :join  [[:metabase_database :d] [:= :t.db_id :d.id]]
                                             :where [:and d-filter t-filter]})
                       format-table-info)
    (.write writer ",\"fields\":")
    (write-json-array! writer
                       (t2/reducible-select [:model/Field :f.id :f.table_id :f.parent_id :f.fk_target_field_id
                                             :f.name :f.description :f.base_type :f.database_type
                                             :f.effective_type :f.semantic_type :f.coercion_strategy]
                                            {:from  [[:metabase_field :f]]
                                             :join  [[:metabase_table :t]    [:= :f.table_id :t.id]
                                                     [:metabase_database :d] [:= :t.db_id :d.id]]
                                             :where [:and d-filter t-filter f-filter]})
                       format-field-info)
    (.write writer "}")
    (.flush writer)))

(defn write-field-values!
  "Stream a workspace's sampled field values as JSON to `os` in the shape
   `{\"field_values\": [...]}`.

   Includes only unconstrained (`:full`) FieldValues — sandboxed, impersonation,
   and linked-filter variants are user-specific and excluded from a bulk export."
  [^java.io.OutputStream os db-id->schemas]
  (let [d-filter  (db-where db-id->schemas)
        t-filter  (table-where db-id->schemas)
        f-filter  (field-where)
        fv-filter (field-values-filter)
        writer    (java.io.BufferedWriter.
                   (java.io.OutputStreamWriter. os java.nio.charset.StandardCharsets/UTF_8))]
    (.write writer "{\"field_values\":")
    (write-json-array! writer
                       (t2/reducible-select [:model/FieldValues
                                             :fv.field_id :fv.values :fv.human_readable_values :fv.has_more_values]
                                            {:from  [[:metabase_fieldvalues :fv]]
                                             :join  [[:metabase_field :f]    [:= :fv.field_id :f.id]
                                                     [:metabase_table :t]    [:= :f.table_id :t.id]
                                                     [:metabase_database :d] [:= :t.db_id :d.id]]
                                             :where [:and d-filter t-filter f-filter fv-filter]})
                       format-field-values-entry)
    (.write writer "}")
    (.flush writer)))
