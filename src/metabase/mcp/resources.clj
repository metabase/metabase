(ns metabase.mcp.resources
  "MCP resource handlers. Provides the visualize-query HTML resource
   that renders interactive Metabase visualizations via the Embedding SDK."
  (:require
   [metabase.config.core :as config]
   [metabase.session.models.session :as session]
   [metabase.system.core :as system]
   [metabase.util.json :as json]
   [stencil.core :as stencil]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def visualize-query-resource-uri
  "The URI for the visualize-query MCP app resource."
  "ui://metabase/visualize-query.html")

(def ^:private resource-mime-type "text/html;profile=mcp-app")

(defn- site-url []
  (system/site-url))

(defn- csp-config []
  (let [url (site-url)]
    {:connectDomains  [url "ws://localhost:3000" "ws://0.0.0.0:8080" "wss://*.claudemcpcontent.com:*"]
     :resourceDomains [url]
     :frameDomains    [url]}))

(defn create-embedding-session!
  "Create a Metabase session for embedding SDK auth.
   Returns the session key (the value the SDK uses as X-Metabase-Session)."
  [user-id]
  (let [session-key (session/generate-session-key)
        session-id  (session/generate-session-id)]
    (t2/insert! :model/Session
                {:id          session-id
                 :user_id     user-id
                 :session_key session-key})
    session-key))

(defn delete-embedding-session!
  "Delete a Metabase session by its session key (hashed lookup)."
  [session-key]
  (t2/delete! :model/Session :key_hashed (session/hash-session-key session-key)))

(defn- generate-visualize-html [opts]
  (let [session-key (:session-key opts)]
    (stencil/render-file
     "frontend_client/embed-mcp.html"
     {:instanceUrl     (json/encode (site-url))
      :instanceUrlRaw  (site-url)
      :sessionToken    (when session-key (json/encode session-key))
      :cacheBuster     (if config/is-dev?
                         (str (System/currentTimeMillis))
                         config/mb-version-hash)})))

(defn list-resources
  "Return the list of available MCP resources."
  []
  {:resources [{:uri         visualize-query-resource-uri
                :name        "Visualize Query"
                :description "Interactive Metabase SDK visualization for a query"
                :mimeType    resource-mime-type
                :_meta       {:ui {:csp (csp-config)}}}]})

(defn read-resource
  "Read an MCP resource by URI. Returns nil if the URI is not recognized."
  [uri opts]
  (when (= uri visualize-query-resource-uri)
    {:contents [{:uri      visualize-query-resource-uri
                 :mimeType resource-mime-type
                 :text     (generate-visualize-html opts)
                 :_meta    {:ui {:csp (csp-config)}}}]}))
