(ns metabase.documents.collab.handler
  "Ring handler for `GET /api/document/collab`. Phase 2 scaffolding only —
   the WebSocket upgrade succeeds but no `YHocuspocus` consumes the resulting
   transport yet. Gated behind `MB_ENABLE_DOCUMENT_COLLAB`."
  (:require
   [metabase.config.core :as config]
   [metabase.documents.collab.transport :as collab.transport]
   [metabase.util.log :as log]
   [ring.websocket :as ring.ws]))

(set! *warn-on-reflection* true)

(defn- collab-path? [request]
  (= "/collab" ((some-fn :path-info :uri) request)))

(defn- ws-response [request]
  (let [conn-id (str (random-uuid))
        remote  (:remote-addr request)
        [_transport ws-listener] (collab.transport/create-ring-transport conn-id remote)]
    (log/debugf "collab upgrade accepted: %s from %s" conn-id remote)
    {::ring.ws/listener ws-listener}))

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
