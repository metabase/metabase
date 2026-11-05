(ns metabase-enterprise.workspaces.connection
  "A workspace's `WorkspaceConnection`: what a sidecar needs to connect to each of its databases as the workspace user,
  as JSON or as the config.yml a sidecar applies. It is the only thing the parent serves that carries a warehouse
  password, so the parent's own login is stripped here and nowhere else."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.status :as ws.status]
   [metabase.secrets.core :as secrets]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(mr/def ::workspace-connection
  [:map {:closed true}
   [:workspace [:map {:closed true}
                [:id   ms/PositiveInt]
                [:name ms/NonBlankString]]]
   [:databases [:sequential
                [:map {:closed true}
                 [:name    :string]
                 [:engine  :string]
                 [:details :map]
                 [:schemas [:map-of :string :string]]]]]])

;;; ---------------------------------------------- Parent's login ----------------------------------------------

(def ^:private parent-login-properties
  "Connection properties of the workspace engines (Postgres, Redshift, SQL Server, MySQL, ClickHouse) that pick or
  carry the parent's own login, or a credential of the parent's. Each would make the sidecar connect as the parent, or
  hand it a parent secret.

  - `:user`, `:password`: the parent's login; the workspace user's replace them.
  - Auth providers (`metabase.driver.common/auth-provider-options`): with `:use-auth-provider` set, the driver swaps
    the password for a token fetched for the parent's identity; `:oauth-token-headers` can carry a client secret.
  - SQL Server: `:auth-mode` picks an Azure AD login over the SQL login, with the `ad-*` client id, secret and managed
    identity; `:domain` qualifies the user name.
  - `:role`: the role or user the parent's login switches to (MySQL, SQL Server impersonation).
  - `:ssl-use-client-auth`: Postgres client-certificate login; its certificate and key are secrets below.
  - SSH tunnel credentials: the parent's login on the bastion.
  - `:additional-options`: free-form JDBC options, which can name a user, password, key file or integrated login."
  #{:user :password
    :use-auth-provider :auth-provider :azure-managed-identity-client-id :oauth-token-url :oauth-token-headers
    :auth-mode :ad-client-id :ad-client-secret :ad-managed-identity-client-id :domain
    :role
    :ssl-use-client-auth
    :tunnel-pass :tunnel-private-key :tunnel-private-key-passphrase
    :additional-options})

(def ^:private parent-login-secret-properties
  "`:secret` connection properties that are the parent's credentials: Postgres client certificate and key, SQL Server
  AD certificate and key, and the tunnel's known hosts, which only serve the tunnel credentials dropped above."
  ["ssl-client-cert" "ssl-key" "ssl-key-password"
   "ad-client-certificate" "ad-client-certificate-password" "ad-client-key" "ad-client-key-password"
   "tunnel-known-hosts"])

(def ^:private secret-property-suffixes
  "The keys a `:secret` connection property is stored under in `:details`, its own name included: the value, a file
  path, the upload option, the id of its Secret row, and legacy keys (see `metabase.secrets.models.secret`)."
  ["" "-value" "-path" "-options" "-id" "-source" "-kind" "-creator-id" "-created-at"])

(def ^:private parent-login-keys
  (into parent-login-properties
        (for [property parent-login-secret-properties
              suffix   secret-property-suffixes]
          (keyword (str property suffix)))))

(def ^:private ssl-root-cert-reference-keys
  "Where the parent finds its SSL root certificate: a Secret row of the parent's app DB, or a file on the parent. Neither
  resolves on the sidecar, and a Secret id there could name an unrelated Secret the sidecar would then trust."
  [:ssl-root-cert-id :ssl-root-cert-path])

(defn connection-details
  "The `details` a sidecar connects to a workspace database with: the parent Database's `parent-details` without the
  parent's login (see [[parent-login-properties]]), with the workspace user's `workspace-details` (its user, password
  and any engine extras), a schema filter for exactly the main and scratch schemas of `schemas` (main -> scratch), and
  the SSL root certificate as its value, `root-cert`, when the parent reads it from a Secret or a file. The sidecar's
  config.yml loader carries no sync schedules, so the database's schedules are not left to the user.

  A plain `defn`, as are the functions below that handle these details: a failed Malli check would quote the
  password in its message."
  [parent-details workspace-details schemas root-cert]
  (-> (apply dissoc parent-details (concat parent-login-keys ssl-root-cert-reference-keys))
      (cond-> root-cert (assoc :ssl-root-cert-options "uploaded"
                               :ssl-root-cert-value   root-cert))
      (merge workspace-details
             {:schema-filters-type         "inclusion"
              :schema-filters-patterns     (str/join "," (concat (keys schemas) (vals schemas)))
              :let-user-control-scheduling false})))

(defn- ssl-root-cert
  "The SSL root certificate of `database` when its details refer to it by Secret id or file path, else nil. Throws a
  409 naming the database when it cannot be read."
  [{:keys [engine details] database-name :name database-id :id}]
  (when (some details ssl-root-cert-reference-keys)
    (try
      (secrets/value-as-string (keyword engine) details "ssl-root-cert")
      (catch Exception e
        (throw (ex-info (tru "The SSL root certificate of database {0} cannot be read on this instance."
                             (pr-str database-name))
                        {:status-code 409, :database_id database-id}
                        e))))))

;;; ------------------------------------------------ Connection ------------------------------------------------

(defn- effective
  [row]
  (-> row
      (assoc :status (ws.status/effective-status (:status row) (:stale row)))
      (dissoc :stale)))

(defn workspace-connection
  "The `WorkspaceConnection` of the Workspace with `id` for the User with `user-id`: for each of its provisioned
  databases with an active schema, the Database's name and engine, the [[connection-details]] of the workspace user,
  and its active schemas, main -> scratch. Throws a 404 when there is no such Workspace, a 403 unless `user-id`
  created it, and a 409 when a database's SSL root certificate cannot be read."
  [id user-id]
  (let [workspace (or (ws.db/workspace id)
                      (throw (ex-info (tru "Workspace {0} not found." (str id)) {:status-code 404, :id id})))
        _         (when-not (= user-id (:creator_id workspace))
                    (throw (ex-info (tru "Only the creator of a workspace can fetch its connection.")
                                    {:status-code 403})))
        wsds      (filter #(= :provisioned (:status %))
                          (map effective (ws.db/workspace-databases-of-workspaces [id] (ws.status/staleness :database))))
        schemas   (when (seq wsds)
                    (group-by :workspace_database_id
                              (filter #(= :active (:status %))
                                      (map effective (ws.db/workspace-schemas-of-workspace-databases
                                                      (mapv :id wsds) (ws.status/staleness :schema))))))]
    {:workspace (select-keys workspace [:id :name])
     :databases (vec (for [wsd   wsds
                           :let  [active (schemas (:id wsd))]
                           :when (seq active)
                           :let  [database   (ws.db/database (:database_id wsd))
                                  schema-map (into {} (map (juxt :main_schema :scratch_namespace)) active)]]
                       {:name    (:name database)
                        :engine  (name (:engine database))
                        :details (connection-details (:details database)
                                                     (:database_details (ws.db/workspace-database (:id wsd)))
                                                     schema-map
                                                     (ssl-root-cert database))
                        :schemas schema-map}))}))

(defn config-yml
  "`connection`, a `WorkspaceConnection`, as the config.yml a sidecar applies: each database under `config.databases`,
  and the workspace's name and schema map under `config.workspace`, which puts the sidecar in workspace mode."
  [{:keys [workspace databases]}]
  (yaml/generate-string
   {:version 1
    :config  {:databases (mapv #(select-keys % [:name :engine :details]) databases)
              :workspace {:name      (:name workspace)
                          :databases (into {} (map (juxt :name #(select-keys % [:schemas]))) databases)}}}
   :dumper-options {:flow-style :block}))
