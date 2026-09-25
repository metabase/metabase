(ns metabase.mcp-client.client
  "An MCP client over the Streamable HTTP transport. See [[metabase.mcp-client.core]] for the public API.

  A client speaks protocol version 2026-07-28, which has no handshake or session, and falls back to the
  `initialize` handshake of the 2025-03-26 through 2025-11-25 revisions when the server turns out to predate it.
  Which era the server speaks is worked out on the first request and remembered until [[close!]]."
  (:require
   [clojure.pprint :as pprint]
   [malli.error :as me]
   [metabase.config.core :as config]
   [metabase.mcp-client.headers :as headers]
   [metabase.mcp-client.jsonrpc :as jsonrpc]
   [metabase.mcp-client.transport :as transport]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.io Closeable Writer)
   (java.net MalformedURLException URL)))

(set! *warn-on-reflection* true)

(def latest-protocol-version
  "The protocol version the client speaks by preference."
  "2026-07-28")

(def modern-protocol-versions
  "Protocol versions with per-request metadata instead of an `initialize` handshake."
  #{"2026-07-28"})

(def legacy-protocol-versions
  "Protocol versions negotiated through an `initialize` handshake that the client can fall back to."
  #{"2025-11-25" "2025-06-18" "2025-03-26"})

(def ^:private max-list-pages 100)

;;; ----------------------------------------------- Request plumbing -----------------------------------------------

(defn- user-headers
  [{:keys [headers]}]
  (if (fn? headers) (headers) headers))

(defn- protocol-headers
  "The headers a request in the negotiated era must carry. `Mcp-Method` and `Mcp-Name` mirror the body so that
  intermediaries can route without parsing it."
  [{:keys [era protocol-version session-id]} method params]
  (case era
    :modern (let [mcp-name (headers/mcp-name-header method params)]
              (cond-> {"MCP-Protocol-Version" protocol-version
                       "Mcp-Method"           method}
                mcp-name (assoc "Mcp-Name" (headers/encode-header-value mcp-name))))
    :legacy (cond-> {}
              protocol-version (assoc "MCP-Protocol-Version" protocol-version)
              session-id       (assoc "Mcp-Session-Id" session-id))))

(defn- request-params
  [{:keys [era protocol-version]} client-info params]
  (case era
    :modern (jsonrpc/with-modern-meta (or params {}) protocol-version client-info)
    :legacy params))

(defn- side-message-handler
  "Handles the SSE messages that are not the response we are waiting for. Servers on the legacy protocol may send
  their own requests (sampling, elicitation, roots) on the stream; the client supports none of them and says so,
  since leaving the request unanswered would stall the server."
  [client negotiated]
  (fn [{:keys [id method]}]
    (if (and (some? id) (= :legacy (:era negotiated)))
      (do (log/debugf "MCP server sent a %s request; replying method-not-found" method)
          (transport/post! client
                           (jsonrpc/error-response id jsonrpc/method-not-found "This client does not support server requests")
                           {:headers (merge (user-headers client) (protocol-headers negotiated nil nil))}))
      (log/debugf "Ignoring MCP notification %s" method))))

(defn- post-request!
  "Send `method` as a request in the negotiated era and return the transport's classification of the reply."
  [client negotiated method params {:keys [timeout-ms extra-headers]}]
  (let [id      (jsonrpc/next-id!)
        message (jsonrpc/request id method (request-params negotiated (:client-info client) params))]
    (transport/post! client message {:headers    (merge (user-headers client)
                                                        (protocol-headers negotiated method params)
                                                        extra-headers)
                                     :timeout-ms timeout-ms
                                     :on-message (side-message-handler client negotiated)})))

(defn- http-error-ex
  [{:keys [url]} method {:keys [status headers body message]}]
  (ex-info (tru "MCP request {0} failed with HTTP status {1}" method status)
           (cond-> {:type   :mcp-client/http-error
                    :url    url
                    :method method
                    :status status
                    :body   body}
             (get headers "www-authenticate") (assoc :www-authenticate (get headers "www-authenticate"))
             (:error message)                 (assoc :jsonrpc-error (:error message)))))

(defn- result-or-throw
  "The `result` of a classified reply, or the exception it stands for. A JSON-RPC error is reported as such whatever
  HTTP status carried it, which is how modern servers deliver version and header problems."
  [{:keys [url] :as client} method {:keys [status message] :as resp}]
  (cond
    (map? (:error message))     (throw (jsonrpc/error->ex {:url url :method method :status status} (:error message)))
    (contains? message :result) (:result message)
    (<= 200 status 299)         (throw (ex-info (tru "MCP request {0} got HTTP {1} without a JSON-RPC response" method status)
                                                {:type   :mcp-client/malformed-response
                                                 :url    url
                                                 :method method
                                                 :status status
                                                 :reason "no response message"}))
    :else                       (throw (http-error-ex client method resp))))

;;; ------------------------------------------------- Negotiation -------------------------------------------------

(defn- modern-state
  [protocol-version result]
  {:era                :modern
   :protocol-version   protocol-version
   :session-id         nil
   :server-info        (get-in result [:_meta :io.modelcontextprotocol/serverInfo])
   :capabilities       (:capabilities result)
   :instructions       (:instructions result)
   :supported-versions (:supportedVersions result)})

(defn- discover-once!
  [client protocol-version]
  (post-request! client {:era :modern :protocol-version protocol-version} "server/discover" {} nil))

(defn- send-notification!
  [client negotiated method params]
  (let [message (jsonrpc/notification method (request-params negotiated (:client-info client) params))
        {:keys [status] :as resp} (transport/post! client message {:headers (merge (user-headers client)
                                                                                   (protocol-headers negotiated method params))})]
    (when-not (<= 200 status 299)
      (result-or-throw client method resp))))

(defn- unsupported-version-ex
  [{:keys [url]} data]
  (ex-info (tru "MCP server does not support any protocol version this client speaks")
           (merge {:type :mcp-client/unsupported-protocol-version :url url} data)))

(defn- legacy-initialize!
  "The `initialize` handshake: negotiate a version, learn the server's capabilities, and pick up the session id the
  server may mint, then tell it we are ready."
  [client requested-version]
  (let [pending                    {:era :legacy}
        params                     {:protocolVersion requested-version
                                    :capabilities    {}
                                    :clientInfo      (:client-info client)}
        {:keys [status headers message] :as resp} (post-request! client pending "initialize" params nil)
        result                     (:result message)]
    (when-not (and (<= 200 status 299) result)
      (result-or-throw client "initialize" resp))
    (let [server-version (:protocolVersion result)
          negotiated     {:era              :legacy
                          :protocol-version server-version
                          :session-id       (get headers "mcp-session-id")
                          :server-info      (:serverInfo result)
                          :capabilities     (:capabilities result)
                          :instructions     (:instructions result)}]
      (when-not (contains? legacy-protocol-versions server-version)
        (transport/delete-session! client (merge (user-headers client) (protocol-headers negotiated nil nil)))
        (throw (unsupported-version-ex client {:requested requested-version :server-version server-version})))
      (send-notification! client negotiated "notifications/initialized" nil)
      negotiated)))

(defn- negotiate-from-supported!
  "The server rejected our version and listed its own: retry with the newest one we share."
  [client supported]
  (let [supported (set supported)
        modern    (last (sort (filter modern-protocol-versions supported)))
        legacy    (last (sort (filter legacy-protocol-versions supported)))]
    (cond
      modern (let [{:keys [message] :as resp} (discover-once! client modern)]
               (if (:result message)
                 (modern-state modern (:result message))
                 (result-or-throw client "server/discover" resp)))
      legacy (legacy-initialize! client legacy)
      :else  (throw (unsupported-version-ex client {:requested latest-protocol-version :supported (vec supported)})))))

(defn- negotiate*
  "Work out which protocol era the server speaks by sending a modern `server/discover`. Only a recognizably modern
  error proves a modern server; any other 400/404/405 means a server that expects `initialize`. Anything else
  (401, 5xx, a refused connection) is reported rather than guessed at, so an auth problem never looks like an old
  server."
  [client]
  (let [{:keys [status message] :as resp} (discover-once! client latest-protocol-version)
        code                              (get-in message [:error :code])
        success?                          (<= 200 status 299)]
    (cond
      (and success? (:result message))
      (modern-state latest-protocol-version (:result message))

      (= code jsonrpc/unsupported-protocol-version)
      (negotiate-from-supported! client (get-in message [:error :data :supported]))

      (and success? (contains? #{jsonrpc/method-not-found jsonrpc/invalid-request} code))
      (legacy-initialize! client (last (sort legacy-protocol-versions)))

      (and (contains? #{400 404 405} status) (not (contains? jsonrpc/modern-error-codes code)))
      (legacy-initialize! client (last (sort legacy-protocol-versions)))

      :else
      (result-or-throw client "server/discover" resp))))

(defn- negotiated-state
  [state]
  (when (:era state) state))

(defn- negotiate!
  "The negotiated state for `client`, running the negotiation on first use. Serialized so that concurrent first
  callers share one legacy session."
  [client]
  (let [state (:state client)]
    (or (negotiated-state @state)
        (locking state
          (or (negotiated-state @state)
              (let [negotiated (negotiate* client)]
                (swap! state merge negotiated)
                negotiated))))))

(defn- forget-negotiation!
  [client]
  (swap! (:state client) dissoc :era :protocol-version :session-id :server-info :capabilities :instructions
         :supported-versions))

(defn- send-request!
  "Send a request, renegotiating once when the server tells us our negotiated state is stale: a legacy server that
  dropped the session (404), or a modern server that stopped supporting our version."
  [client method params opts]
  (loop [attempt 1]
    (let [negotiated (negotiate! client)
          resp       (post-request! client negotiated method params opts)
          code       (get-in resp [:message :error :code])
          stale?     (case (:era negotiated)
                       :legacy (and (:session-id negotiated) (= 404 (:status resp)))
                       :modern (= code jsonrpc/unsupported-protocol-version))]
      (if (and stale? (= attempt 1))
        (do (forget-negotiation! client)
            (recur 2))
        (result-or-throw client method resp)))))

;;; ------------------------------------------------- Public API -------------------------------------------------

(defn discover
  "What the server told us about itself: `:era`, `:protocol-version`, `:server-info`, `:capabilities`,
  `:instructions`, and on modern servers `:supported-versions`. Negotiates on first use."
  [client]
  (select-keys (negotiate! client)
               [:era :protocol-version :server-info :capabilities :instructions :supported-versions]))

(defn- remember-tools!
  [client tools]
  (swap! (:state client) update :tools-by-name merge (into {} (map (juxt :name identity)) tools)))

(defn- usable-tools
  "`tools` minus the ones whose `x-mcp-header` annotations the transport could not honor."
  [{:keys [url]} tools]
  (into []
        (remove (fn [tool]
                  (when-let [reason (headers/invalid-tool-reason tool)]
                    (log/warnf "Ignoring MCP tool %s from %s: %s" (:name tool) url reason)
                    true)))
        tools))

(defn list-tools
  "One page of the server's tools, as the `tools/list` result: `:tools`, and `:nextCursor` when there are more.
  Options: `:cursor`, `:timeout-ms`."
  ([client]
   (list-tools client nil))
  ([client {:keys [cursor] :as opts}]
   (let [result (send-request! client "tools/list" (when cursor {:cursor cursor}) opts)
         tools  (if (= :modern (:era (negotiate! client)))
                  (usable-tools client (:tools result))
                  (vec (:tools result)))]
     (remember-tools! client tools)
     (assoc result :tools tools))))

(defn all-tools
  "Every tool the server offers, following pagination."
  ([client]
   (all-tools client nil))
  ([client opts]
   (loop [cursor nil, page 1, tools []]
     (let [{:keys [nextCursor] :as result} (list-tools client (assoc opts :cursor cursor))
           tools                           (into tools (:tools result))]
       (cond
         (nil? nextCursor)      (do (swap! (:state client) assoc :tools-listed? true)
                                    tools)
         (>= page max-list-pages) (throw (ex-info (tru "MCP server kept paginating tools/list past {0} pages" max-list-pages)
                                                  {:type   :mcp-client/malformed-response
                                                   :url    (:url client)
                                                   :method "tools/list"
                                                   :reason "pagination did not terminate"}))
         :else                  (recur nextCursor (inc page) tools))))))

(defn- tool-param-headers
  "The `Mcp-Param-*` headers for calling `tool-name` with `arguments`, looking the tool up from the last listing and
  listing once when it is unknown."
  [client tool-name arguments]
  (when (= :modern (:era (negotiate! client)))
    (let [tool (or (get-in @(:state client) [:tools-by-name tool-name])
                   (when-not (:tools-listed? @(:state client))
                     (all-tools client)
                     (get-in @(:state client) [:tools-by-name tool-name])))]
      (when tool
        (headers/param-headers tool arguments)))))

(defn call-tool
  "Call `tool-name` with `arguments` and return the `tools/call` result verbatim: `:content`, and possibly
  `:structuredContent`, `:isError`, or `:resultType \"input_required\"`. A tool that fails returns `:isError true`
  rather than throwing, so the caller can hand the text to the model. Options: `:timeout-ms`, `:progress-token`,
  and for a multi round-trip retry `:input-responses` and `:request-state`."
  ([client tool-name arguments]
   (call-tool client tool-name arguments nil))
  ([client tool-name arguments {:keys [progress-token input-responses request-state] :as opts}]
   (let [params (cond-> {:name tool-name :arguments (or arguments {})}
                  progress-token  (assoc :_meta {:progressToken progress-token})
                  input-responses (assoc :inputResponses input-responses)
                  request-state   (assoc :requestState request-state))
         send!  (fn []
                  (send-request! client "tools/call" params
                                 (assoc opts :extra-headers (tool-param-headers client tool-name arguments))))]
     (try
       (send!)
       (catch clojure.lang.ExceptionInfo e
         ;; the server's schema for the tool changed since we listed it: refresh the listing and mirror again
         (if (= jsonrpc/header-mismatch (:code (ex-data e)))
           (do (all-tools client)
               (send!))
           (throw e)))))))

(defn list-resources
  "One page of the `resources/list` result. Options: `:cursor`, `:timeout-ms`."
  ([client]
   (list-resources client nil))
  ([client {:keys [cursor] :as opts}]
   (send-request! client "resources/list" (when cursor {:cursor cursor}) opts)))

(defn list-resource-templates
  "One page of the `resources/templates/list` result. Options: `:cursor`, `:timeout-ms`."
  ([client]
   (list-resource-templates client nil))
  ([client {:keys [cursor] :as opts}]
   (send-request! client "resources/templates/list" (when cursor {:cursor cursor}) opts)))

(defn read-resource
  "The `resources/read` result for `uri`: `:contents`. Options: `:timeout-ms`."
  ([client uri]
   (read-resource client uri nil))
  ([client uri opts]
   (send-request! client "resources/read" {:uri uri} opts)))

(defn list-prompts
  "One page of the `prompts/list` result. Options: `:cursor`, `:timeout-ms`."
  ([client]
   (list-prompts client nil))
  ([client {:keys [cursor] :as opts}]
   (send-request! client "prompts/list" (when cursor {:cursor cursor}) opts)))

(defn get-prompt
  "The `prompts/get` result for `prompt-name` rendered with `arguments`: `:messages` and `:description`.
  Options: `:timeout-ms`."
  ([client prompt-name]
   (get-prompt client prompt-name nil nil))
  ([client prompt-name arguments]
   (get-prompt client prompt-name arguments nil))
  ([client prompt-name arguments opts]
   (send-request! client "prompts/get" (cond-> {:name prompt-name} arguments (assoc :arguments arguments)) opts)))

(defn close!
  "Forget everything negotiated with the server, ending the session first when the server minted one. Safe to call
  repeatedly; the client negotiates afresh on its next use."
  [client]
  (let [{:keys [era session-id] :as negotiated} @(:state client)]
    (when (and (= :legacy era) session-id)
      (transport/delete-session! client (merge (user-headers client) (protocol-headers negotiated nil nil))))
    (reset! (:state client) {})
    nil))

;;; -------------------------------------------------- Construction --------------------------------------------------

(defrecord Client [url headers client-info timeout-ms connection-timeout-ms network-policy state]
  Closeable
  (close [this]
    (close! this)))

(defmethod print-method Client
  [^Client client ^Writer w]
  (let [{:keys [era protocol-version session-id]} @(:state client)]
    (.write w "#metabase.mcp-client/Client ")
    (.write w (pr-str {:url              (:url client)
                       :network-policy   (:network-policy client)
                       :era              era
                       :protocol-version protocol-version
                       :session-id?      (boolean session-id)}))))

;; pprint renders records field by field, which would print the auth headers
(defmethod pprint/simple-dispatch Client
  [client]
  (print-method client *out*))

(mr/def ::options
  [:map {:closed true}
   [:url :string]
   [:headers {:optional true} [:maybe [:or [:map-of :string :string] fn?]]]
   [:client-info {:optional true} [:map [:name :string] [:version :string]]]
   [:timeout-ms {:optional true} pos-int?]
   [:connection-timeout-ms {:optional true} pos-int?]
   [:network-policy {:optional true} [:enum :external-only :allow-private :allow-all]]])

(defn- url-problem
  [^String url]
  (let [^URL parsed (try (URL. url) (catch MalformedURLException _ nil))]
    (when-not (and parsed
                   (contains? #{"http" "https"} (.getProtocol parsed))
                   (seq (.getHost parsed)))
      (tru "The MCP server URL must be an http or https URL with a host"))))

(defn client
  "A client for the MCP server at `:url`. Nothing is sent until the first request.

  Options:
  - `:headers` sent with every request, as a map or a 0-arity function returning one (for tokens that refresh).
  - `:client-info` `{:name :version}` reported to the server; defaults to this Metabase.
  - `:timeout-ms` (30000) bounds each request's reads; `:connection-timeout-ms` (10000) bounds connecting.
  - `:network-policy` restricts which networks the server may be on: `:external-only` (default), `:allow-private`,
    or `:allow-all`. Redirects are never followed."
  ^Client [{:keys [url] :as opts}]
  (when-let [explanation (mr/explain ::options opts)]
    (throw (ex-info (tru "Invalid MCP client options") {:type :mcp-client/invalid-options :problems (me/humanize explanation)})))
  (when-let [problem (url-problem url)]
    (throw (ex-info problem {:type :mcp-client/invalid-options :url url})))
  (map->Client (merge {:headers               {}
                       :client-info           {:name "Metabase" :version config/mb-version-string}
                       :timeout-ms            30000
                       :connection-timeout-ms 10000
                       :network-policy        :external-only}
                      opts
                      {:state (atom {})})))

(comment
  ;; Against the MCP server this Metabase hosts, which speaks the legacy protocol
  (def c (client {:url            "http://localhost:3000/api/metabase-mcp"
                  :headers        {"x-api-key" "mb_..."}
                  :network-policy :allow-all}))
  (discover c)
  (map :name (all-tools c))
  (call-tool c "some_tool" {:arg "value"})
  (close! c))
