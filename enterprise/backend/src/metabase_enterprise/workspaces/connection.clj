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
                 ;; never a leaf of the schema, so a failed response check cannot quote the password
                 [:details [:map-of :keyword :any]]
                 [:schemas [:map-of :string :string]]
                 [:failed_schemas [:sequential [:map {:closed true}
                                                [:main_schema :string]
                                                [:error {:optional true} :string]]]]]]]])

;;; -------------------------------------------- Connection details --------------------------------------------

(def ^:private allowed-properties
  "Per engine, the connection properties a sidecar gets from the parent Database: where the warehouse is and how to
  talk to it, never who to log in as. Every other key of the parent's details is dropped, declared by the driver or
  not, so a property added later stays with the parent until it is listed here. Dropped by design, among others: the
  parent's user and password, auth providers, SQL Server AD logins, `role`, client certificates and keys, every SSH
  tunnel field (workspaces do not support tunnels), and `additional-options`, free-form JDBC options that can name a
  user, password, key file or integrated login (so a parent that needs them, e.g. `prepareThreshold=0` behind
  PgBouncer, is not supported). The workspace user's credentials, the schema filter and the SSL root certificate are
  added by [[connection-details]]."
  {;; `:db` is the older name of `:dbname`, which the driver still reads
   :postgres   #{:host :port :dbname :db :ssl :ssl-mode :json-unfolding :auto_run_queries :refingerprint}
   :redshift   #{:host :port :db :auto_run_queries :refingerprint}
   :sqlserver  #{:host :port :db :instance :ssl :auto_run_queries :refingerprint}
   :mysql      #{:host :port :dbname :ssl :ssl-cert :json-unfolding :auto_run_queries :refingerprint}
   :clickhouse #{:host :port :dbname :ssl :clickhouse-settings :max-open-connections :enable-multiple-db :use-no-proxy
                 :auto_run_queries :refingerprint}})

(defn- schema-filter-pattern
  "`schema-name` as an inclusion pattern that matches only itself: `metabase.driver.sync/schema-pattern->re-pattern`
  reads a pattern as a regex with unescaped `*` as a wildcard, so every regex metacharacter is escaped. Commas and
  surrounding whitespace cannot be expressed there; [[check-filterable-schema!]] refuses them."
  [schema-name]
  (str/replace schema-name #"[\\.^$|?*+()\[\]{}]" #(str "\\" %)))

(defn connection-details
  "The `details` a sidecar connects to a workspace database on `engine` with: the [[allowed-properties]] of the parent
  Database's `parent-details`, the workspace user's `workspace-details` (its user, password and any engine extras), a
  schema filter for exactly the main and scratch schemas of `schemas` (main -> scratch), and `root-cert`, the SSL root
  certificate, when there is one to send. The sidecar's config.yml loader carries no sync schedules, so the database's
  schedules are not left to the user. (Only `schema-filters-*` is written; ClickHouse reads `db-filters-*`, which
  matters once ClickHouse supports workspaces.)

  A plain `defn`, as are the functions below that handle these details: a failed Malli check would quote the
  password in its message."
  [engine parent-details workspace-details schemas root-cert]
  (-> (select-keys parent-details (allowed-properties engine))
      (cond-> root-cert (assoc :ssl-root-cert-options "uploaded"
                               :ssl-root-cert-value   root-cert))
      (merge workspace-details
             {:schema-filters-type         "inclusion"
              :schema-filters-patterns     (str/join "," (map schema-filter-pattern (concat (keys schemas) (vals schemas))))
              :let-user-control-scheduling false})))

(def ^:private verifying-ssl-modes
  "SSL modes in which the driver checks the server against the root certificate."
  #{"verify-ca" "verify-full"})

(defn- ssl-root-cert
  "The SSL root certificate to send for `database`, or nil: only when it connects over SSL in a mode that verifies the
  server, and only a certificate the admin uploaded, inline in the details or as an uploaded Secret. A certificate read
  from a file, a path in the details or a Secret whose source is a file path, is a 409 naming the database: sending it
  would hand any caller with a superuser login the content of any file the parent can read, and the path means nothing
  on the sidecar. A Secret id that resolves to nothing sends nothing; on the sidecar it could name an unrelated Secret."
  [{:keys [engine details] database-name :name database-id :id}]
  (when (and (:ssl details) (verifying-ssl-modes (:ssl-mode details)))
    (let [secret  (some-> (:ssl-root-cert-id details) secrets/latest-for-id)
          refuse! #(throw (ex-info (tru "The SSL root certificate of database {0} is read from a file; upload it instead to use the database for workspaces."
                                        (pr-str database-name))
                                   {:status-code 409, :database_id database-id}))]
      (cond
        (or (:ssl-root-cert-path details) (= "local" (:ssl-root-cert-options details))) (refuse!)
        (= "file-path" (some-> secret :source name))                                    (refuse!)
        secret (secrets/value-as-string (keyword engine) (select-keys details [:ssl-root-cert-id]) "ssl-root-cert")
        :else  (:ssl-root-cert-value details)))))

(defn- check-filterable-schema!
  "Throws a 409 for a main schema the sidecar's schema filter cannot express: a comma separates patterns, and the
  filter trims the whitespace around each."
  [main-schema]
  (when (or (str/includes? main-schema ",") (not= main-schema (str/trim main-schema)))
    (throw (ex-info (tru "Schema {0} cannot be used in a workspace connection: a schema name with a comma or leading or trailing whitespace is not supported."
                         (pr-str main-schema))
                    {:status-code 409, :schema main-schema}))))

;;; ------------------------------------------------ Connection ------------------------------------------------

(defn- effective
  [row]
  (-> row
      (assoc :status (ws.status/effective-status (:status row) (:stale row)))
      (dissoc :stale)))

(defn- check-no-tunnel!
  [{:keys [details] database-name :name database-id :id}]
  (when (:tunnel-enabled details)
    (throw (ex-info (tru "SSH tunnels are not supported for workspaces.")
                    {:status-code 400, :database_id database-id, :database_name database-name}))))

(defn- present-failed-schema
  [{:keys [main_schema error]}]
  (cond-> {:main_schema main_schema}
    error (assoc :error error)))

(defn workspace-connection
  "The `WorkspaceConnection` of the Workspace with `id` for the User with `user-id`: for each of its provisioned
  databases with an active schema, the Database's name and engine, the [[connection-details]] of the workspace user,
  its active schemas, main -> scratch, and its failed schemas with their errors. Throws a 404 when there is no such
  Workspace, a 403 unless `user-id` created it, a 400 when a database uses an SSH tunnel, and a 409 when a database's
  SSL root certificate is read from a file or a main schema cannot be expressed in the schema filter."
  [id user-id]
  (let [workspace (or (ws.db/workspace id)
                      (throw (ex-info (tru "Workspace {0} not found." (str id)) {:status-code 404, :id id})))
        _         (when-not (= user-id (:creator_id workspace))
                    (throw (ex-info (tru "Only the creator of a workspace can fetch its connection.")
                                    {:status-code 403})))
        wsds      (filter #(= :provisioned (:status %))
                          (map effective (ws.db/workspace-databases-of-workspaces [id] (ws.status/staleness :database))))
        schemas   (when (seq wsds)
                    (group-by (juxt :workspace_database_id :status)
                              (map effective (ws.db/workspace-schemas-of-workspace-databases
                                              (mapv :id wsds) (ws.status/staleness :schema)))))]
    {:workspace (select-keys workspace [:id :name])
     :databases (vec (for [wsd   wsds
                           :let  [active (get schemas [(:id wsd) :active])]
                           :when (seq active)
                           :let  [database   (doto (ws.db/database (:database_id wsd)) check-no-tunnel!)
                                  _          (run! (comp check-filterable-schema! :main_schema) active)
                                  schema-map (into {} (map (juxt :main_schema :scratch_namespace)) active)]]
                       {:name    (:name database)
                        :engine  (name (:engine database))
                        :details (connection-details (keyword (:engine database))
                                                     (:details database)
                                                     (:database_details (ws.db/workspace-database (:id wsd)))
                                                     schema-map
                                                     (ssl-root-cert database))
                        :schemas schema-map
                        :failed_schemas (mapv present-failed-schema (get schemas [(:id wsd) :failed]))}))}))

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
