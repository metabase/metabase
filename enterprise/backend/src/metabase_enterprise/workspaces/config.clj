(ns metabase-enterprise.workspaces.config
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.api-keys.core :as api-key]
   [metabase.settings.core :as setting]
   [metabase.util.secret :as u.secret]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(def ^:private default-user
  "The single admin user bundled into the exported config — lets a fresh Metabase
  instance bootstrap from this file and log in immediately. Also the `creator`
  for the bundled api-key (that section requires the creator's email to resolve
  to a superuser on import). Callers are expected to change the password after
  import."
  {:first_name   "Workspace"
   :last_name    "Admin"
   :email        "workspace@workspace.local"
   :password     "password1"
   :is_superuser true})

(defn- generate-api-key-string
  "Return a fresh plaintext API key string in the `mb_...` format the import
  handler expects. The key is never persisted in the source instance; it only
  takes effect when the target instance processes the imported config."
  []
  (u.secret/expose (api-key/generate-key)))

(def ^:private api-key-name
  "Fixed name for the bundled API key. Metabase's api-keys config importer is
  idempotent by name, so a fresh key generated per export import-skips on a
  target that already has this key — the existing key stays active. That's the
  intended behavior: import once, reuse forever."
  "Workspace API Key")

(defn- api-key-entry []
  {:name    api-key-name
   :key     (generate-api-key-string)
   :group   "admin"
   :creator (:email default-user)})

(def ^:private exported-setting-keys
  "Settings we copy from the source instance into the exported config so the target
  instance inherits the same remote-sync wiring at boot. Only the four keys the
  workspace workflow cares about — not a blanket dump of every setting."
  [:remote-sync-url :remote-sync-type :remote-sync-branch :remote-sync-token])

(defn- exported-settings
  "Snapshot the `exported-setting-keys` on the source instance. Returns nil when
  `remote-sync-url` is unset — the other three keys are meaningless without it,
  so there's nothing worth exporting. Otherwise drops individual keys whose value
  is nil/blank."
  []
  (when-let [url (setting/get :remote-sync-url)]
    (when-not (str/blank? url)
      (into {}
            (keep (fn [k]
                    (let [v (setting/get k)]
                      (when (and (some? v)
                                 (not (and (string? v) (str/blank? v))))
                        [k v]))))
            exported-setting-keys))))

(defn- database-entry [wsd db]
  {:name    (:name db)
   :engine  (:engine db)
   :details (merge (:details db)
                   (:database_details wsd)
                   {:schema-filters-type     "inclusion"
                    :schema-filters-patterns (str/join "," (:input_schemas wsd))})})

(defn- workspace-database-entry [wsd db]
  [(:name db) {:input_schemas (vec (:input_schemas wsd))
               :output_schema (:output_schema wsd)}])

(defn build-workspace-config
  "Return a downloadable config.yml-shaped map for `workspace-id`:

    {:version 1
     :config  {:databases [...]
               :users     [<default-user>]
               :workspace {...}}}

  Each database entry merges the underlying `metabase_database.details` with the
  WorkspaceDatabase's override credentials and adds `schema-filters-*` keys
  derived from `:input_schemas`. Returns nil when the workspace does not exist.
  Throws a 409 `ex-info` if any of the workspace's databases is not
  `:provisioned`."
  [workspace-id]
  (when-let [ws (workspace/get-workspace workspace-id)]
    (let [wsds (:databases ws)]
      (when (some #(not= :provisioned (:status %)) wsds)
        (throw (ex-info "Cannot build config while workspace has databases that are not :provisioned"
                        {:status-code  409
                         :workspace_id workspace-id})))
      (let [dbs-by-id (if-let [ids (seq (map :database_id wsds))]
                        (into {} (map (juxt :id identity))
                              (t2/select :model/Database :id [:in ids]))
                        {})
            pairs     (for [wsd wsds
                            :let [db (get dbs-by-id (:database_id wsd))]]
                        [wsd db])]
        {:version 1
         :config  (cond-> {:databases (mapv (fn [[wsd db]] (database-entry wsd db)) pairs)
                           :users     [default-user]
                           :api-keys  [(api-key-entry)]
                           :workspace {:name      (:name ws)
                                       :databases (into {} (map (fn [[wsd db]] (workspace-database-entry wsd db))) pairs)}}
                    (seq (exported-settings)) (assoc :settings (exported-settings)))}))))

(defn config->yaml
  "Render a workspace config map as a pretty-printed YAML string."
  [config]
  (yaml/generate-string config :dumper-options {:flow-style :block}))
