(ns metabase.mcp-client.client-test
  "End-to-end tests against two in-process fake MCP servers: one speaking protocol version 2026-07-28 and one
  speaking the legacy initialize-era protocol."
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs]
   [metabase.mcp-client.client :as client]
   [metabase.mcp-client.core :as mcp]
   [metabase.util.json :as json]
   [ring.adapter.jetty :as jetty])
  (:import
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(comment mb.hawk.assert-exprs/keep-me)

;;; --------------------------------------------------- Harness ---------------------------------------------------

(defn- do-with-server [handler f]
  (let [^Server server (jetty/run-jetty handler {:port 0 :join? false})]
    (try
      (f (str "http://localhost:" (.. server getURI getPort)))
      (finally
        (.stop server)))))

(defmacro ^:private with-server [[url-binding handler] & body]
  `(do-with-server ~handler (fn [~url-binding] ~@body)))

(defn- json-response [status body]
  {:status status :headers {"Content-Type" "application/json"} :body (json/encode body)})

(defn- sse-response [messages]
  {:status  200
   :headers {"Content-Type" "text/event-stream"}
   :body    (str/join (for [m messages] (str "event: message\ndata: " (json/encode m) "\n\n")))})

(defn- rpc-result [id result]
  {:jsonrpc "2.0" :id id :result result})

(defn- rpc-error
  ([id code message]
   (rpc-error id code message nil))
  ([id code message data]
   {:jsonrpc "2.0" :id id :error (cond-> {:code code :message message} data (assoc :data data))}))

(defn- read-message [req]
  (some-> (:body req) slurp not-empty json/decode+kw))

(defn- test-client
  ([url]
   (test-client url nil))
  ([url opts]
   (mcp/client (merge {:url url :network-policy :allow-all :headers {"x-api-key" "secret"}} opts))))

(defn- methods-called [requests]
  (vec (keep (comp :method :message) @requests)))

(def ^:private echo-tool
  {:name "echo" :description "Echoes text" :inputSchema {:type "object" :properties {:text {:type "string"}}}})

(def ^:private fails-tool
  {:name "fails" :inputSchema {:type "object"}})

(def ^:private needs-input-tool
  {:name "needs_input" :inputSchema {:type "object"}})

(def ^:private invalid-tool
  {:name "invalid" :inputSchema {:type "object" :properties {:n {:type "number" :x-mcp-header "N"}}}})

(defn- regional-tool [annotated?]
  {:name        "regional"
   :inputSchema {:type       "object"
                 :properties {:region (cond-> {:type "string"} annotated? (assoc :x-mcp-header "Region"))}}})

;;; ------------------------------------------------ Fake servers ------------------------------------------------

(defn- modern-handler
  "A server speaking 2026-07-28. `state` holds `:versions`, `:auth-required?`, `:sse?` and `:strict-region?`."
  [requests state]
  (fn [req]
    (let [headers                   (:headers req)
          message                   (read-message req)
          {:keys [id method params]} message
          {:keys [versions auth-required? sse? strict-region?]} @state
          requested                 (get-in params [:_meta :io.modelcontextprotocol/protocolVersion])]
      (swap! requests conj {:http-method (:request-method req) :headers headers :message message})
      (cond
        (and auth-required? (not (get headers "authorization")))
        {:status  401
         :headers {"Content-Type" "application/json" "WWW-Authenticate" "Bearer resource_metadata=\"http://x/.well-known\""}
         :body    (json/encode {:error "unauthorized"})}

        (nil? id)
        {:status 202}

        (not (contains? versions requested))
        (json-response 400 (rpc-error id -32022 "Unsupported protocol version"
                                      {:supported (vec (sort versions)) :requested requested}))

        (not= method (get headers "mcp-method"))
        (json-response 400 (rpc-error id -32020 "Header mismatch: Mcp-Method"))

        :else
        (case method
          "server/discover"
          (json-response 200 (rpc-result id {:resultType        "complete"
                                             :supportedVersions (vec (sort versions))
                                             :capabilities      {:tools {:listChanged false}}
                                             :instructions      "Use the echo tool."
                                             :_meta             {:io.modelcontextprotocol/serverInfo
                                                                 {:name "fake-modern" :version "1.0"}}}))

          "tools/list"
          (json-response 200 (rpc-result id (if (= "page-2" (:cursor params))
                                              {:resultType "complete"
                                               :tools      [fails-tool needs-input-tool (regional-tool strict-region?)]}
                                              {:resultType "complete"
                                               :tools      [echo-tool invalid-tool]
                                               :nextCursor "page-2"})))

          "tools/call"
          (let [{tool-name :name, :keys [arguments]} params
                result (case tool-name
                         "echo"        {:resultType        "complete"
                                        :content           [{:type "text" :text (str "echo: " (:text arguments))}]
                                        :structuredContent {:headers (select-keys headers ["mcp-name" "mcp-method"
                                                                                           "mcp-protocol-version" "accept"])}}
                         "fails"       {:resultType "complete" :content [{:type "text" :text "boom"}] :isError true}
                         "needs_input" {:resultType "input_required" :requestState "opaque"}
                         "regional"    (if (and strict-region? (not= (:region arguments) (get headers "mcp-param-region")))
                                         ::header-mismatch
                                         {:resultType "complete"
                                          :content    [{:type "text" :text (str "region " (get headers "mcp-param-region"))}]})
                         ::unknown-tool)]
            (case result
              ::header-mismatch (json-response 400 (rpc-error id -32020 "Header mismatch: Mcp-Param-Region"))
              ::unknown-tool    (json-response 200 (rpc-error id -32602 (str "Unknown tool: " tool-name)))
              (if sse?
                (sse-response [{:jsonrpc "2.0" :method "notifications/progress" :params {:progress 1}}
                               (rpc-result id result)])
                (json-response 200 (rpc-result id result)))))

          "resources/read"
          (json-response 200 (rpc-result id {:resultType "complete"
                                             :contents   [{:uri (:uri params) :text (get headers "mcp-name")}]}))

          (json-response 404 (rpc-error id -32601 "Method not found")))))))

(defn- legacy-handler
  "A server speaking the initialize-era protocol. `state` holds `:version`, `:sessions`, `:sse-initialize?`,
  `:sse-call?` and `:no-delete?`."
  [requests state]
  (fn [req]
    (let [headers                   (:headers req)
          message                   (read-message req)
          {:keys [id method params]} message
          session                   (get headers "mcp-session-id")
          {:keys [version sessions sse-initialize? sse-call? no-delete?]} @state]
      (swap! requests conj {:http-method (:request-method req) :headers headers :message message})
      (cond
        (= :delete (:request-method req))
        (if no-delete?
          {:status 405}
          (do (swap! state update :sessions disj session)
              {:status 200}))

        (= method "initialize")
        (let [new-session (str (random-uuid))
              result      (rpc-result id {:protocolVersion version
                                          :capabilities    {:tools {}}
                                          :serverInfo      {:name "fake-legacy" :version "1.0"}})]
          (swap! state update :sessions conj new-session)
          (-> (if sse-initialize? (sse-response [result]) (json-response 200 result))
              (assoc-in [:headers "Mcp-Session-Id"] new-session)))

        (nil? session)
        (json-response 400 (rpc-error id -32600 "Missing Mcp-Session-Id header"))

        (not (contains? sessions session))
        {:status 404}

        ;; notifications, and responses to requests the server sent
        (or (nil? id) (nil? method))
        {:status 202}

        :else
        (case method
          "tools/list"
          (json-response 200 (rpc-result id {:tools [echo-tool]}))

          "tools/call"
          (let [result (rpc-result id {:content [{:type "text" :text (str "echo: " (get-in params [:arguments :text]))}]})]
            (if sse-call?
              (sse-response [{:jsonrpc "2.0" :id "srv-1" :method "sampling/createMessage" :params {:messages []}}
                             result])
              (json-response 200 result)))

          (json-response 200 (rpc-error id -32601 "Method not found")))))))

(defn- modern-state [& {:as overrides}]
  (atom (merge {:versions #{"2026-07-28"}} overrides)))

(defn- legacy-state [& {:as overrides}]
  (atom (merge {:version "2025-03-26" :sessions #{}} overrides)))

;;; ------------------------------------------------ Modern server ------------------------------------------------

(deftest modern-negotiation-test
  (let [requests (atom [])]
    (with-server [url (modern-handler requests (modern-state))]
      (let [c (test-client url)]
        (is (= {:era                :modern
                :protocol-version   "2026-07-28"
                :server-info        {:name "fake-modern" :version "1.0"}
                :capabilities       {:tools {:listChanged false}}
                :instructions       "Use the echo tool."
                :supported-versions ["2026-07-28"]}
               (mcp/discover c)))
        (let [result (mcp/call-tool c "echo" {:text "hi"})]
          (is (= [{:type "text" :text "echo: hi"}] (:content result)))
          (testing "the transport's standard headers mirror the body"
            (is (= {:mcp-name             "echo"
                    :mcp-method           "tools/call"
                    :mcp-protocol-version "2026-07-28"
                    :accept               "application/json, text/event-stream"}
                   (get-in result [:structuredContent :headers])))))
        (testing "an unknown tool is listed for once, then called"
          (is (= ["server/discover" "tools/list" "tools/list" "tools/call"] (methods-called requests))))
        (testing "every request carries the per-request _meta and the user's headers"
          (let [{:keys [message headers]} (last @requests)]
            (is (= {:io.modelcontextprotocol/protocolVersion    "2026-07-28"
                    :io.modelcontextprotocol/clientCapabilities {}
                    :io.modelcontextprotocol/clientInfo         (:client-info c)}
                   (get-in message [:params :_meta])))
            (is (= "secret" (get headers "x-api-key")))))))))

(deftest modern-tools-test
  (let [requests (atom [])]
    (with-server [url (modern-handler requests (modern-state))]
      (let [c (test-client url)]
        (testing "all-tools follows pagination and drops a tool with an invalid x-mcp-header"
          (is (= ["echo" "fails" "needs_input" "regional"] (map :name (mcp/all-tools c))))
          (is (= ["server/discover" "tools/list" "tools/list"] (methods-called requests))))
        (testing "a single page is returned as-is, cursor included"
          (is (= "page-2" (:nextCursor (mcp/list-tools c))))
          (is (= ["echo"] (map :name (:tools (mcp/list-tools c))))))
        (testing "tool execution errors are returned, not thrown"
          (is (= {:resultType "complete" :content [{:type "text" :text "boom"}] :isError true}
                 (mcp/call-tool c "fails" {}))))
        (testing "an input_required result is returned verbatim"
          (is (= {:resultType "input_required" :requestState "opaque"}
                 (mcp/call-tool c "needs_input" {}))))
        (testing "protocol errors throw"
          (let [e (is (thrown? clojure.lang.ExceptionInfo (mcp/call-tool c "nope" {})))]
            (is (=? {:type :mcp-client/jsonrpc-error :code -32602 :method "tools/call" :status 200}
                    (ex-data e)))))))))

(deftest modern-sse-response-test
  (let [requests (atom [])]
    (with-server [url (modern-handler requests (modern-state :sse? true))]
      (let [c (test-client url)]
        (is (= [{:type "text" :text "echo: streamed"}]
               (:content (mcp/call-tool c "echo" {:text "streamed"}))))))))

(deftest modern-param-headers-test
  (let [requests (atom [])]
    (with-server [url (modern-handler requests (modern-state :strict-region? true))]
      (let [c (test-client url)]
        (is (= [{:type "text" :text "region eu-west"}]
               (:content (mcp/call-tool c "regional" {:region "eu-west"}))))
        (is (= "eu-west" (get-in (last @requests) [:headers "mcp-param-region"])))))))

(deftest modern-header-mismatch-refresh-test
  (let [requests (atom [])
        state    (modern-state :strict-region? false)]
    (with-server [url (modern-handler requests state)]
      (let [c (test-client url)]
        (mcp/all-tools c)
        (testing "when the server starts requiring a header we did not know about, the listing is refreshed and the call retried"
          (swap! state assoc :strict-region? true)
          (is (= [{:type "text" :text "region eu-west"}]
                 (:content (mcp/call-tool c "regional" {:region "eu-west"}))))
          (is (= ["tools/call" "tools/list" "tools/list" "tools/call"]
                 (drop 3 (methods-called requests)))))))))

(deftest modern-version-fallback-test
  (let [requests (atom [])]
    (with-server [url (modern-handler requests (modern-state))]
      (with-redefs [client/latest-protocol-version  "2027-01-01"
                    client/modern-protocol-versions #{"2027-01-01" "2026-07-28"}]
        (let [c (test-client url)]
          (is (=? {:era :modern :protocol-version "2026-07-28"} (mcp/discover c)))
          (is (= ["2027-01-01" "2026-07-28"]
                 (map #(get-in % [:message :params :_meta :io.modelcontextprotocol/protocolVersion]) @requests))))))))

(deftest unsupported-version-test
  (let [requests (atom [])]
    (with-server [url (modern-handler requests (modern-state :versions #{"2030-01-01"}))]
      (let [e (is (thrown? clojure.lang.ExceptionInfo (mcp/discover (test-client url))))]
        (is (=? {:type :mcp-client/unsupported-protocol-version :supported ["2030-01-01"]} (ex-data e)))))))

(deftest unauthorized-test
  (let [requests (atom [])]
    (with-server [url (modern-handler requests (modern-state :auth-required? true))]
      (let [e (is (thrown? clojure.lang.ExceptionInfo (mcp/list-tools (test-client url))))]
        (is (=? {:type :mcp-client/http-error :status 401 :www-authenticate #"^Bearer .*"} (ex-data e)))
        (testing "an auth failure is never mistaken for a legacy server"
          (is (not (contains? (set (methods-called requests)) "initialize"))))))))

(deftest read-resource-test
  (let [requests (atom [])]
    (with-server [url (modern-handler requests (modern-state))]
      (is (= [{:uri "file:///ä" :text "=?base64?ZmlsZTovLy/DpA==?="}]
             (:contents (mcp/read-resource (test-client url) "file:///ä")))
          "Mcp-Name carries the uri, encoded when it is not header-safe"))))

;;; ------------------------------------------------ Legacy server ------------------------------------------------

(deftest legacy-negotiation-test
  (let [requests (atom [])]
    (with-server [url (legacy-handler requests (legacy-state))]
      (let [c (test-client url)]
        (is (= {:era              :legacy
                :protocol-version "2025-03-26"
                :server-info      {:name "fake-legacy" :version "1.0"}
                :capabilities     {:tools {}}
                :instructions     nil}
               (mcp/discover c)))
        (is (= ["server/discover" "initialize" "notifications/initialized"] (methods-called requests)))
        (is (= [{:type "text" :text "echo: hi"}] (:content (mcp/call-tool c "echo" {:text "hi"}))))
        (testing "requests after initialize carry the session and negotiated version, and no _meta"
          (let [{:keys [message headers]} (last @requests)
                session                   (get headers "mcp-session-id")]
            (is (string? session))
            (is (= "2025-03-26" (get headers "mcp-protocol-version")))
            (is (= {:name "echo" :arguments {:text "hi"}} (:params message)))))
        (testing "the modern probe was sent without legacy headers"
          (is (nil? (get-in (first @requests) [:headers "mcp-session-id"]))))))))

(deftest legacy-sse-test
  (let [requests (atom [])]
    (with-server [url (legacy-handler requests (legacy-state :sse-initialize? true :sse-call? true))]
      (let [c (test-client url)]
        (is (= [{:type "text" :text "echo: hi"}] (:content (mcp/call-tool c "echo" {:text "hi"}))))
        (testing "a request the server sent on the stream is answered method-not-found"
          (is (=? {:jsonrpc "2.0" :id "srv-1" :error {:code -32601}}
                  (some #(when (= "srv-1" (get-in % [:message :id])) (:message %)) @requests))))))))

(deftest legacy-stale-session-test
  (let [requests (atom [])
        state    (legacy-state)]
    (with-server [url (legacy-handler requests state)]
      (let [c (test-client url)]
        (mcp/discover c)
        (swap! state assoc :sessions #{})
        (is (= [{:type "text" :text "echo: again"}] (:content (mcp/call-tool c "echo" {:text "again"}))))
        (is (= 2 (count (filter #{"initialize"} (methods-called requests)))))))))

(deftest legacy-unsupported-version-test
  (let [requests (atom [])]
    (with-server [url (legacy-handler requests (legacy-state :version "2024-11-05" :no-delete? true))]
      (let [e (is (thrown? clojure.lang.ExceptionInfo (mcp/discover (test-client url))))]
        (is (=? {:type :mcp-client/unsupported-protocol-version :server-version "2024-11-05"} (ex-data e)))))))

(deftest close-test
  (let [requests (atom [])]
    (with-server [url (legacy-handler requests (legacy-state))]
      (let [c (test-client url)]
        (is (nil? (mcp/close! c)) "closing before use sends nothing")
        (is (empty? @requests))
        (mcp/discover c)
        (mcp/close! c)
        (let [{:keys [http-method headers]} (last @requests)]
          (is (= :delete http-method))
          (is (string? (get headers "mcp-session-id"))))
        (testing "the client is usable again and negotiates afresh"
          (mcp/list-tools c)
          (is (= 2 (count (filter #{"initialize"} (methods-called requests))))))))))

;;; --------------------------------------------------- Client value ---------------------------------------------------

(deftest print-method-test
  (let [c (test-client "http://example.com/mcp")]
    (is (str/includes? (pr-str c) "http://example.com/mcp"))
    (is (not (str/includes? (pr-str c) "secret")))
    (is (= (str (pr-str c) "\n")
           #_{:clj-kondo/ignore [:discouraged-var]}
           (with-out-str (pprint/pprint c))))))

(deftest network-policy-test
  (let [requests (atom [])]
    (with-server [url (modern-handler requests (modern-state))]
      (let [e (is (thrown? clojure.lang.ExceptionInfo (mcp/list-tools (test-client url {:network-policy :external-only}))))]
        (is (=? {:type :mcp-client/network-policy-error :policy :external-only :host "localhost"} (ex-data e)))
        (is (empty? @requests) "the connection was refused before anything reached the server")))))

(deftest invalid-options-test
  (are [opts] (=? {:type :mcp-client/invalid-options}
                  (ex-data (is (thrown? clojure.lang.ExceptionInfo (mcp/client opts)))))
    {:url "ftp://example.com/mcp"}
    {:url "not a url"}
    {:url "http://example.com/mcp" :bogus true}
    {:url "http://example.com/mcp" :network-policy :whatever}))
