(ns metabase.documents.collab.server-integration-test
  "Boots a real Jetty server through `server.instance/create-server` and verifies
   that a WebSocket client can complete the upgrade handshake against the collab
   handler. Exercises the modified `async-proxy-handler` end-to-end."
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.documents.collab.handler :as collab.handler]
   [metabase.server.instance :as server.instance])
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

(defn- recording-listener [received-future]
  (reify WebSocket$Listener
    (onOpen [_ ws]
      (.request ws 1))
    (onText [_ ws data _last]
      (.request ws 1)
      (.complete ^CompletableFuture received-future (str data))
      nil)
    (onClose [_ _ws _code _reason]
      nil)
    (onError [_ _ws _err])))

(defn- open-websocket ^WebSocket [^URI uri ^WebSocket$Listener listener]
  (-> (HttpClient/newHttpClient)
      (.newWebSocketBuilder)
      (.buildAsync uri listener)
      (.get 5 TimeUnit/SECONDS)))

(deftest websocket-upgrade-handshake-test
  (testing "a WebSocket client successfully upgrades against the collab endpoint"
    (with-redefs [config/config-bool (constantly true)]
      (let [server (start-server!)]
        (try
          (let [uri      (URI/create (str "ws://127.0.0.1:" (server-port server) "/api/document/collab"))
                received (CompletableFuture.)
                ws       (open-websocket uri (recording-listener received))]
            (try
              (is (some? ws) "WebSocket handshake should complete without throwing")
              (finally
                (try
                  @(.sendClose ws WebSocket/NORMAL_CLOSURE "test done")
                  (catch Throwable _)))))
          (finally
            (.stop server)))))))

(deftest websocket-handshake-fails-when-flag-off-test
  (testing "without MB_ENABLE_DOCUMENT_COLLAB the upgrade is rejected (404)"
    (with-redefs [config/config-bool (constantly false)]
      (let [server (start-server!)]
        (try
          (let [uri (URI/create (str "ws://127.0.0.1:" (server-port server) "/api/document/collab"))]
            (is (thrown? java.util.concurrent.ExecutionException
                         (open-websocket uri (recording-listener (CompletableFuture.))))
                "Upgrade should be refused (HTTP 404 → ExecutionException)"))
          (finally
            (.stop server)))))))
