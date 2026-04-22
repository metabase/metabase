(ns metabase.documents.collab.transport-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.collab.transport :as collab.transport])
  (:import
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent ExecutionException TimeUnit)
   (net.carcdr.yhocuspocus.transport ReceiveListener Transport)
   (ring.websocket.protocols Socket)))

(set! *warn-on-reflection* true)

(defn- recording-socket
  "Returns `[socket sent-atom]` where every `-send`d message is appended to
   `sent-atom` (vector). The socket is always considered open."
  []
  (let [sent (atom [])
        sock (reify Socket
               (-open? [_] true)
               (-send  [_ message] (swap! sent conj message))
               (-ping  [_ _data] nil)
               (-pong  [_ _data] nil)
               (-close [_ _code _reason] nil))]
    [sock sent]))

(defn- recording-listener
  "Returns `[listener received-atom]` capturing every `byte[]` delivered."
  []
  (let [received (atom [])
        listener (reify ReceiveListener
                   (onMessage [_ data] (swap! received conj (vec data))))]
    [listener received]))

(deftest ^:parallel constructor-returns-pair-test
  (let [[transport ws-listener] (collab.transport/create-ring-transport "abc" "127.0.0.1")]
    (is (instance? Transport transport))
    (is (map? ws-listener))
    (is (every? ws-listener [:on-open :on-message :on-close :on-error]))))

(deftest ^:parallel connection-id-and-remote-address-test
  (let [[^Transport transport _] (collab.transport/create-ring-transport "conn-7" "10.0.0.5")]
    (is (= "conn-7" (.getConnectionId transport)))
    (is (= "10.0.0.5" (.getRemoteAddress transport)))))

(deftest ^:parallel remote-address-defaults-when-nil-test
  (let [[^Transport transport _] (collab.transport/create-ring-transport "c" nil)]
    (is (= "unknown" (.getRemoteAddress transport)))))

(deftest ^:parallel send-before-open-fails-future-test
  (testing "send with no socket captured returns a failed CompletableFuture (no NPE)"
    (let [[^Transport transport _] (collab.transport/create-ring-transport "c" "x")
          fut                      (.send transport (byte-array [1 2 3]))]
      (is (thrown-with-msg? ExecutionException #"Transport has no socket"
                            (.get fut 2 TimeUnit/SECONDS))))))

(deftest ^:parallel send-after-open-writes-bytebuffer-test
  (testing "send after :on-open delivers a ByteBuffer with the original bytes"
    (let [[^Transport transport ws-listener] (collab.transport/create-ring-transport "c" "x")
          [sock sent]                        (recording-socket)
          payload                            (byte-array [10 20 30 40])]
      ((:on-open ws-listener) sock)
      @(.send transport payload)
      (is (= 1 (count @sent)))
      (let [^ByteBuffer bb (first @sent)
            arr            (byte-array (.remaining bb))]
        (.get bb arr)
        (is (= (vec payload) (vec arr)))))))

(deftest ^:parallel on-message-byte-array-test
  (let [[^Transport transport ws-listener] (collab.transport/create-ring-transport "c" "x")
        [listener received]                (recording-listener)
        payload                            (byte-array [1 2 3])]
    (.setReceiveListener transport listener)
    ((:on-message ws-listener) :sock-stub payload)
    (is (= [[1 2 3]] @received))))

(deftest ^:parallel on-message-bytebuffer-test
  (let [[^Transport transport ws-listener] (collab.transport/create-ring-transport "c" "x")
        [listener received]                (recording-listener)
        bb                                 (ByteBuffer/wrap (byte-array [4 5 6]))]
    (.setReceiveListener transport listener)
    ((:on-message ws-listener) :sock-stub bb)
    (is (= [[4 5 6]] @received))))

(deftest ^:parallel on-message-string-test
  (let [[^Transport transport ws-listener] (collab.transport/create-ring-transport "c" "x")
        [listener received]                (recording-listener)
        msg                                "hi"]
    (.setReceiveListener transport listener)
    ((:on-message ws-listener) :sock-stub msg)
    (is (= [(vec (.getBytes msg StandardCharsets/UTF_8))] @received))))

(deftest ^:parallel on-message-without-receive-listener-is-noop-test
  (testing "messages arriving before setReceiveListener are silently dropped, not NPE"
    (let [[_transport ws-listener] (collab.transport/create-ring-transport "c" "x")]
      (is (nil? ((:on-message ws-listener) :sock-stub (byte-array [1])))))))

(deftest ^:parallel is-open-lifecycle-test
  (let [[^Transport transport ws-listener] (collab.transport/create-ring-transport "c" "x")
        [sock _]                           (recording-socket)]
    (testing "false before :on-open captures a socket"
      (is (false? (.isOpen transport))))
    (testing "true after :on-open"
      ((:on-open ws-listener) sock)
      (is (true? (.isOpen transport))))
    (testing "false after :on-close"
      ((:on-close ws-listener) sock 1000 "bye")
      (is (false? (.isOpen transport))))))

(deftest ^:parallel on-error-flips-closed-test
  (let [[^Transport transport ws-listener] (collab.transport/create-ring-transport "c" "x")
        [sock _]                           (recording-socket)]
    ((:on-open ws-listener) sock)
    (is (true? (.isOpen transport)))
    ((:on-error ws-listener) sock (ex-info "boom" {}))
    (is (false? (.isOpen transport)))))
