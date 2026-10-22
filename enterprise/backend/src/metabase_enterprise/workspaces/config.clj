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

(def ^:private parent-login-keys
  "Connection properties that pick or carry the parent's own warehouse login. The workspace user logs in with
  the `:user`/`:password` in `:database_details`, so the config must carry none of these: each one either makes
  the child connect as the parent's identity or leaks a parent credential.

  - Auth provider (`metabase.driver.common/auth-provider-options`): with `:use-auth-provider` still set, the
    child replaces the password with a token fetched for the parent's identity. `:oauth-token-headers` can carry
    a client secret.
  - `:auth-mode` selects the login on SQL Server and Snowflake. Without it, SQL Server falls back to SQL login
    (`:user`/`:password`).
  - SQL Server's Azure AD logins (`ad-*`): the service-principal client ID/secret, the certificate and key
    secrets (every secret sub-key), and the managed-identity client ID."
  [:use-auth-provider :auth-provider :azure-managed-identity-client-id :oauth-token-url :oauth-token-headers
   :auth-mode
   :ad-client-id :ad-client-secret :ad-managed-identity-client-id
   :ad-client-certificate :ad-client-certificate-value :ad-client-certificate-path :ad-client-certificate-options
   :ad-client-certificate-id :ad-client-certificate-source :ad-client-certificate-kind
   :ad-client-certificate-creator-id :ad-client-certificate-created-at
   :ad-client-certificate-password :ad-client-certificate-password-value :ad-client-certificate-password-path
   :ad-client-certificate-password-options :ad-client-certificate-password-id
   :ad-client-certificate-password-source :ad-client-certificate-password-kind
   :ad-client-certificate-password-creator-id :ad-client-certificate-password-created-at
   :ad-client-key :ad-client-key-value :ad-client-key-path :ad-client-key-options
   :ad-client-key-id :ad-client-key-source :ad-client-key-kind
   :ad-client-key-creator-id :ad-client-key-created-at
   :ad-client-key-password :ad-client-key-password-value :ad-client-key-password-path
   :ad-client-key-password-options :ad-client-key-password-id
   :ad-client-key-password-source :ad-client-key-password-kind
   :ad-client-key-password-creator-id :ad-client-key-password-created-at])

(defn- drop-unused-tunnel-secrets
  "Remove the SSH-tunnel credentials when `:tunnel-enabled` is falsey: the child's driver
   only opens the tunnel when it is set, so leftover credentials from a tunnel that was
   switched off would otherwise ship to the child's config.yml for nothing. They are plain
   `:password`/`:string` connection properties, so unlike `:secret` properties (stored in
   the Secret table, only their `-id` in `:details`) they sit in `:details` verbatim."
  [details]
  (cond-> details
    (not (:tunnel-enabled details)) (dissoc :tunnel-pass :tunnel-private-key :tunnel-private-key-passphrase)))

(defn- database-entry [wsd db]
  {:name    (:name db)
   :engine  (:engine db)
   ;; Force :let-user-control-scheduling false. The YAML only carries :details — not the
   ;; cache_field_values_schedule / metadata_sync_schedule columns — and infer-db-schedules
   ;; asserts those columns are present whenever user-control scheduling is on. Without
   ;; this override the round-trip blows up for any DB whose source details opted in.
   :details (drop-unused-tunnel-secrets
             (merge (apply dissoc (:details db) parent-login-keys)
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

  Each database entry merges the underlying `metabase_database.details`, minus the
  parent's login properties (`parent-login-keys`), with the WorkspaceDatabase's
  override credentials and adds `schema-filters-*` keys
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
