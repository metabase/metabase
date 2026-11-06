(ns metabase-enterprise.workspaces.config
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sample-data.core :as sample-data]
   [metabase.secrets.core :as secrets]
   [metabase.util.yaml :as yaml]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(defn- schema-filter-entries
  "Build sync-filter keys for the workspace's input scope. Per-engine:

   - schema-having JDBC drivers (Postgres, Redshift, SQL Server)
     emit `:schema-filters-*` — `metabase.driver.sync` reads these to scope
     describe-database to the named schemas.
   - ClickHouse emits `:db-filters-*` — CH calls its top-level namespaces
     'databases' (= schemas in MB's vocabulary) and its describe-database
     impl reads `:db-filters-*`, not `:schema-filters-*`. The canonical
     CH details already carry `:db-filters-patterns <bound-db>`, which would
     otherwise leak through and restrict sync to the canonical DB the
     workspace user has no GRANTs on.
   - BigQuery emits `:dataset-filters-*` — its `list-datasets` reads these
     instead (BQ doesn't go through `metabase.driver.sync`).
   - No-schema engines (MySQL) emit `{}` — JDBC reports `TABLE_SCHEM` as null
     and `schema-patterns->filter-fn*` documents inclusion patterns NEVER
     match a `nil` schema. Scoping on those is enforced by the connection's
     bound database (`:details.db`)."
  [{:keys [engine] :as db} wsd]
  (let [patterns (str/join "," (:input_schemas wsd))]
    (cond
      (= engine :bigquery-cloud-sdk)
      {:dataset-filters-type     "inclusion"
       :dataset-filters-patterns patterns}

      (= engine :clickhouse)
      {:db-filters-type     "inclusion"
       :db-filters-patterns patterns}

      (driver.u/supports? engine :schemas db)
      {:schema-filters-type     "inclusion"
       :schema-filters-patterns patterns}

      :else
      {})))

(def ^:private inlined-secrets
  "The `:secret` connection properties whose value the config carries, each with the detail that turns it on. Both are
   public: the root certificate verifies the warehouse, and the known hosts verify the SSH tunnel's host key. Without
   the known hosts the child's tunnel would skip host-key verification, so a known-hosts Secret that can't be resolved
   is refused rather than dropped."
  [{:label      "SSL root certificate"
    :name       "ssl-root-cert"
    :enabled-by :ssl
    :id         :ssl-root-cert-id
    :options    :ssl-root-cert-options
    :value      :ssl-root-cert-value
    :required?  false}
   {:label      "SSH known hosts"
    :name       "tunnel-known-hosts"
    :enabled-by :tunnel-enabled
    :id         :tunnel-known-hosts-id
    :options    :tunnel-known-hosts-options
    :value      :tunnel-known-hosts-value
    :required?  true}])

(defn- unreadable-secret [db label cause]
  (ex-info (format "The %s of database %s can't be read on this instance" label (pr-str (:name db)))
           {:status-code 409
            :database_id (:id db)}
           cause))

(defn- inlined-secret-entries
  "The keys `secret` adds to the config when the connection uses it: the value of its Secret, or a value the driver
   keeps in `:details` as is (Postgres doesn't store the known hosts as a Secret). A Secret the parent can't read (e.g.
   a missing local file) is a 409 naming the database rather than an opaque 500."
  [db details {:keys [label enabled-by id options value required?] secret-name :name}]
  (cond
    (not (get details enabled-by))
    nil

    (get details id)
    (let [secret-value (try
                         (secrets/value-as-string (:engine db) details secret-name)
                         (catch Exception e
                           (throw (unreadable-secret db label e))))]
      (when (and required? (nil? secret-value))
        (throw (unreadable-secret db label nil)))
      (when secret-value
        {options "uploaded"
         value   secret-value}))

    :else
    (select-keys details [options value])))

(defn- inline-secrets
  "Replace the `:secret` connection properties' Secret ids with what the child can use. `:secret` properties keep only
   the id of their Secret row in `:details`, and the parent's ids don't resolve in the child's app DB: there they could
   name an unrelated Secret the child's own import created. So every `-id` and `-options` is dropped, and the values in
   `inlined-secrets` ship instead, for the child's config-file import to store as Secrets of its own.

   The client certificate and key are not inlined (MBC10-87), so a connection that authenticates with them is a 409:
   the child would otherwise fail only when it connects."
  [db details]
  (when (and (:ssl details) (:ssl-use-client-auth details))
    (throw (ex-info (format "Database %s uses SSL client-certificate authentication, which workspace sidecars don't support"
                            (pr-str (:name db)))
                    {:status-code 409
                     :database_id (:id db)})))
  (let [;; the `-id`/`-options` naming follows `metabase.secrets.models.secret`. The inlined secrets are listed on
        ;; their own: Postgres nests the SSH-tunnel properties so that `secret-conn-props-by-name` doesn't list
        ;; `tunnel-known-hosts`.
        secret-names (into (set (map :name inlined-secrets))
                           (keys (secrets/secret-conn-props-by-name (:engine db))))
        drop-keys    (mapcat (fn [secret-name]
                               [(keyword (str secret-name "-id")) (keyword (str secret-name "-options"))])
                             secret-names)]
    (into (apply dissoc details drop-keys)
          (map #(inlined-secret-entries db details %))
          inlined-secrets)))

(defn- database-entry [wsd db]
  {:name    (:name db)
   :engine  (:engine db)
   ;; Force :let-user-control-scheduling false. The YAML only carries :details — not the
   ;; cache_field_values_schedule / metadata_sync_schedule columns — and infer-db-schedules
   ;; asserts those columns are present whenever user-control scheduling is on. Without
   ;; this override the round-trip blows up for any DB whose source details opted in.
   :details (inline-secrets db (merge (:details db)
                                      (:database_details wsd)
                                      (schema-filter-entries db wsd)
                                      {:let-user-control-scheduling false}))})

(defn- expand-output
  "Expand a driver-opaque `output_namespace` string into the `{:db ?, :schema ?}`
   namespace map QP middleware, transform_hooks, and table_remapping consume.

   For 3-slot drivers (SQL Server, BigQuery) the `:db` slot is filled from
   `Database.details`. For 2-slot drivers the namespace string lands in the
   schema slot. For no-schema drivers (MySQL) it lands in the db slot.

   `output_namespace` blank → `:schema` is `nil`: the workspace database isn't
   provisioned yet and QP/transform consumers treat it as having no output
   mapping."
  [db output-namespace]
  (let [components (set (driver/qualified-name-components (:engine db)))
        positions  (ws/engine-namespace-positions db)
        schema     (when-not (str/blank? output-namespace) output-namespace)]
    (cond-> {}
      (:db components)     (assoc :db (:db positions))
      (:schema components) (assoc :schema schema)
      (and (:db components) (not (:schema components)))
      (assoc :db schema))))

(defn- workspace-database-entry [wsd db]
  [(:name db) {:input_schemas (vec (:input_schemas wsd))
               :output        (expand-output db (:output_namespace wsd))}])

(defn- stub-database-entry [db]
  {:name    (:name db)
   :engine  (:engine db)
   :details {}
   :is_stub true})

(defn- stub-databases
  "Databases that exist in the instance but are not provisioned for this workspace.
   Excludes the sample DB (emitted separately by `sample-database-entries`), the
   audit DB, and routing-target databases (destinations with `:router_database_id` set)."
  [workspace-db-ids]
  (ws.db/stub-candidate-databases workspace-db-ids))

(defn- sample-database-entries
  "If the instance has a Sample Database, emit a single placeholder entry the
   import side will use to recreate it. Always uses the canonical name/engine —
   the entry is a directive (\"there should be a sample DB here\"), not a snapshot."
  []
  (when (ws.db/sample-database-exists?)
    [{:name      sample-data/sample-database-name
      :engine    "h2"
      :details   {}
      :is_sample true}]))

(defn build-workspace-config
  "Return a downloadable config.yml-shaped map for `workspace-id`:

    {:version 1
     :config  {:databases [...]
               :workspace {:name      <ws-name>
                           :databases {<db-name> {:input_schemas [<schema-name> ...]
                                                  :output        {:db ? :schema ?}}}}}

  Each database entry merges the underlying `metabase_database.details` with the
  WorkspaceDatabase's override credentials and adds `schema-filters-*` keys
  derived from `:input_schemas`. Per-database workspace entries carry the
  expanded `{:db ?, :schema ?}` namespace map directly — the same shape the
  `instance-workspace` setting stores. Returns nil when the workspace does not
  exist. Throws a 409 `ex-info` if any of the workspace's databases is not
  `:provisioned`."
  [workspace-id]
  (when-let [ws (workspace/get-workspace workspace-id)]
    (let [wsds (:databases ws)]
      (when (some #(not= :provisioned (:status %)) wsds)
        (throw (ex-info "Cannot build config while workspace has databases that are not :provisioned"
                        {:status-code  409
                         :workspace_id workspace-id})))
      (let [workspace-db-ids (mapv :database_id wsds)
            dbs-by-id        (if-let [ids (seq workspace-db-ids)]
                               (into {} (map (juxt :id identity))
                                     (ws.db/databases ids))
                               {})
            pairs            (for [wsd wsds
                                   :let [db (get dbs-by-id (:database_id wsd))]]
                               [wsd db])
            ws-entries       (mapv (fn [[wsd db]] (database-entry wsd db)) pairs)
            stub-entries     (mapv stub-database-entry (stub-databases workspace-db-ids))
            sample-entries   (sample-database-entries)]
        {:version 1
         :config  {:databases (-> ws-entries
                                  (into stub-entries)
                                  (into sample-entries))
                   :workspace {:name      (:name ws)
                               :databases (into {} (map (fn [[wsd db]] (workspace-database-entry wsd db))) pairs)}}}))))

(defn config->yaml
  "Render a workspace config map as a pretty-printed YAML string."
  [config]
  (yaml/generate-string config :dumper-options {:flow-style :block}))
