(ns metabase.llm.context
  "Resolves the tables and cards a native query references, with permission-filtered column metadata."
  (:require
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.llm.db :as llm.db]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.models.interface :as mi]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn extract-tables-from-sql
  "Extract table IDs from a raw SQL string.

   Parses the SQL to identify referenced table names, then queries the
   database to resolve those names to table IDs. When the SQL includes
   schema-qualified references (e.g., schema.table), matches on both
   schema and table name.

   Returns a set of table IDs (integers), or empty set if parsing fails
   or no tables are found."
  [database-id sql-string]
  (if (and database-id (seq sql-string))
    (try
      (let [driver (llm.db/database-engine database-id)
            tables (sql-tools/referenced-tables-raw driver sql-string)]
        (if (seq tables)
          (let [matched-tables (llm.db/active-tables-matching database-id tables)]
            (into #{} (map :id) matched-tables))
          #{}))
      (catch Exception e
        (log/warnf "Failed to extract tables from source SQL: %s" (ex-message e))
        #{}))
    #{}))

(defn extract-card-ids-from-template-tags
  "Extract referenced Card IDs from native query template tags. Card template
   tags cover both saved questions and models. Returns an empty set when no
   card tags are present."
  [template-tags]
  (if (map? template-tags)
    (into #{}
          (keep (fn [[_ tag]]
                  (when (and (map? tag)
                             (contains? #{"card" :card} (:type tag)))
                    (or (:card-id tag) (:card_id tag)))))
          template-tags)
    #{}))

;;; ------------------------------------------ Permission-Filtered Fetch ------------------------------------------

(defn- fetch-accessible-tables
  "Fetch tables by ID, filtering to those in `database-id` that the current user can access.
   Returns a map of table-id -> table record."
  [database-id table-ids]
  (when (seq table-ids)
    (let [tables (llm.db/visible-tables table-ids database-id api/*current-user-id* api/*is-superuser?*)]
      (into {} (map (juxt :id identity)) tables))))

(defn get-accessible-card-ids
  "Return readable, non-archived Card IDs from `card-ids`."
  [card-ids]
  (when (seq card-ids)
    (->> (llm.db/unarchived-cards card-ids)
         (filter mi/can-read?)
         (map :id)
         set)))

;;; ----------------------------------------- Metadata Provider Column Fetch -----------------------------------------

(defn- fetch-table-columns
  "Use metadata provider to get visible columns for a table.
   Returns sequence of column maps with the metadata the API response needs.
   Excludes implicitly-joinable columns."
  [mp table-id]
  (when-let [table-meta (lib.metadata/table mp table-id)]
    (let [table-query (lib/query mp table-meta)
          columns     (lib/visible-columns table-query -1 {:include-implicitly-joinable? false})]
      (mapv (fn [col]
              {:id                 (:id col)
               :name               (:name col)
               :database_type      (or (:database-type col)
                                       (some-> (:base-type col) name))
               :description        (:description col)
               :semantic_type      (:semantic-type col)
               :fk_target_field_id (:fk-target-field-id col)})
            columns))))

(defn- filter-sandbox-restricted-columns
  "Remove columns that the current user's column-level sandbox does not expose for `table-id`."
  [table-id columns sandbox-restricted]
  (if-let [allowed-field-ids (get sandbox-restricted table-id)]
    (filterv #(contains? allowed-field-ids (:id %)) columns)
    columns))

(defn- fetch-fk-targets
  "Fetch table.field names for FK target fields.
   Only includes targets in `database-id` whose Table the current user can access and whose column,
   if sandbox-restricted, is one the current user is allowed to see.
   Returns map of target-field-id -> {:table name :field name}"
  [database-id columns]
  (let [target-ids (->> columns
                        (keep :fk_target_field_id)
                        set)]
    (when (seq target-ids)
      (let [fields              (llm.db/field-names-and-tables target-ids)
            table-ids           (into #{} (map :table_id) fields)
            accessible-tables   (fetch-accessible-tables database-id table-ids)
            sandbox-restricted  (metabot.perms/sandbox-restricted-fields table-ids)]
        (into {}
              (keep (fn [{:keys [id name table_id]}]
                      (let [allowed-field-ids (get sandbox-restricted table_id)]
                        (when (and (get accessible-tables table_id)
                                   (or (nil? allowed-field-ids) (contains? allowed-field-ids id)))
                          [id {:table (:name (get accessible-tables table_id)) :field name}]))))
              fields)))))

(defn- fetch-accessible-tables-with-columns
  "Fetch the tables in `table-ids` the current user can access in `database-id`, and build each one's
   sandbox-filtered column list via the metadata provider.

   Does not require read access to `database-id`: a user who can't reach any of the requested tables
   gets nil rather than a 403.

   Returns nil when the user can't reach any of the requested tables in `database-id`; otherwise a
   vector of `{:id :name :schema :display_name :description :columns}` maps -- possibly empty, if
   every accessible table's columns were entirely sandboxed away."
  [database-id table-ids]
  (let [accessible-tables (fetch-accessible-tables database-id table-ids)]
    (when (seq accessible-tables)
      (lib-be/with-metadata-provider-cache
        (let [mp (lib-be/application-database-metadata-provider database-id)
              _ (lib.metadata/bulk-metadata mp :metadata/table (keys accessible-tables))
              sandbox-restricted (metabot.perms/sandbox-restricted-fields (set (keys accessible-tables)))]
          (vec (keep (fn [[table-id table]]
                       (when-let [columns (seq (filter-sandbox-restricted-columns
                                                table-id
                                                (fetch-table-columns mp table-id)
                                                sandbox-restricted))]
                         {:id           table-id
                          :name         (:name table)
                          :schema       (:schema table)
                          :display_name (:display_name table)
                          :description  (:description table)
                          :columns      columns}))
                     accessible-tables)))))))

;;; ------------------------------------------------- Public API -------------------------------------------------

(defn- format-columns-for-response
  "Format columns for API response, resolving FK targets."
  [columns fk-targets-map]
  (mapv (fn [col]
          (let [fk-info (get fk-targets-map (:fk_target_field_id col))]
            (cond-> {:id            (:id col)
                     :name          (:name col)
                     :database_type (:database_type col)
                     :description   (:description col)
                     :semantic_type (some-> (:semantic_type col) name)}
              fk-info (assoc :fk_target {:table_name (:table fk-info)
                                         :field_name (:field fk-info)}))))
        columns))

(defn get-tables-with-columns
  "Fetch tables with their columns for the extract-sources endpoint.
   Returns lightweight metadata without triggering fingerprinting or field values.

   Parameters:
   - database-id: Database containing the tables
   - table-ids: Set of table IDs to include

   Returns a vector of table maps with :id, :name, :schema, :display_name,
   :description, and :columns (with FK targets resolved), or nil."
  [database-id table-ids]
  (when (and database-id (seq table-ids))
    (metabot.perms/with-cache
      (when-let [tables-with-columns (fetch-accessible-tables-with-columns database-id table-ids)]
        (let [all-columns    (mapcat :columns tables-with-columns)
              fk-targets-map (fetch-fk-targets database-id all-columns)]
          (mapv (fn [table]
                  (update table :columns format-columns-for-response fk-targets-map))
                tables-with-columns))))))
