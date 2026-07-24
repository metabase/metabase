(ns metabase-enterprise.transforms-python.connectors
  "Registry and creation logic for no-code ingestion connectors.

  A connector is a python transform template plus the metadata needed to instantiate it: config
  fields rendered into the template, a secret env var, and a default incremental target. Creating
  a connection produces a regular python transform that users can view and edit."
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.api.common :as api]
   [metabase.system.core :as system]
   [metabase.transforms.core :as transforms.core]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- template [resource-path]
  (delay (slurp (io/resource resource-path))))

(def connectors
  "Connector registry, keyed by connector id. Each connector exposes `:streams` — independently
  selectable entities, each becoming its own transform + target table."
  {"github" {:id            "github"
             :name          "GitHub"
             :description   "Issues and pull requests from a GitHub repository."
             :secret-key    "GITHUB_TOKEN"
             :config-fields [{:key "repo", :label "Repository (owner/name)", :required true}]
             :streams       [{:key           "issues"
                              :label         "Issues"
                              :description   "Issues, excluding pull requests."
                              :default-table "github_issues"
                              :merge-key     ["id"]
                              :template      (template "metabase_enterprise/transforms_python/connectors/github_issues.py")}
                             {:key           "pull-requests"
                              :label         "Pull requests"
                              :description   "Pull requests with branch and merge info."
                              :default-table "github_pull_requests"
                              :merge-key     ["id"]
                              :template      (template "metabase_enterprise/transforms_python/connectors/github_pulls.py")}]
             :oauth         {:authorize-url "https://github.com/login/oauth/authorize"
                             :token-url     "https://github.com/login/oauth/access_token"
                             :scope         "repo"
                             :client-id     transforms-python.settings/github-connector-client-id
                             :client-secret transforms-python.settings/github-connector-client-secret}}
   "linear" {:id            "linear"
             :name          "Linear"
             :description   "Issues from a Linear workspace."
             :secret-key    "LINEAR_API_KEY"
             :config-fields [{:key "team", :label "Team key (blank for all teams)", :required false}]
             :streams       [{:key           "issues"
                              :label         "Issues"
                              :description   "Issues with status, team, and assignee."
                              :default-table "linear_issues"
                              :merge-key     ["id"]
                              :template      (template "metabase_enterprise/transforms_python/connectors/linear.py")}]
             :oauth         {:authorize-url "https://linear.app/oauth/authorize"
                             :token-url     "https://api.linear.app/oauth/token"
                             :scope         "read"
                             :client-id     transforms-python.settings/linear-connector-client-id
                             :client-secret transforms-python.settings/linear-connector-client-secret}}})

(defn connector
  "Look up a connector by id, throwing a 404-style error when unknown."
  [connector-id]
  (or (get connectors connector-id)
      (throw (ex-info (tru "Unknown connector: {0}" connector-id) {:status-code 404}))))

(defn presented-connectors
  "Registry entries shaped for the API: no templates or setting fns, plus whether OAuth is configured."
  []
  (for [{:keys [oauth] :as conn} (vals connectors)]
    (-> conn
        (dissoc :oauth)
        (update :streams (fn [streams] (mapv #(dissoc % :template) streams)))
        (assoc :oauth-configured (boolean (and oauth ((:client-id oauth))))))))

;;; ------------------------------------------------- OAuth -------------------------------------------------

;; state-nonce -> {:connector-id ".." :token ".." :started-at timer}, consumed on connection creation.
;; In-memory only: a pending OAuth handshake doesn't survive a restart, which is fine for its 10min TTL.
(defonce ^:private pending-tokens (atom {}))

(def ^:private pending-token-ttl-ms (* 10 60 1000))

(defn- prune-pending! []
  (swap! pending-tokens #(into {} (filter (fn [[_ v]] (< (u/since-ms (:started-at v)) pending-token-ttl-ms))) %)))

(defn- redirect-uri ^String [connector-id]
  (str (system/site-url) "/api/ee/transforms-python/connector/oauth/callback/" connector-id))

(defn oauth-url
  "Authorize URL + state nonce for `connector-id`, or throws if OAuth isn't configured."
  [connector-id]
  (let [{:keys [oauth]} (connector connector-id)
        client-id       (when oauth ((:client-id oauth)))
        _               (when-not client-id
                          (throw (ex-info (tru "OAuth is not configured for this connector.")
                                          {:status-code 400})))
        state           (str (random-uuid))]
    (prune-pending!)
    (swap! pending-tokens assoc state {:connector-id connector-id :started-at (u/start-timer)})
    {:url (str (:authorize-url oauth)
               "?client_id=" client-id
               "&redirect_uri=" (java.net.URLEncoder/encode (redirect-uri connector-id) "UTF-8")
               "&response_type=code"
               "&scope=" (:scope oauth)
               "&state=" state)
     :state state}))

(defn- exchange-code!
  "Exchange an OAuth authorization code for an access token."
  [{:keys [oauth]} connector-id code]
  (let [{:keys [status body]} (http/post (:token-url oauth)
                                         {:form-params      {:grant_type    "authorization_code"
                                                             :code          code
                                                             :redirect_uri  (redirect-uri connector-id)
                                                             :client_id     ((:client-id oauth))
                                                             :client_secret ((:client-secret oauth))}
                                          :accept           :json
                                          :throw-exceptions false})
        parsed (json/decode+kw body)]
    (or (when (= 200 status) (:access_token parsed))
        (throw (ex-info (tru "OAuth token exchange failed.")
                        {:status-code 400 :provider-status status :provider-error (:error parsed)})))))

(defn handle-oauth-callback!
  "Handle the provider redirect: exchange `code` and stash the token under the `state` nonce."
  [connector-id state code]
  (prune-pending!)
  (let [conn (connector connector-id)]
    (when-not (= connector-id (:connector-id (get @pending-tokens state)))
      (throw (ex-info (tru "Unknown or expired OAuth state.") {:status-code 400})))
    (let [token (exchange-code! conn connector-id code)]
      (swap! pending-tokens assoc-in [state :token] token)
      nil)))

(defn oauth-state-ready?
  "Whether the OAuth handshake for `state` has produced a token."
  [state]
  (boolean (:token (get @pending-tokens state))))

(defn- consume-oauth-token!
  "Take (and remove) the token stashed under `state`."
  [state]
  (let [token (:token (get @pending-tokens state))]
    (when-not token
      (throw (ex-info (tru "OAuth authorization is not complete.") {:status-code 400})))
    (swap! pending-tokens dissoc state)
    token))

;;; ------------------------------------------------- Connection creation -------------------------------------------------

(def ^:private config-value-re
  ;; conservative charset: rendered into python source, so no quotes/backslashes/newlines
  #"[A-Za-z0-9._/ -]*")

(defn- render-template [source config-fields config]
  (doseq [{:keys [key required]} config-fields]
    (let [v (get config key "")]
      (when (and required (str/blank? v))
        (throw (ex-info (tru "Missing required connector field: {0}" key) {:status-code 400})))
      (when-not (re-matches config-value-re v)
        (throw (ex-info (tru "Invalid characters in connector field: {0}" key) {:status-code 400})))))
  (reduce (fn [s {:keys [key]}]
            (str/replace s (str "{{" key "}}") (get config key "")))
          source
          config-fields))

(defn- create-stream-transform!
  "Create the transform backing one stream of a connection."
  [{:keys [config-fields secret-key] conn-name :name :as conn}
   {:keys [key label default-table merge-key template] :as _stream}
   {:keys [config connection-id db-id schema table-name transform-name token]}]
  (let [table-name (or table-name default-table)]
    (transforms.core/create-transform!
     {:name    (or transform-name (str conn-name " " label " ingestion (" table-name ")"))
      :source  {:type            :python
                :source-database db-id
                :source-tables   []
                :body            (render-template @template config-fields config)
                :connector       {:id            (:id conn)
                                  :stream        key
                                  :config        (or config {})
                                  :connection-id connection-id}}
      :target  {:type     "table-incremental"
                :database db-id
                :schema   schema
                :name     table-name
                :target-incremental-strategy {:type       "merge"
                                              :unique-key (mapv (fn [col] {:name col}) merge-key)}}
      :secrets {secret-key token}})))

(defn- select-streams [conn stream-keys]
  (let [selected (if (seq stream-keys)
                   (filter (comp (set stream-keys) :key) (:streams conn))
                   (:streams conn))]
    (when (empty? selected)
      (throw (ex-info (tru "No valid streams selected.") {:status-code 400})))
    selected))

(defn create-connection!
  "Instantiate `connector-id` as one python transform per selected stream. `auth` is either
  {:token \"...\"} (hand-entered) or {:oauth-state \"nonce\"} (token from a completed OAuth
  handshake); the token is shared by all created transforms. `streams` is a vector of stream keys,
  defaulting to all of the connector's streams. Returns the created transforms."
  [connector-id {:keys [config auth target name streams] :as _body}]
  (let [conn          (connector connector-id)
        selected      (select-streams conn streams)
        token         (or (:token auth)
                          (some-> (:oauth-state auth) consume-oauth-token!)
                          (throw (ex-info (tru "Either a token or a completed OAuth authorization is required.")
                                          {:status-code 400})))
        connection-id (str (random-uuid))
        single?       (= 1 (count selected))]
    (mapv (fn [stream]
            (create-stream-transform! conn stream
                                      {:config         config
                                       :connection-id  connection-id
                                       :db-id          (:database target)
                                       :schema         (:schema target)
                                       ;; a custom table name only makes sense for a single stream
                                       :table-name     (when single? (:table-name target))
                                       :transform-name (when single? name)
                                       :token          token}))
          selected)))

;;; ------------------------------------------------- Connection editing -------------------------------------------------

(defn- connector-meta [transform]
  (or (get-in transform [:source :connector])
      (throw (ex-info (tru "Not a connector-managed transform.") {:status-code 400}))))

(defn- connection-transforms
  "All transforms belonging to the same connection as `transform` (itself included)."
  [transform]
  (let [connection-id (:connection-id (connector-meta transform))]
    (if connection-id
      (filter #(= connection-id (get-in % [:source :connector :connection-id]))
              (t2/select :model/Transform :source_type :python))
      [transform])))

(defn update-connection!
  "Update the config and/or token of the connection that `transform-id` belongs to. A new `config`
  re-renders every stream's code from its template; `auth` (token or completed OAuth state) replaces
  the secret on every stream. Returns the updated transforms."
  [transform-id {:keys [config auth] :as _body}]
  (let [transform (api/write-check :model/Transform transform-id)
        conn      (connector (:id (connector-meta transform)))
        token     (or (:token auth)
                      (some-> (:oauth-state auth) consume-oauth-token!))
        siblings  (connection-transforms transform)]
    (run! api/write-check siblings)
    (mapv (fn [{:keys [source] :as sibling}]
            (let [conn-meta  (:connector source)
                  stream     (or (m/find-first #(= (:stream conn-meta) (:key %)) (:streams conn))
                                 (throw (ex-info (tru "Unknown stream: {0}" (:stream conn-meta)) {:status-code 400})))
                  new-config (or config (:config conn-meta))
                  new-source (assoc source
                                    :body (render-template @(:template stream) (:config-fields conn) new-config)
                                    :connector (assoc conn-meta :config new-config))]
              (transforms.core/update-transform!
               (:id sibling)
               (cond-> {:source new-source}
                 token (assoc :secrets {(:secret-key conn) token})))))
          siblings)))

(defn add-streams!
  "Add transforms for `stream-keys` to the connection `transform-id` belongs to, copying its config
  and secret. Streams that already exist are skipped. Returns the created transforms."
  [transform-id stream-keys]
  (let [transform (api/write-check :model/Transform transform-id)
        conn-meta (connector-meta transform)
        conn      (connector (:id conn-meta))
        existing  (into #{} (map #(get-in % [:source :connector :stream])) (connection-transforms transform))
        to-add    (remove (comp existing :key) (select-streams conn stream-keys))
        secrets   (transforms.core/secrets-for-run transform-id)
        token     (get secrets (keyword (:secret-key conn)))]
    (when-not token
      (throw (ex-info (tru "The connection has no stored token to copy.") {:status-code 400})))
    (mapv (fn [stream]
            (create-stream-transform! conn stream
                                      {:config        (:config conn-meta)
                                       :connection-id (:connection-id conn-meta)
                                       :db-id         (get-in transform [:target :database])
                                       :schema        (get-in transform [:target :schema])
                                       :token         token}))
          to-add)))
