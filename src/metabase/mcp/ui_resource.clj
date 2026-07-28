(ns metabase.mcp.ui-resource
  "Shared primitives for MCP Apps UI resources — the sandboxed iframe surface both the v1
   ([[metabase.mcp.resources]]) and v2 ([[metabase.mcp.v2.resources]]) registries expose.

   The registries themselves stay version-local (different scope models, different manifests);
   what lives here is the part that must not drift between them: rendering the embed template
   and computing the `_meta.ui` block hosts use to configure the iframe sandbox."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.config.core :as config]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.util.json :as json]
   [stencil.core :as stencil])
  (:import
   (java.net URI)))

(set! *warn-on-reflection* true)

(def ^:private embed-mcp-template-path "frontend_client/embed-mcp.html")

;; The built template is emitted by HtmlWebpackPlugin into resources/frontend_client/
;; during the frontend build. Backend-only test runs (e.g. CI app-db tests) don't produce
;; it, so tests install a minimal inline template via `with-fallback-template`.
(def ^:private test-fallback-template
  (str "<!doctype html><html><head><base href=\"{{{instanceUrlRaw}}}/\"></head><body><script>"
       "window.metabaseConfig = {"
       "instanceUrl: {{{instanceUrl}}},"
       "sessionToken: {{{sessionToken}}}"
       "};</script></body></html>"))

;; An atom rather than a dynamic var because `resources/read` is invoked from the
;; HTTP handler thread, which doesn't inherit thread-local bindings from the test
;; thread that installs the fallback.
(defonce ^:private fallback-template (atom nil))

(defn do-with-fallback-template
  "Implementation detail of [[with-fallback-template]]."
  [thunk]
  (try
    (reset! fallback-template test-fallback-template)
    (thunk)
    (finally
      (reset! fallback-template nil))))

(defmacro with-fallback-template
  "Test-only: install an inline Mustache fallback for the embed-mcp template for
   the duration of `body`. Backend-only test runs don't produce the built template,
   so tests that exercise `resources/read` need this."
  [& body]
  `(do-with-fallback-template (fn [] ~@body)))

(defn render-embed-mcp-template
  "Render the embed-mcp.html Mustache template with the given vars map.
   Expected keys: :instanceUrl (JSON-encoded), :instanceUrlRaw, :sessionToken (JSON-encoded or nil),
   :mcpSessionId (JSON-encoded or nil)."
  [vars]
  (cond
    (io/resource embed-mcp-template-path)
    (stencil/render-file embed-mcp-template-path vars)

    @fallback-template
    (stencil/render-string @fallback-template vars)

    :else
    (throw (ex-info (str "Missing MCP embed template: " embed-mcp-template-path
                         ". Run the frontend build to produce it.")
                    {:path embed-mcp-template-path}))))

(defn- chatgpt-client?
  "True when the in-flight request's User-Agent identifies the ChatGPT MCP/Apps
   client. ChatGPT empirically sends `openai-mcp/...`; Claude rejects
   `_meta.ui.domain` unless it's a Claude-issued subdomain, so we gate the field
   on this check."
  []
  (boolean (some-> (request/current-request)
                   (get-in [:headers "user-agent"])
                   (str/includes? "openai-mcp"))))

(defn- site-origin
  "Origin (scheme://host[:port]) extracted from `site-url`, dropping any path segment.
   ChatGPT's MCP host treats `_meta.ui.domain` and the CSP domain lists as origins, so an instance
   hosted under a subpath would otherwise leak the path and fail validation. Returns nil when
   `site-url` is unset — callers degrade gracefully rather than NPE on a misconfigured instance."
  []
  (when-let [url (system/site-url)]
    (let [^URI uri (URI. url)
          scheme   (.getScheme uri)
          host     (.getHost uri)
          port     (.getPort uri)]
      (cond-> (str scheme "://" host)
        (not (neg? port)) (str ":" port)))))

(defn- resource-domains
  [url]
  (cond-> [url]
    config/is-dev? (conj (str "http://localhost:" (or (env/env :mb-frontend-dev-port) "8080")))))

(defn ui-meta
  "MCP `_meta.ui` block returned alongside UI resources.
   Hosts that render the resource in a sandboxed iframe (notably ChatGPT's MCP app surface) use this
   to pick a sandbox configuration:

   - `prefersBorder`    — presentation hint asking the host to draw a frame border
   - `domain`           — origin the iframe content is anchored at. ChatGPT-only:
                          Claude validates this against its own namespace
                          (`*.claudemcpcontent.com`) and rejects anything else,
                          so we emit it only for ChatGPT (gated by [[chatgpt-client?]]).
   - `csp.baseUriDomains`  — hosts the iframe may use in its document `<base>` tag
                              (relative bundle assets resolve against the Metabase instance)
   - `csp.connectDomains`  — hosts the iframe may XHR/fetch/WebSocket to
                              (the embedded SDK calls back to this Metabase instance)
   - `csp.resourceDomains` — hosts the iframe may load scripts/styles/images from
                              (the SDK bundle is served from this Metabase instance)

   `frameDomains` is intentionally omitted — we don't nest iframes inside the visualization, and leaving
   it out narrows the CSP for security review."
  [resource]
  (let [url (site-origin)]
    {:ui (cond-> {:csp {:baseUriDomains  [url]
                        :connectDomains  [url]
                        :resourceDomains (resource-domains url)}}
           (contains? resource :prefersBorder)
           (assoc :prefersBorder (:prefersBorder resource))

           (chatgpt-client?)
           (assoc :domain url))}))

;;; --------------------------------------------- Client extensions ------------------------------------------------

(def ^:private extension-labels
  "Human-readable labels for required-extension keywords in tool-call error messages."
  {:mcp-app-ui "MCP Apps UI"})

(defn supported-extensions
  "The extension keywords the calling client advertised, from a tool-dispatch options map."
  [{:keys [supports-mcp-ui?]}]
  (if supports-mcp-ui?
    #{:mcp-app-ui}
    #{}))

(defn missing-required-extensions
  "The extensions `tool` requires that `supported-extensions` doesn't provide, or nil when the
   client can render it. A tool with no `:required-extensions` is always renderable."
  [tool supported-extensions]
  (seq (set/difference (:required-extensions tool #{}) supported-extensions)))

(defn missing-extensions-error
  "Teaching message for a tool call the client can't render."
  [tool-name missing-extensions]
  (let [extension-names (str/join ", " (map #(get extension-labels % (name %)) missing-extensions))]
    (str tool-name " requires a client that supports " extension-names ". "
         "Reconnect from a client that advertises text/html;profile=mcp-app.")))

(defn embed-render-fn
  "Build a `:render-fn` that serves the MCP Apps iframe shell.

   `tag` is a per-URI marker embedded in the rendered HTML so distinct URIs hash to distinct
   bytes — ChatGPT's asset CDN appears to dedupe by body hash, and without distinct bodies the
   second URI's asset is silently dropped and the widget 404s. (Its host also dedupes by
   `_meta.ui.resourceUri`, which is why each UI tool gets its own URI in the first place.)

   The returned fn takes the `resources/read` options map: `:session-key` (the embedding session
   token the iframe authenticates with) and `:session-id` (the MCP session id it echoes back on
   callbacks)."
  [tag]
  (fn [opts]
    (let [site-url    (system/site-url)
          session-key (:session-key opts)
          session-id  (:session-id opts)]
      (str "<!-- metabase-mcp-asset: " tag " -->\n"
           (render-embed-mcp-template
            {:instanceUrl    (json/encode site-url)
             :instanceUrlRaw site-url
             :sessionToken   (when session-key (json/encode session-key))
             :mcpSessionId   (when session-id (json/encode session-id))})))))
