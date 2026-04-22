(ns metabase.documents.collab.handler
  "Ring handler for `GET /api/document/collab`. On upgrade, hands the resulting
   `Transport` to the embedded `YHocuspocus` server via `handleConnection`.
   Gated behind `MB_ENABLE_DOCUMENT_COLLAB`."
  (:require
   [metabase.config.core :as config]
   [metabase.documents.collab.server :as collab.server]
   [metabase.documents.collab.transport :as collab.transport]
   [metabase.util.log :as log]
   [ring.websocket :as ring.ws])
  (:import
   (java.util HashMap)
   (net.carcdr.yhocuspocus.core YHocuspocus)
   (net.carcdr.yhocuspocus.transport Transport)))

(set! *warn-on-reflection* true)

(defn- collab-path? [request]
  (= "/collab" ((some-fn :path-info :uri) request)))

(defn- wrap-on-open
  "Compose a new `:on-open` that runs the listener's existing `:on-open` first
   (so the transport captures the socket), then invokes `f` with the socket."
  [ws-listener f]
  (update ws-listener :on-open
          (fn [orig] (fn [sock] (orig sock) (f sock)))))

(defn- initial-context ^HashMap [conn-id remote]
  (doto (HashMap.)
    (.put "connectionId"  conn-id)
    (.put "remoteAddress" (or remote "unknown"))))

(defn- ws-response [request]
  (let [conn-id  (str (random-uuid))
        remote   (:remote-addr request)
        ^YHocuspocus server (collab.server/get-server)
        [^Transport transport ws-listener] (collab.transport/create-ring-transport conn-id remote)
        listener (if server
                   (wrap-on-open ws-listener
                                 (fn on-server-ready [_sock]
                                   (.handleConnection server transport (initial-context conn-id remote))))
                   (wrap-on-open ws-listener
                                 (fn on-no-server [sock]
                                   (log/warn "collab: rejecting connection — server unavailable")
                                   (ring.ws/close sock 1011 "document-collab server unavailable"))))]
    (log/debugf "collab upgrade accepted: %s from %s (server=%s)" conn-id remote (some? server))
    {::ring.ws/listener listener}))

(defn routes
  "3-arg async Ring handler. Pass-through (`respond nil`) unless the request
   targets `/collab`, so callers can fall through to other documents routes.
   Returns 404 when `MB_ENABLE_DOCUMENT_COLLAB` is unset, 426 for a non-upgrade
   request, otherwise yields a Ring WebSocket response."
  [request respond _raise]
  (cond
    (not (collab-path? request))
    (respond nil)

    (not (config/config-bool :mb-enable-document-collab))
    (respond {:status 404 :headers {"content-type" "text/plain"} :body "Not found"})

    (not (ring.ws/upgrade-request? request))
    (respond {:status 426 :headers {"content-type" "text/plain"} :body "Upgrade required"})

    :else
    (respond (ws-response request))))
