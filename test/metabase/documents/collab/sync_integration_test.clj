(ns metabase.documents.collab.sync-integration-test
  "Two WebSocket clients connect concurrently against a real Jetty +
   YHocuspocus pipeline and exchange SyncProtocol messages for a shared
   document. Covers the transport-level cross-client-routing path that unit
   tests can't (persistence, authz, and handler are all separately covered)."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.documents.collab.authz :as collab.authz]
   [metabase.documents.collab.handler :as collab.handler]
   [metabase.documents.collab.persistence :as collab.persistence]
   [metabase.documents.collab.server :as collab.server]
   [metabase.models.interface :as mi]
   [metabase.server.instance :as server.instance]
   [metabase.test :as mt])
  (:import
   (java.net URI)
   (java.net.http HttpClient WebSocket WebSocket$Listener)
   (java.nio ByteBuffer)
   (java.time Duration)
   (java.util.concurrent CompletableFuture CompletionStage TimeUnit)
   (net.carcdr.yhocuspocus.core YHocuspocus)
   (net.carcdr.yhocuspocus.extension Extension)
   (net.carcdr.yhocuspocus.protocol OutgoingMessage SyncProtocol)
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

;; A test-only YHocuspocus boot. The production `collab.server/get-server` is
;; a defonce'd delay that we can't reset cleanly from tests (see
;; task:collab-server-boot-test-coverage), so we build a fresh server here
;; and `with-redefs` `get-server` to return it for the duration of the test.

(defn- noop-authz-extension
  "Accept-all stub so the test doesn't depend on cross-thread visibility of the
   `mt/with-temp` document row. Per-permission behaviour is exercised in
   authz_test."
  ^Extension []
  (reify Extension))

(defn- build-test-server ^YHocuspocus []
  (.. (YHocuspocus/builder)
      (extension (collab.persistence/create-persistence-extension))
      (extension (noop-authz-extension))
      (debounce (Duration/ofMillis 200))
      (maxDebounce (Duration/ofMillis 500))
      (build)))

(defn- root-handler
  "Collab handler re-rooted at `/collab` for the test Jetty."
  [request respond raise]
  (binding [api/*current-user-id* (mt/user->id :crowberto)]
    (collab.handler/routes (assoc request :path-info "/collab") respond raise)))

(defn- start-server! ^Server []
  (doto (server.instance/create-server #'root-handler {:port 0 :host "127.0.0.1"})
    (.start)))

(defn- server-port [^Server server] (.. server getURI getPort))

(defn- binary-recorder
  "Returns `[listener received-promise]`. The promise completes with the
   first inbound binary frame (a `ByteBuffer`)."
  []
  (let [received (CompletableFuture.)
        listener (reify WebSocket$Listener
                   (onOpen [_ ws] (.request ws 1))
                   (onBinary [_ ws data _last]
                     (.complete received data)
                     (.request ws 1)
                     nil)
                   (onClose [_ _ws _code _reason] nil)
                   (onError [_ _ws _err]))]
    [listener received]))

(defn- open-ws ^WebSocket [^HttpClient client ^URI uri ^WebSocket$Listener listener]
  (-> client
      (.newWebSocketBuilder)
      (.buildAsync uri listener)
      (.get 5 TimeUnit/SECONDS)))

(defn- send-bytes! [^WebSocket ws ^bytes payload]
  @(.sendBinary ws (ByteBuffer/wrap payload) true))

(deftest two-clients-receive-server-mediated-traffic-test
  (testing "two WS clients for the same document both receive broadcasts after SyncStep1"
    (mt/with-temp [:model/Document {entity-id :entity_id}
                   {:name "Sync test doc" :document {:type "doc" :content []}
                    :creator_id (mt/user->id :crowberto)}]
      (mt/with-temporary-setting-values [enable-document-collab true]
        (with-redefs [collab.server/get-server (let [s (build-test-server)]
                                                 (constantly s))
                      ;; Bypass the real permission plumbing; per-perm behaviour
                      ;; is exercised by authz_test. We're proving transport +
                      ;; sync routing here, not authz.
                      mi/can-read?             (fn [_doc] true)
                      mi/can-write?            (fn [_doc] true)]
          (let [^YHocuspocus server (collab.server/get-server)
                test-server (start-server!)]
            (try
              (with-open [client-a (HttpClient/newHttpClient)
                          client-b (HttpClient/newHttpClient)]
                (let [uri (URI/create (str "ws://127.0.0.1:" (server-port test-server)
                                           "/api/document/collab"))
                      doc-name (str "document:" entity-id)
                      [listen-a recv-a] (binary-recorder)
                      [listen-b recv-b] (binary-recorder)
                      ws-a (open-ws client-a uri listen-a)
                      ws-b (open-ws client-b uri listen-b)]
                  (try
                    ;; Both clients ask the server for the current state. The
                    ;; SyncStep1 payload is an empty state vector (the client
                    ;; "knows nothing yet").
                    (let [step1 (SyncProtocol/encodeSyncStep1 (byte-array 0))
                          msg   (.encode (OutgoingMessage/sync doc-name step1))]
                      (send-bytes! ws-a msg)
                      (send-bytes! ws-b msg))
                    ;; Each client should receive at least one binary response
                    ;; from the server (the SyncReply + loaded state). Wait up
                    ;; to 3s each. `.get` throws TimeoutException on timeout, so
                    ;; reaching the assertion already proves a frame arrived —
                    ;; we additionally assert the frame actually carries bytes
                    ;; (rules out a phantom empty frame).
                    (let [^ByteBuffer a-got (.get ^CompletableFuture recv-a 3 TimeUnit/SECONDS)
                          ^ByteBuffer b-got (.get ^CompletableFuture recv-b 3 TimeUnit/SECONDS)]
                      (is (pos? (.remaining a-got)) "client A got a non-empty response")
                      (is (pos? (.remaining b-got)) "client B got a non-empty response"))
                    (finally
                      (try @(.sendClose ws-a WebSocket/NORMAL_CLOSURE "done")
                           (catch Throwable _))
                      (try @(.sendClose ws-b WebSocket/NORMAL_CLOSURE "done")
                           (catch Throwable _))))))
              (finally
                (.stop test-server)
                (try (.close server) (catch Throwable _))))))))))
