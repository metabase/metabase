(ns metabase.documents.collab.server-integration-test
  "Boots a real Jetty server through `server.instance/create-server` and verifies
   that a WebSocket client can complete the upgrade handshake against the collab
   handler, exchange a frame, and close cleanly. Exercises the modified
   `async-proxy-handler` end-to-end."
  (:require
   [clojure.test :refer :all]
   [metabase.documents.collab.handler :as collab.handler]
   [metabase.server.instance :as server.instance]
   [metabase.test :as mt])
  (:import
   (java.net URI)
   (java.net.http HttpClient WebSocket WebSocket$Listener)
   (java.util.concurrent CompletableFuture CompletionStage TimeUnit)
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(defn- root-handler
  "Re-roots all incoming requests to `/collab` so the integration test can hit
   any URL on the test server and reach the collab handler."
  [request respond raise]
  (collab.handler/routes (assoc request :path-info "/collab") respond raise))

(defn- start-server! ^Server []
  (doto (server.instance/create-server #'root-handler {:port 0 :host "127.0.0.1"})
    (.start)))

(defn- server-port [^Server server]
  (.. server getURI getPort))

(defn- recording-listener
  "Returns a `WebSocket$Listener` whose `onText` completes `received-future`
   with the incoming text."
  [^CompletableFuture received-future]
  (reify WebSocket$Listener
    (onOpen [_ ws]
      (.request ws 1))
    (onText [_ ws data _last]
      (.request ws 1)
      (.complete received-future (str data))
      nil)
    (onClose [_ _ws _code _reason]
      nil)
    (onError [_ _ws _err])))

(defn- open-websocket ^WebSocket [^HttpClient client ^URI uri ^WebSocket$Listener listener]
  (-> client
      (.newWebSocketBuilder)
      (.buildAsync uri listener)
      (.get 5 TimeUnit/SECONDS)))

(deftest websocket-upgrade-handshake-test
  (testing "a WebSocket client completes the upgrade handshake, exchanges a frame, and closes cleanly"
    (mt/with-temporary-setting-values [enable-document-collab true]
      (let [server (start-server!)]
        (try
          (with-open [client (HttpClient/newHttpClient)]
            (let [uri      (URI/create (str "ws://127.0.0.1:" (server-port server) "/api/document/collab"))
                  received (CompletableFuture.)
                  ws       (open-websocket client uri (recording-listener received))]
              (try
                (is (some? ws) "WebSocket handshake should complete without throwing")
                (testing "client can send a text frame without error"
                  ;; No server-side echo in Phase 2 (the transport is created but its
                  ;; ReceiveListener is never set), so we assert one-direction delivery
                  ;; only — the future completes iff the frame is accepted by the server.
                  (let [send-future (.sendText ws "ping" true)]
                    (is (= ws (.get send-future 2 TimeUnit/SECONDS)))))
                (finally
                  (try
                    @(.sendClose ws WebSocket/NORMAL_CLOSURE "test done")
                    (catch Throwable _))))))
          (finally
            (.stop server)))))))

(deftest websocket-handshake-fails-when-flag-off-test
  (testing "without MB_ENABLE_DOCUMENT_COLLAB the upgrade is rejected (404)"
    (mt/with-temporary-setting-values [enable-document-collab false]
      (let [server (start-server!)]
        (try
          (with-open [client (HttpClient/newHttpClient)]
            (let [uri (URI/create (str "ws://127.0.0.1:" (server-port server) "/api/document/collab"))]
              (is (thrown-with-msg?
                   java.util.concurrent.ExecutionException
                   #"WebSocketHandshakeException"
                   (open-websocket client uri (recording-listener (CompletableFuture.)))))))
          (finally
            (.stop server)))))))
