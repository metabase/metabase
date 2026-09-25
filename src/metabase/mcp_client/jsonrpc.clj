(ns metabase.mcp-client.jsonrpc
  "JSON-RPC 2.0 envelopes and error codes used by the MCP client. Pure functions, no I/O."
  (:require
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.util.concurrent.atomic AtomicLong)))

(set! *warn-on-reflection* true)

;;; Standard JSON-RPC 2.0 codes
(def parse-error "Invalid JSON was received." -32700)
(def invalid-request "The JSON sent is not a valid request object." -32600)
(def method-not-found "The method does not exist or is not available." -32601)
(def invalid-params "Invalid method parameters." -32602)
(def internal-error "Internal JSON-RPC error." -32603)

;;; Codes defined by MCP 2026-07-28. A server that emits one of these is speaking a modern protocol version.
(def header-mismatch "Mirrored HTTP headers do not match the request body." -32020)
(def missing-required-client-capability "The request needs a client capability that was not declared." -32021)
(def unsupported-protocol-version "The server does not implement the requested protocol version." -32022)

(def modern-error-codes
  "Error codes that only a server implementing protocol version 2026-07-28 or later can send."
  #{header-mismatch missing-required-client-capability unsupported-protocol-version})

(defonce ^:private id-counter (AtomicLong.))

(defn next-id!
  "A request id that has not been used by this JVM before."
  []
  (.incrementAndGet ^AtomicLong id-counter))

(defn request
  "A JSON-RPC request envelope. `params` is omitted when nil."
  [id method params]
  (cond-> {:jsonrpc "2.0" :id id :method method}
    (some? params) (assoc :params params)))

(defn notification
  "A JSON-RPC notification envelope (no id, no reply expected). `params` is omitted when nil."
  [method params]
  (cond-> {:jsonrpc "2.0" :method method}
    (some? params) (assoc :params params)))

(defn error-response
  "A JSON-RPC error response envelope, for replying to a request the server sent us."
  [id code message]
  {:jsonrpc "2.0" :id id :error {:code code :message message}})

(defn modern-meta
  "The `_meta` fields every request carries under protocol version 2026-07-28, which replaced the `initialize`
  handshake. The client declares no capabilities, so a conforming server never asks it for input."
  [protocol-version client-info]
  {:io.modelcontextprotocol/protocolVersion    protocol-version
   :io.modelcontextprotocol/clientCapabilities {}
   :io.modelcontextprotocol/clientInfo         client-info})

(defn with-modern-meta
  "`params` with [[modern-meta]] merged into its `_meta`, keeping any keys already there (such as `progressToken`)."
  [params protocol-version client-info]
  (update params :_meta #(merge (modern-meta protocol-version client-info) %)))

(defn response?
  "Whether `message` is the response to the request with `id`."
  [message id]
  (and (map? message)
       (= (:id message) id)
       (or (contains? message :result) (contains? message :error))))

(defn error->ex
  "An exception for the `error` object of a JSON-RPC error response. `status` is the HTTP status it arrived with."
  [{:keys [url method status]} {:keys [code message data]}]
  (ex-info (tru "MCP request {0} failed: {1}" method message)
           {:type    :mcp-client/jsonrpc-error
            :url     url
            :method  method
            :status  status
            :code    code
            :message message
            :data    data}))
