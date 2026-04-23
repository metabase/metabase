(ns metabase.documents.collab.handler
  "Ring handler for `GET /api/document/collab`. On upgrade, hands the resulting
   `Transport` to the embedded `YHocuspocus` server via `handleConnection`.
   Gated behind the `enable-document-collab` setting (env var
   `MB_ENABLE_DOCUMENT_COLLAB`).

   Authentication is already enforced by `+auth` middleware upstream; by the
   time this handler runs, `api/*current-user-id*` is bound to the session's
   user. We capture it into the yhocuspocus context so extensions running on
   the server's executor threads (e.g. the authz hook) can rebind it for
   permission checks."
  (:require
   [metabase.api.common :as api]
   [metabase.documents.collab.server :as collab.server]
   [metabase.documents.collab.settings :as collab.settings]
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

(defn- wrap-on-close
  "Compose a new `:on-close` that runs the listener's existing `:on-close`
   first, then invokes `f` with the close-code."
  [ws-listener f]
  (update ws-listener :on-close
          (fn [orig] (fn [sock code reason]
                       (orig sock code reason)
                       (f code)))))

(defn- make-context
  "Build the `Map<String,Object>` context yhocuspocus surfaces to extension
   hooks. Keys are co-located here so future additions (e.g. tenant) stay
   consolidated."
  ^HashMap [conn-id remote user-id]
  (doto (HashMap.)
    (.put "connectionId"  conn-id)
    (.put "remoteAddress" (or remote "unknown"))
    (.put "userId"        user-id)))

(defn call-handle-connection!
  "Thin indirection over `YHocuspocus.handleConnection` so tests can stub the
   server interaction without having to mock a final Java class. Public only
   for testability — not intended for external callers."
  [^YHocuspocus server ^Transport transport ^HashMap ctx]
  (.handleConnection server transport ctx))

(defn- ws-response [request]
  (let [conn-id  (str (random-uuid))
        remote   (:remote-addr request)
        user-id  api/*current-user-id*
        ^YHocuspocus server (collab.server/get-server)
        [^Transport transport ws-listener] (collab.transport/create-ring-transport conn-id remote)
        listener (cond-> ws-listener
                   server
                   (wrap-on-open (fn on-server-ready [_sock]
                                   (log/infof "collab: connection open %s user=%s remote=%s"
                                              conn-id user-id remote)
                                   (call-handle-connection! server transport
                                                            (make-context conn-id remote user-id))))
                   (not server)
                   (wrap-on-open (fn on-no-server [sock]
                                   (log/warn "collab: rejecting connection — server unavailable")
                                   (ring.ws/close sock 1011 "document-collab server unavailable")))
                   true
                   (wrap-on-close (fn on-close [code]
                                    (log/infof "collab: connection closed %s user=%s code=%s"
                                               conn-id user-id code))))]
    {::ring.ws/listener listener}))

(defn routes
  "3-arg async Ring handler. Pass-through (`respond nil`) unless the request
   targets `/collab`, so callers can fall through to other documents routes.
   Returns 404 when `enable-document-collab` is off, 426 for a non-upgrade
   request, otherwise yields a Ring WebSocket response."
  [request respond _raise]
  (cond
    (not (collab-path? request))
    (respond nil)

    (not (collab.settings/enable-document-collab))
    (respond {:status 404 :headers {"content-type" "text/plain"} :body "Not found"})

    (not (ring.ws/upgrade-request? request))
    (respond {:status 426 :headers {"content-type" "text/plain"} :body "Upgrade required"})

    :else
    (respond (ws-response request))))
