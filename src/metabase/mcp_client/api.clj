(ns metabase.mcp-client.api
  "`/api/mcp-client`: admin management of external MCP servers, each user's connection to them, and the OAuth
  callback the browser returns to."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.mcp-client.client :as client]
   [metabase.mcp-client.connections :as connections]
   [metabase.mcp-client.db :as mcp-client.db]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(def ^:private admin-page "/admin/metabot/mcp/external")

(def ^:private AuthStrategy [:enum "oauth" "header" "none"])
(def ^:private Provider [:enum "notion" "linear" "custom"])

(def ^:private ConnectionResponse
  [:maybe [:map
           [:id ms/PositiveInt]
           [:status :keyword]]])

(def ^:private ServerResponse
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:url :string]
   [:provider :keyword]
   [:auth_strategy :keyword]
   [:enabled :boolean]
   [:has_credentials :boolean]
   [:connection ConnectionResponse]])

(defn- present-connection
  [connection]
  (some-> connection (select-keys [:id :status :account :scopes :expires_at :error :updated_at])))

(defn- present-server
  "A server as the API shows it: never the shared credential or the OAuth client registration."
  [server connection]
  (-> (select-keys server [:id :name :url :provider :auth_strategy :enabled :created_at :updated_at])
      (assoc :has_credentials (boolean (:credentials server))
             :connection      (present-connection connection))))

(defn- server-or-404
  [id]
  (api/check-404 (mcp-client.db/server id)))

(defn- check-url!
  [url]
  (try
    (connections/server-client {:url url} nil)
    (catch clojure.lang.ExceptionInfo e
      (throw (ex-info (ex-message e) (assoc (ex-data e) :status-code 400) e)))))

(defn- credentials
  [{:keys [header_name header_value]}]
  (when (and (seq header_name) (seq header_value))
    {:header_name header_name :header_value header_value}))

(defmacro ^:private with-client-errors
  "Report a failure talking to an MCP server as a 400 with the client's message, instead of a 500."
  [& body]
  `(try
     ~@body
     (catch clojure.lang.ExceptionInfo e#
       (if (some-> (ex-data e#) :type namespace (= "mcp-client"))
         (throw (ex-info (ex-message e#) (assoc (ex-data e#) :status-code 400) e#))
         (throw e#)))))

(api.macros/defendpoint :get "/server" :- [:sequential ServerResponse]
  "External MCP servers, each with the current user's connection to it."
  []
  (let [servers     (mcp-client.db/servers)
        connections (mcp-client.db/connections-by-server-id api/*current-user-id* (map :id servers))]
    (mapv #(present-server % (get connections (:id %))) servers)))

(api.macros/defendpoint :post "/server" :- ServerResponse
  "Register an external MCP server. Superuser only."
  [_route-params
   _query-params
   {:keys [name url provider auth_strategy enabled] :as body}
   :- [:map {:closed true}
       [:name ms/NonBlankString]
       [:url ms/NonBlankString]
       [:provider Provider]
       [:auth_strategy AuthStrategy]
       [:enabled {:optional true} :boolean]
       [:header_name {:optional true} [:maybe :string]]
       [:header_value {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (check-url! url)
  (let [header? (= auth_strategy "header")]
    (when (and header? (not (credentials body)))
      (throw (ex-info (tru "A shared credential needs both a header name and a value") {:status-code 400})))
    (present-server (mcp-client.db/insert-server! {:name          name
                                                   :url           url
                                                   :provider      (keyword provider)
                                                   :auth_strategy (keyword auth_strategy)
                                                   :enabled       (if (some? enabled) enabled true)
                                                   :credentials   (when header? (credentials body))})
                    nil)))

(api.macros/defendpoint :put "/server/:id" :- ServerResponse
  "Change an external MCP server. Changing its URL or authentication strategy disconnects everyone, since their
  tokens were for the old one. A blank shared credential value keeps the stored one. Superuser only."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   {:keys [url auth_strategy header_name header_value] :as body}
   :- [:map {:closed true}
       [:name {:optional true} ms/NonBlankString]
       [:url {:optional true} ms/NonBlankString]
       [:auth_strategy {:optional true} AuthStrategy]
       [:enabled {:optional true} :boolean]
       [:header_name {:optional true} [:maybe :string]]
       [:header_value {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (let [server        (server-or-404 id)
        new-strategy  (if auth_strategy (keyword auth_strategy) (:auth_strategy server))
        reconnect?    (or (and url (not= url (:url server)))
                          (not= new-strategy (:auth_strategy server)))
        credentials   (cond
                        (not= new-strategy :header) nil
                        (seq header_value)          (credentials body)
                        :else                       (cond-> (:credentials server)
                                                      (seq header_name) (assoc :header_name header_name)))
        updates       (-> (select-keys body [:name :url :enabled])
                          (assoc :auth_strategy new-strategy :credentials credentials)
                          (cond-> reconnect? (assoc :oauth_client nil)))]
    (when url (check-url! url))
    (when (and (= new-strategy :header) (not credentials))
      (throw (ex-info (tru "A shared credential needs both a header name and a value") {:status-code 400})))
    (mcp-client.db/update-server! id updates reconnect?)
    (present-server (mcp-client.db/server id)
                    (mcp-client.db/user-connection id api/*current-user-id*))))

(api.macros/defendpoint :delete "/server/:id" :- [:map [:status [:= 204]] [:body :nil]]
  "Remove an external MCP server and everyone's connection to it. Superuser only."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/check-superuser)
  (server-or-404 id)
  (mcp-client.db/delete-server! id)
  api/generic-204-no-content)

(api.macros/defendpoint :post "/server/:id/connect" :- [:map
                                                        [:redirect_url [:maybe :string]]
                                                        [:connection ConnectionResponse]]
  "Connect the current user to a server. OAuth servers answer with the URL to send the browser to; the connection
  stays pending until the browser comes back through the callback."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (let [server (server-or-404 id)]
    (api/check (:enabled server) [400 (tru "{0} is disabled" (:name server))])
    (with-client-errors
      (update (connections/connect! server api/*current-user-id*) :connection present-connection))))

(api.macros/defendpoint :delete "/server/:id/connection" :- [:map [:status [:= 204]] [:body :nil]]
  "Disconnect the current user from a server."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (server-or-404 id)
  (connections/disconnect! id api/*current-user-id*)
  api/generic-204-no-content)

(api.macros/defendpoint :get "/server/:id/tools" :- [:map [:tools [:sequential :map]]]
  "The tools a server offers, listed through the current user's connection."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (let [server     (server-or-404 id)
        connection (mcp-client.db/user-connection id api/*current-user-id*)]
    (with-client-errors
      {:tools (mapv #(select-keys % [:name :title :description])
                    (client/all-tools (connections/connection-client server connection)))})))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/oauth/callback" :- [:map
                                                   [:status [:= 302]]
                                                   [:headers :map]
                                                   [:body :string]]
  "Where an authorization server sends the browser after the user decides. Finishes the pending connection and
  returns the browser to the admin page with the outcome in the query string."
  [_route-params
   {:keys [state code iss error error_description]}
   :- [:map {:closed true}
       [:state {:optional true} [:maybe :string]]
       [:code {:optional true} [:maybe :string]]
       [:iss {:optional true} [:maybe :string]]
       [:error {:optional true} [:maybe :string]]
       [:error_description {:optional true} [:maybe :string]]]]
  (let [location (try
                   (let [connection (connections/complete-oauth! api/*current-user-id*
                                                                 {:state             state
                                                                  :code              code
                                                                  :iss               iss
                                                                  :error             error
                                                                  :error_description error_description})]
                     (str admin-page "?mcp_connected=" (:mcp_server_id connection)))
                   (catch Exception e
                     (log/warn e "External MCP OAuth callback failed")
                     (str admin-page "?mcp_error=" (codec/url-encode (ex-message e)))))]
    {:status 302 :headers {"Location" location} :body ""}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/mcp-client` routes."
  (api.macros/ns-handler *ns*))
