(ns metabase.sync.jekyll-metadata
  "Jekyll mode Phase 4: ingest warehouse metadata from a parent Metabase instead
  of running driver sync.

  A Jekyll box never syncs its warehouse (no scheduler, no on-create sync); the
  parent instance has already paid that cost. At boot we fetch the parent's
  `GET /api/database/:id/metadata` for each local Database — matched **by
  name**, the same contract remote-sync content uses — and insert Table/Field
  rows directly, then mark initial sync complete.

  Idempotent: tables that already exist locally (matched by schema + name) are
  skipped, so re-boots with a persisted app-db don't duplicate rows and never
  rewrite Field ids that imported content may reference."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.sync.settings :as sync.settings]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn parent-get
  "GET `path` from the parent Metabase, decoded. Public for test redef."
  [path]
  (-> (http/get (str (str/replace (sync.settings/jekyll-parent-url) #"/+$" "") path)
                {:headers {"x-api-key" (sync.settings/jekyll-parent-api-key)}
                 :conn-timeout 10000
                 :socket-timeout 60000})
      :body
      (json/decode+kw)))

(defn- parent-database-id
  "Id of the parent's database with `db-name`, or nil."
  [db-name]
  (->> (:data (parent-get "/api/database"))
       (some #(when (= (:name %) db-name) (:id %)))))

(defn- insert-table!
  [db table]
  (t2/insert-returning-instance!
   :model/Table
   (merge {:db_id (u/the-id db)
           :name (:name table)
           :schema (:schema table)
           :display_name (:display_name table)
           :description (:description table)
           :active true
           :initial_sync_status "complete"}
          (when-let [vt (:visibility_type table)] {:visibility_type (keyword vt)})
          (when-let [fo (:field_order table)] {:field_order (keyword fo)})
          (when-let [erc (:estimated_row_count table)] {:estimated_row_count erc}))))

(defn- insert-field!
  "Insert one Field row for a parent field map (snake_case wire keys). Returns
  the new id. ponytail: nested (parent_id) fields are skipped by the caller —
  JSON-unfolding columns need real driver sync; add if a JSON warehouse shows up."
  [table-id field]
  (t2/insert-returning-pk!
   :model/Field
   (merge {:table_id table-id
           :name (:name field)
           :display_name (:display_name field)
           :description (:description field)
           :database_type (or (:database_type field) "NULL")
           :base_type (keyword (:base_type field))
           :effective_type (keyword (or (:effective_type field) (:base_type field)))
           :position (:position field)
           :database_position (or (:database_position field) (:position field))
           :active true
           :visibility_type (keyword (or (:visibility_type field) "normal"))}
          (when-let [st (:semantic_type field)] {:semantic_type (keyword st)})
          (when-let [cs (:coercion_strategy field)] {:coercion_strategy (keyword cs)})
          (when-let [fp (:fingerprint field)] {:fingerprint fp})
          (when-let [hfv (:has_field_values field)] {:has_field_values (keyword hfv)}))))

(defn- ingest-database!
  "Fetch parent metadata for `db` (matched by name) and insert missing
  Table/Field rows. Returns the number of tables inserted."
  [db]
  (let [parent-id (parent-database-id (:name db))]
    (if-not parent-id
      (do (log/warnf "Jekyll parent metadata: no parent database named %s; skipping" (pr-str (:name db)))
          0)
      (let [metadata (parent-get (format "/api/database/%d/metadata?include_hidden=true" parent-id))
            existing (or (t2/select-fn-set (juxt :schema :name) :model/Table :db_id (u/the-id db)) #{})
            new-tables (remove #(existing [(:schema %) (:name %)]) (:tables metadata))
            ;; parent field id -> local field id, for the FK second pass
            field-id->local (volatile! {})]
        (doseq [table new-tables
                :let [local-table (insert-table! db table)]
                field (sort-by :position (:fields table))
                :when (nil? (:parent_id field))]
          (vswap! field-id->local assoc (:id field) (insert-field! (u/the-id local-table) field)))
        ;; second pass: remap FK targets from parent field ids to local ones
        (doseq [field (mapcat :fields new-tables)
                :let [local-id (@field-id->local (:id field))
                      local-target (some-> (:fk_target_field_id field) (@field-id->local))]
                :when (and local-id local-target)]
          (t2/update! :model/Field local-id {:fk_target_field_id local-target}))
        (sync-util/set-initial-table-sync-complete-for-db! db)
        (sync-util/set-initial-database-sync-complete! db)
        ;; a stub with real metadata is no longer a stub: unhide it from the
        ;; database list so the ingested tables are browsable
        (t2/update! :model/Database (u/the-id db) {:is_stub false})
        (count new-tables)))))

(defn ingest-parent-metadata!
  "Ingest warehouse metadata from the configured parent Metabase for every local
  Database. No-op unless `jekyll-parent-url` is set. Failures are logged, never
  fatal — a Jekyll box without metadata still serves native-SQL transforms."
  []
  (when (seq (sync.settings/jekyll-parent-url))
    (doseq [db (t2/select :model/Database :is_audit false :is_sample false)]
      (try
        (let [n (ingest-database! db)]
          (log/infof "Jekyll parent metadata: database %s — %d tables ingested" (pr-str (:name db)) n))
        (catch Exception e
          (log/errorf e "Jekyll parent metadata: failed for database %s" (pr-str (:name db))))))))
