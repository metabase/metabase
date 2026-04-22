(ns metabase.documents.collab.handler-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.documents.collab.handler :as collab.handler]
   [metabase.documents.collab.server :as collab.server])
  (:import
   (ring.websocket.protocols Socket)))

(set! *warn-on-reflection* true)

(defn- call-handler
  "Synchronously invoke the 3-arg async handler, returning its `respond` value."
  [request]
  (let [responded (promise)
        raised    (promise)]
    (collab.handler/routes request #(deliver responded %) #(deliver raised %))
    (when (realized? raised) (throw (ex-info "raise called" {:e @raised})))
    @responded))

(defn- upgrade-request [path]
  {:request-method :get
   :uri            path
   :path-info      path
   :remote-addr    "127.0.0.1"
   :headers        {"connection" "Upgrade"
                    "upgrade"    "websocket"}})

(defn- plain-request [path]
  {:request-method :get
   :uri            path
   :path-info      path
   :remote-addr    "127.0.0.1"
   :headers        {}})

(deftest non-collab-path-passes-through-test
  (with-redefs [config/config-bool (constantly true)]
    (is (nil? (call-handler (upgrade-request "/some/other/path"))))))

(deftest flag-off-returns-404-test
  (with-redefs [config/config-bool (constantly false)]
    (let [resp (call-handler (upgrade-request "/collab"))]
      (is (= 404 (:status resp))))))

(deftest non-upgrade-request-returns-426-test
  (with-redefs [config/config-bool (constantly true)]
    (let [resp (call-handler (plain-request "/collab"))]
      (is (= 426 (:status resp))))))

(deftest upgrade-returns-websocket-listener-test
  (with-redefs [config/config-bool     (constantly true)
                collab.server/get-server (constantly nil)]
    (let [resp (call-handler (upgrade-request "/collab"))]
      (is (contains? resp :ring.websocket/listener))
      (let [listener (:ring.websocket/listener resp)]
        (is (map? listener))
        (is (every? listener [:on-open :on-message :on-close :on-error]))))))

(defn- recording-socket
  "A `Socket` stub that records every `-close` invocation as `[code reason]`."
  []
  (let [closes (atom [])
        sock   (reify Socket
                 (-open?  [_] true)
                 (-send   [_ _msg] nil)
                 (-ping   [_ _data] nil)
                 (-pong   [_ _data] nil)
                 (-close  [_ code reason] (swap! closes conj [code reason])))]
    [sock closes]))

(deftest on-open-closes-1011-when-server-unavailable-test
  (testing "with no running YHocuspocus, :on-open closes the socket with 1011"
    (with-redefs [config/config-bool       (constantly true)
                  collab.server/get-server (constantly nil)]
      (let [resp          (call-handler (upgrade-request "/collab"))
            listener      (:ring.websocket/listener resp)
            [sock closes] (recording-socket)]
        ((:on-open listener) sock)
        (is (= [[1011 "document-collab server unavailable"]] @closes))))))

(deftest on-open-forwards-user-id-to-server-test
  (testing "with a running server, :on-open invokes handleConnection with a context HashMap that includes userId"
    (let [captured (atom nil)]
      (with-redefs [config/config-bool               (constantly true)
                    collab.server/get-server         (constantly ::fake-server)
                    ;; Stub the indirection; real YHocuspocus is final and can't be reified.
                    collab.handler/call-handle-connection!
                    (fn [server _transport ctx]
                      (reset! captured {:server server
                                        :user-id (.get ctx "userId")
                                        :connection-id (.get ctx "connectionId")}))]
        (let [resp          (binding [api/*current-user-id* 42]
                              (call-handler (upgrade-request "/collab")))
              listener      (:ring.websocket/listener resp)
              [sock _close] (recording-socket)]
          ((:on-open listener) sock)
          (is (= ::fake-server (:server @captured)))
          (is (= 42 (:user-id @captured)))
          (is (string? (:connection-id @captured))))))))
