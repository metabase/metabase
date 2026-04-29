(ns metabase-enterprise.workspaces.api.external
  "OAuth-protected workspace endpoints for external tool access (e.g. Claude Code).
   These endpoints accept Bearer token authentication and enforce workspace-specific
   OAuth scopes. They do NOT require superuser — the OAuth token IS the authorization."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.scope :as ws.scope]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Auth middleware ------------------------------------------------

(defn- workspace-resource-uri
  "The RFC 8707 resource URI for a workspace."
  [workspace-id]
  (str "urn:metabase:workspace:" workspace-id))

(defn- validate-workspace-bearer-token
  "Extract and validate a bearer token from the request. Returns the token data map
   with :user-id and :scopes if valid, otherwise returns a ring error response."
  [request workspace-id]
  (let [token-string (oauth-server/extract-bearer-token request)]
    (if-not token-string
      {:error {:status 401 :body {:error "missing_token" :error_description "Bearer token required"}}}
      (let [token-data (oauth-server/validate-bearer-token token-string)]
        (if-not token-data
          {:error {:status 401 :body {:error "invalid_token" :error_description "Token is invalid or expired"}}}
          ;; Check resource claim matches the requested workspace
          (let [expected-resource (workspace-resource-uri workspace-id)]
            (if (and (:resource token-data)
                     (not (some #{expected-resource} (:resource token-data))))
              {:error {:status 403 :body {:error "insufficient_scope"
                                          :error_description "Token is not authorized for this workspace"}}}
              token-data)))))))

(defn- check-scope
  "Check that the token's scopes include the required scope."
  [token-data required-scope]
  (when-not (api-scope/scope-matches? (:scopes token-data) required-scope)
    {:status 403 :body {:error "insufficient_scope"
                        :error_description (str "Required scope: " required-scope)}}))

(defmacro ^:private with-workspace-auth
  "Validate bearer token for workspace access, bind user context, check scope, and execute body.
   Returns error response if auth fails."
  [request workspace-id required-scope & body]
  `(let [result# (validate-workspace-bearer-token ~request ~workspace-id)]
     (if (:error result#)
       (:error result#)
       (if-let [scope-err# (check-scope result# ~required-scope)]
         scope-err#
         (binding [api/*current-user-id* (:user-id result#)]
           ~@body)))))

;;; ------------------------------------------------ Presentation --------------------------------------------------

(defn- present-workspace-database [wsd]
  (-> (select-keys wsd [:database_id :output_schema :input_schemas :status])
      (update :status name)))

(defn- present-workspace [workspace]
  (some-> workspace
          (select-keys [:id :name :created_at :updated_at :databases])
          (update :databases #(mapv present-workspace-database %))))

;;; ------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/:id"
  "Get workspace summary. Requires `workspace:config:read` scope."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params
   request]
  (with-workspace-auth request id ws.scope/workspace-config-read
    (let [workspace (api/check-404 (ws/get-workspace id))]
      (present-workspace workspace))))

(api.macros/defendpoint :get "/:id/config/yaml"
  "Download workspace config as YAML. Requires `workspace:config:read` scope."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params
   request]
  (with-workspace-auth request id ws.scope/workspace-config-read
    (let [workspace (api/check-404 (ws/get-workspace id))
          db-ids    (mapv :database_id (:databases workspace))
          dbs-by-id (when (seq db-ids)
                      (into {} (map (juxt :id identity))
                            (t2/select [:model/Database :id :name :engine] :id [:in db-ids])))
          config    {:name      (:name workspace)
                     :databases (into {}
                                      (keep (fn [wsd]
                                              (when (= :provisioned (:status wsd))
                                                (let [db (get dbs-by-id (:database_id wsd))]
                                                  [(:database_id wsd)
                                                   {:name          (:name db)
                                                    :engine        (name (:engine db))
                                                    :input_schemas (vec (:input_schemas wsd))
                                                    :output_schema (:output_schema wsd)}]))))
                                      (:databases workspace))}]
      {:status  200
       :headers {"Content-Type"        "application/x-yaml"
                 "Content-Disposition" "attachment; filename=\"config.yml\""}
       :body    (yaml/generate-string config)})))

(api.macros/defendpoint :get "/:id/metadata"
  "Get database metadata for workspace databases. Requires `workspace:metadata:read` scope.
   Returns table and field information for each provisioned database in the workspace."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params
   request]
  (with-workspace-auth request id ws.scope/workspace-metadata-read
    (let [workspace (api/check-404 (ws/get-workspace id))
          provisioned-wsds (filter #(= :provisioned (:status %)) (:databases workspace))
          db-ids    (mapv :database_id provisioned-wsds)
          dbs-by-id (when (seq db-ids)
                      (into {} (map (juxt :id identity))
                            (t2/select :model/Database :id [:in db-ids])))
          ;; Fetch tables for the input schemas of each workspace database
          tables-by-db (when (seq db-ids)
                         (group-by :db_id
                                   (t2/select :model/Table
                                              :db_id [:in db-ids]
                                              :active true)))]
      {:databases
       (into {}
             (map (fn [wsd]
                    (let [db-id  (:database_id wsd)
                          db     (get dbs-by-id db-id)
                          tables (get tables-by-db db-id [])
                          ;; Only include tables from input schemas and output schema
                          relevant-schemas (into #{} (conj (:input_schemas wsd) (:output_schema wsd)))
                          relevant-tables  (filter #(contains? relevant-schemas (:schema %)) tables)]
                      [db-id
                       {:name          (:name db)
                        :engine        (some-> (:engine db) name)
                        :input_schemas (vec (:input_schemas wsd))
                        :output_schema (:output_schema wsd)
                        :tables        (mapv (fn [t]
                                               {:id     (:id t)
                                                :name   (:name t)
                                                :schema (:schema t)})
                                             relevant-tables)}])))
             provisioned-wsds)})))

(api.macros/defendpoint :get "/ping"
  "Simple connectivity check. Validates bearer token and returns static data.
   Requires any workspace scope."
  [_route-params _query-params _body-params request]
  (let [token-string (oauth-server/extract-bearer-token request)]
    (if-not token-string
      {:status 401 :body {:error "missing_token"}}
      (let [token-data (oauth-server/validate-bearer-token token-string)]
        (if-not token-data
          {:status 401 :body {:error "invalid_token"}}
          {:status  "ok"
           :user_id (:user-id token-data)
           :scopes  (vec (:scopes token-data))
           :resource (:resource token-data)})))))

;;; ----------------------------------------------- Route handler --------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "Ring handler for `/api/ee/workspace-ext` routes. No +auth wrapper — auth is handled
   per-endpoint via Bearer token validation."
  (api.macros/ns-handler *ns*))
