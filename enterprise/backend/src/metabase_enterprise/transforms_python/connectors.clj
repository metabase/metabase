(ns metabase-enterprise.transforms-python.connectors
  "Registry and creation logic for no-code ingestion connectors.

  A connector is a python transform template plus the metadata needed to instantiate it: config
  fields rendered into the template, a secret env var, and a default incremental target. Creating
  a connection produces a regular python transform that users can view and edit."
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.system.core :as system]
   [metabase.transforms.core :as transforms.core]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- template [resource-path]
  (delay (slurp (io/resource resource-path))))

(def connectors
  "Connector registry, keyed by connector id."
  {"github" {:id            "github"
             :name          "GitHub"
             :description   "Issues and pull requests from a GitHub repository."
             :secret-key    "GITHUB_TOKEN"
             :config-fields [{:key "repo", :label "Repository (owner/name)", :required true}]
             :template      (template "metabase_enterprise/transforms_python/connectors/github.py")
             :default-table "github_issues"
             :merge-key     ["id"]
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
             :template      (template "metabase_enterprise/transforms_python/connectors/linear.py")
             :default-table "linear_issues"
             :merge-key     ["id"]
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
        (dissoc :template :oauth)
        (assoc :oauth-configured (boolean (and oauth ((:client-id oauth))))))))

;;; ------------------------------------------------- OAuth -------------------------------------------------

;; state-nonce -> {:connector-id ".." :token ".." :started-at timer}, consumed on connection creation.
;; In-memory only: a pending OAuth handshake doesn't survive a restart, which is fine for its 10min TTL.
(defonce ^:private pending-tokens (atom {}))

(def ^:private pending-token-ttl-ms (* 10 60 1000))

(defn- prune-pending! []
  (swap! pending-tokens #(into {} (filter (fn [[_ v]] (< (u/since-ms (:started-at v)) pending-token-ttl-ms))) %)))

(defn- redirect-uri [connector-id]
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

(defn create-connection!
  "Instantiate `connector-id` as a python transform. `auth` is either {:token \"...\"} (hand-entered)
  or {:oauth-state \"nonce\"} (token from a completed OAuth handshake). Returns the created transform."
  [connector-id {:keys [config auth target name] :as _body}]
  (let [{:keys [config-fields secret-key merge-key default-table template] conn-name :name :as _conn} (connector connector-id)
        token      (or (:token auth)
                       (some-> (:oauth-state auth) consume-oauth-token!)
                       (throw (ex-info (tru "Either a token or a completed OAuth authorization is required.")
                                       {:status-code 400})))
        db-id      (:database target)
        table-name (or (:table-name target) default-table)
        code       (render-template @template config-fields config)]
    (transforms.core/create-transform!
     {:name    (or name (str conn-name " ingestion (" table-name ")"))
      :source  {:type            :python
                :source-database db-id
                :source-tables   []
                :body            code}
      :target  {:type     "table-incremental"
                :database db-id
                :schema   (:schema target)
                :name     table-name
                :target-incremental-strategy {:type       "merge"
                                              :unique-key (mapv (fn [col] {:name col}) merge-key)}}
      :secrets {secret-key token}})))
