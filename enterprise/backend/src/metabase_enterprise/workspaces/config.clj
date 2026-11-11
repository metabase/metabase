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
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [ring.util.codec :as codec]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(set! *warn-on-reflection* true)

(defn- literal-schema-pattern
  "`schema-name` as a sync-filter pattern that matches only `schema-name`.
   [[metabase.driver.sync/schema-pattern->re-pattern]] splits patterns on `,`, trims each one,
   expands `*` and passes everything else through as regex source, so a real name containing
   `,`, `*`, edge whitespace or a regex metacharacter (`.`, `+`, `(`) would miss itself, match
   other names, or fail to compile.
   Each character outside `[A-Za-z0-9_]` becomes a Java regex `\\x{HEX}` escape, which contains
   none of the characters that conversion acts on."
  [schema-name]
  (str/replace schema-name #"[^A-Za-z0-9_]" #(format "\\x{%X}" (.codePointAt ^String % 0))))

(defn- schema-filter-entries
  "Build sync-filter keys for the workspace's input scope. Per-engine:

   - schema-having JDBC drivers (Postgres, Redshift, SQL Server)
     emit `:schema-filters-*` — `metabase.driver.sync` reads these to scope
     describe-database to the named schemas. Names go through
     [[literal-schema-pattern]] so each matches only itself.
   - ClickHouse emits `:db-filters-*` — CH calls its top-level namespaces
     'databases' (= schemas in MB's vocabulary) and its describe-database
     impl reads `:db-filters-*`, not `:schema-filters-*`. The canonical
     CH details already carry `:db-filters-patterns <bound-db>`, which would
     otherwise leak through and restrict sync to the canonical DB the
     workspace user has no GRANTs on. CH reads these as a comma-separated
     list of trimmed names (with `-` read as `_`), not as regex, so they stay
     unescaped. A name holding `,`, `-` or edge whitespace therefore does not
     select exactly itself.
   - BigQuery emits `:dataset-filters-*` — its `list-datasets` reads these
     instead, through the same pattern syntax, so names are escaped the same way.
   - No-schema engines (MySQL) emit `{}` — JDBC reports `TABLE_SCHEM` as null
     and `schema-patterns->filter-fn*` documents inclusion patterns NEVER
     match a `nil` schema. Scoping on those is enforced by the connection's
     bound database (`:details.db`)."
  [{:keys [engine] :as db} wsd]
  (let [input-schemas (:input_schemas wsd)
        patterns      (str/join "," (map literal-schema-pattern input-schemas))]
    (cond
      (= engine :bigquery-cloud-sdk)
      {:dataset-filters-type     "inclusion"
       :dataset-filters-patterns patterns}

      (= engine :clickhouse)
      {:db-filters-type     "inclusion"
       :db-filters-patterns (str/join "," input-schemas)}

      (driver.u/supports? engine :schemas db)
      {:schema-filters-type     "inclusion"
       :schema-filters-patterns patterns}

      :else
      {})))

(def ^:private parent-login-keys
  "Connection properties of the eligible engines that pick or carry the parent's own warehouse login. The workspace
  user logs in with the `:user`/`:password` in `:database_details`, so the config must carry none of these: each one
  either makes the child connect with something other than that login or leaks a parent credential. Logins written
  into `:additional-options` are refused instead (`check-additional-options!`). Engines that can't be a workspace
  database, such as Snowflake and BigQuery, have credentials this list does not name.

  - Auth provider (`metabase.driver.common/auth-provider-options`): with `:use-auth-provider` still set, the
    child replaces the password with a token from the provider: for OAuth, fetched with the parent's client
    settings (`:oauth-token-headers` can carry a client secret); for Azure managed identity, from the child's host
    with the parent's client ID; for AWS IAM, with the child host's credentials.
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

(def ^:private tunnel-secret-keys-by-auth-option
  "The tunnel credentials each `:tunnel-auth-option` uses."
  {"password" #{:tunnel-pass}
   "ssh-key"  #{:tunnel-private-key :tunnel-private-key-passphrase}})

(defn- drop-unused-tunnel-secrets
  "Remove the SSH-tunnel credentials the child has no use for, so leftovers don't ship to its config.yml. They are
   plain `:password`/`:string` connection properties, so unlike `:secret` properties (stored in the Secret table,
   only their `-id` in `:details`) they sit in `:details` verbatim.

   - `:tunnel-enabled` falsey: all of them; the driver only opens the tunnel when it is set.
   - `:tunnel-auth-option` set: those of the other option. The driver offers every credential present, so this
     follows what the admin chose rather than what the driver would try. `:tunnel-auth-option` is a UI flag that
     the driver never reads, so this trusts it to match the credentials the tunnel uses. Without the option
     (details created through the API) both stay, since nothing says which one is in use."
  [details]
  (let [all-keys (reduce into #{} (vals tunnel-secret-keys-by-auth-option))]
    (cond
      (not (:tunnel-enabled details))
      (apply dissoc details all-keys)

      (contains? tunnel-secret-keys-by-auth-option (:tunnel-auth-option details))
      (apply dissoc details (remove (tunnel-secret-keys-by-auth-option (:tunnel-auth-option details)) all-keys))

      :else
      details)))

(def ^:private inlined-secrets
  "The `:secret` connection properties whose value the config carries, each with the detail that turns it on. Both are
   public: the root certificate verifies the warehouse, and the known hosts verify the SSH tunnel's host key. Without
   the known hosts the child's tunnel would skip host-key verification, so a known-hosts Secret that can't be resolved
   is refused rather than dropped. Only uploaded Secrets ship (`inlined-secret-entries`)."
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

(defn- refuse-secret
  "A 422 that names the database of the refused Secret."
  [db message-format label]
  (ex-info (format message-format label (pr-str (:name db)))
           {:status-code 422
            :database_id (:id db)}))

(defn- shippable-secret-value
  "`bs` as text when it is printable ASCII, as PEM certificates and known-hosts lines are; else as a base64 `data:` URI,
   which the child's config-file import decodes back to the same bytes. Decoding binary content such as a DER
   certificate as UTF-8 would corrupt it."
  [^bytes bs]
  (if (every? (fn [b] (let [b (long b)] (or (<= 32 b 126) (contains? #{9 10 13} b)))) bs)
    (u/bytes-to-string bs)
    (str "data:application/octet-stream;base64," (u/encode-base64-bytes bs))))

(defn- inlined-secret-entries
  "The keys an inlined secret (an entry of `inlined-secrets`) adds to the config when the connection uses it: the value
   of its uploaded Secret, or a value the driver keeps in `:details` as is (Postgres doesn't store the known hosts as a
   Secret). An optional Secret whose row is gone is dropped. These cases are a 422 naming the database:

   - the Secret is a file path on the parent's server: its contents could be any file the server can read, so they
     don't ship, and the admin has to upload the file instead.
   - a required Secret's row is gone."
  [db details {:keys [label enabled-by id options value required?]}]
  (cond
    (not (get details enabled-by))
    nil

    (get details id)
    (let [{:keys [source] secret-value :value} (secrets/latest-for-id (get details id))]
      (cond
        (and (nil? secret-value) required?)
        (throw (refuse-secret db (str "The %s of database %s no longer exist on this instance. Enter them again in the "
                                      "database's connection settings; without them the workspace would not verify the "
                                      "SSH host key.")
                              label))

        (nil? secret-value)
        nil

        ;; the secrets model reads a Secret with no source as uploaded
        (not= :uploaded (or source :uploaded))
        (throw (refuse-secret db (str "The %s of database %s is a file on this instance's server, which workspaces "
                                      "don't copy. Upload the file in the database's connection settings instead.")
                              label))

        :else
        {options "uploaded"
         value   (shippable-secret-value secret-value)}))

    :else
    (select-keys details [options value])))

(defn- inline-secrets
  "Replace the `:secret` connection properties' Secret ids with what the child can use. `:secret` properties keep only
   the id of their Secret row in `:details`, and the parent's ids don't resolve in the child's app DB: there they could
   name an unrelated Secret the child's own import created. So every `-id` and `-options`, and the `-value` of each of
   `inlined-secrets`, is dropped. The values of the `inlined-secrets` whose feature is on ship instead, for the child's
   config-file import to store as Secrets of its own.

   The client certificate and key are not inlined, so a connection that authenticates with them is a 422: the child
   would otherwise fail only when it connects."
  [db details]
  (when (and (:ssl details) (:ssl-use-client-auth details))
    (throw (ex-info (format (str "Database %s uses SSL client-certificate authentication, which workspaces don't "
                                 "support. Remove the database from the workspace, or turn off client-certificate "
                                 "authentication for it.")
                            (pr-str (:name db)))
                    {:status-code 422
                     :database_id (:id db)})))
  (let [;; the `-id`/`-options` naming follows `metabase.secrets.models.secret`. The inlined secrets are listed on
        ;; their own: Postgres puts the SSH-tunnel properties in a nested vector, which `secret-conn-props-by-name`
        ;; does not read, so it does not list `tunnel-known-hosts`.
        secret-names (into (set (map :name inlined-secrets))
                           (keys (secrets/secret-conn-props-by-name (:engine db))))
        ;; an inlined secret's `-value` is dropped too: `inlined-secret-entries` adds it back only when its feature
        ;; is on, so a leftover plain value of a disabled feature doesn't ship.
        drop-keys    (concat (mapcat (fn [secret-name]
                                       [(keyword (str secret-name "-id")) (keyword (str secret-name "-options"))])
                                     secret-names)
                             (map :value inlined-secrets))]
    (into (apply dissoc details drop-keys)
          (map #(inlined-secret-entries db details %))
          inlined-secrets)))

(def ^:private login-option-name
  "Names of JDBC options that set a login or carry a credential, matched against option names normalized by
   [[driver.u/normalize-connection-parameter]] (case-folded, `_ . - +` and whitespace removed): the exact login names,
   or any name containing a credential word (`SecretAccessKey`, `SessionToken`, `sslpassword`). MySQL's
   `passwordCharacterEncoding` and Redshift's `TokenType` name no credential and are let through."
  #"(?x) (?!passwordcharacterencoding$|tokentype$)
         (?:user|username|uid|sslkey|accesskeyid|aadsecureprincipalid|.*(?:password|pwd|secret|token).*)")

(def ^:private login-option-assignment
  "An exact login name set anywhere in a normalized `:additional-options` string, after any non-word character. A
   backstop for separators other than `&` and `;`."
  #"(?U)(?:^|\W)(user|username|uid|sslkey|accesskeyid|aadsecureprincipalid)=")

(def ^:private max-percent-decode-rounds
  "How many times an `:additional-options` string may be percent-encoded before it is refused outright."
  5)

(defn- percent-decode-fully
  "`s` percent-decoded until it stops changing, or nil when it still changes after [[max-percent-decode-rounds]]
   rounds. Drivers may decode option names more than once, and an encoded `&` or `;` can hide a name."
  [s]
  (loop [s (str s), rounds 0]
    (let [decoded (codec/percent-decode s)]
      (cond
        (= decoded s)                       s
        (< rounds max-percent-decode-rounds) (recur decoded (inc rounds))
        :else                               nil))))

(defn- additional-option-names
  "The option names in an `:additional-options` string: `name=value` pairs separated by `&` (Postgres, MySQL,
   Redshift, ClickHouse) or `;` (SQL Server), with an optional leading `?`."
  [additional-options]
  (for [part  (str/split (str additional-options) #"[&;]")
        :let  [option-name (-> part (str/split #"=" 2) first str/trim (str/replace #"^\?" ""))]
        :when (seq option-name)]
    option-name))

(defn- login-option
  "What in the `additional-options` string sets a login or carries a credential, as text for an error message, or
   nil. The string is percent-decoded fully before it is split, so encoded names and separators are seen."
  [additional-options]
  (if-let [decoded (percent-decode-fully additional-options)]
    (or (some #(when (re-matches login-option-name (driver.u/normalize-connection-parameter %)) %)
              (additional-option-names decoded))
        (second (re-find login-option-assignment (driver.u/normalize-connection-parameter decoded))))
    (format "an option percent-encoded more than %d times" max-percent-decode-rounds)))

(defn- check-additional-options!
  "Throw a 422 when the parent's `:additional-options` set a login or carry a credential. The string ships to the
   config as is, and drivers such as pgjdbc let URL options override the workspace's `:user`/`:password`, so the child
   would connect as the parent and the config's holder would read the parent's password."
  [db]
  (when-let [option (some-> (:additional-options (:details db)) login-option)]
    (throw (ex-info (format (str "Database %s sets %s in its additional JDBC connection options, which would give the "
                                 "workspace the parent's login. Remove it from the database's connection settings, or "
                                 "remove the database from the workspace.")
                            (pr-str (:name db)) option)
                    {:status-code 422
                     :database_id (:id db)}))))

(defn- database-entry [wsd db]
  (check-additional-options! db)
  {:name    (:name db)
   :engine  (:engine db)
   ;; Force :let-user-control-scheduling false. The YAML only carries :details — not the
   ;; cache_field_values_schedule / metadata_sync_schedule columns — and infer-db-schedules
   ;; asserts those columns are present whenever user-control scheduling is on. Without
   ;; this override the round-trip blows up for any DB whose source details opted in.
   :details (inline-secrets db (drop-unused-tunnel-secrets
                                (merge (apply dissoc (:details db) parent-login-keys)
                                       (:database_details wsd)
                                       (schema-filter-entries db wsd)
                                       {:let-user-control-scheduling false})))})

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
  override credentials, drops SSH-tunnel secrets the tunnel does not use
  (`drop-unused-tunnel-secrets`), replaces every Secret id with the value of the
  inlined secrets in use (`inline-secrets`), and adds `schema-filters-*` keys
  derived from `:input_schemas`. Per-database workspace entries carry the
  expanded `{:db ?, :schema ?}` namespace map directly — the same shape the
  `instance-workspace` setting stores. Returns nil when the workspace does not
  exist. Throws a 409 `ex-info` when a workspace database is not `:provisioned`
  (waiting clears it), and a 422 when only an admin can clear the cause: its
  `:additional-options` set a login (`check-additional-options!`), it uses SSL
  client-certificate auth, or an inlined secret in use can't ship
  (`inlined-secret-entries`)."
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
