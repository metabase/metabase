(ns metabase.documents.collab.transport
  "Bridge between a Ring WebSocket connection and a yhocuspocus `Transport`.

   `create-ring-transport` returns `[transport ws-listener]`. Hand `ws-listener`
   to Ring (via `{::ring.ws/listener ws-listener}`); pass `transport` to
   `YHocuspocus.handleConnection` (Phase 3 wiring)."
  (:require
   [metabase.util.log :as log]
   [ring.websocket :as ring.ws])
  (:import
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent CompletableFuture)
   (java.util.concurrent.atomic AtomicBoolean AtomicReference)
   (net.carcdr.yhocuspocus.transport ReceiveListener Transport)))

(set! *warn-on-reflection* true)

(def ^:private unknown-remote-address
  "Fallback value for [[Transport/getRemoteAddress]] when the Ring request
   did not carry a `:remote-addr` (e.g. in certain test harnesses)."
  "unknown")

(defn- ->bytes
  "Normalize an inbound WebSocket message body to a `byte[]`."
  ^bytes [msg]
  (cond
    (bytes? msg)               msg
    (instance? ByteBuffer msg) (let [^ByteBuffer bb msg
                                     arr            (byte-array (.remaining bb))]
                                 (.get bb arr)
                                 arr)
    (string? msg)              (.getBytes ^String msg StandardCharsets/UTF_8)
    :else                      (throw (IllegalArgumentException.
                                       (str "Unsupported WebSocket message type: " (class msg))))))

(defn- build-transport
  "Build the `Transport` half of [[create-ring-transport]]. The three
   `Atomic*` refs are the shared state with the Ring listener half:
   `socket-ref` holds the Ring socket once `:on-open` fires,
   `listener-ref` holds the yhocuspocus `ReceiveListener`, and `closed?`
   guards against double-close."
  ^Transport [^String connection-id
              ^String remote-address
              ^AtomicReference socket-ref
              ^AtomicReference listener-ref
              ^AtomicBoolean closed?]
  (reify Transport
    (send [_ bytes]
      (CompletableFuture/runAsync
       ^Runnable (fn []
                   (if-let [sock (.get socket-ref)]
                     (ring.ws/send sock (ByteBuffer/wrap bytes))
                     (throw (IllegalStateException.
                             "Transport has no socket (not opened yet or already closed)"))))))
    (setReceiveListener [_ listener]
      (.set listener-ref listener))
    (getConnectionId [_]
      connection-id)
    (close [_ code reason]
      ;; CAS guards against double-close from YHocuspocus. `:on-close`
      ;; separately uses `.set closed? true` (not CAS) so that a client-
      ;; initiated close observed by Ring marks the transport closed even
      ;; if `close(int,String)` was never called on this side.
      (when (.compareAndSet closed? false true)
        (when-let [sock (.get socket-ref)]
          (ring.ws/close sock code reason))))
    (isOpen [_]
      (and (not (.get closed?)) (some? (.get socket-ref))))
    (getRemoteAddress [_]
      (or remote-address unknown-remote-address))))

(defn- build-ws-listener
  "Build the Ring WebSocket listener half of [[create-ring-transport]]. It
   shares the same refs as the Transport and forwards inbound messages to
   the registered `ReceiveListener`."
  [^String connection-id
   ^AtomicReference socket-ref
   ^AtomicReference listener-ref
   ^AtomicBoolean closed?]
  {:on-open    (fn [sock]
                 (.set socket-ref sock)
                 (log/debugf "collab transport opened: %s" connection-id))
   :on-message (fn [_sock msg]
                 (when-let [^ReceiveListener l (.get listener-ref)]
                   (.onMessage l (->bytes msg))))
   :on-close   (fn [_sock _code _reason]
                 (.set closed? true)
                 (.set socket-ref nil)
                 (log/debugf "collab transport closed: %s" connection-id))
   :on-error   (fn [_sock ^Throwable t]
                 (.set closed? true)
                 (log/warnf t "collab transport error: %s" connection-id))})

(defn create-ring-transport
  "Construct a `[transport ws-listener]` pair.

   `transport` is a `net.carcdr.yhocuspocus.transport.Transport` whose `send`
   defers to the captured Ring socket. `ws-listener` is a Ring WebSocket
   listener map (`:on-open`, `:on-message`, `:on-close`, `:on-error`)
   that captures the socket on open and routes inbound messages to the
   transport's registered `ReceiveListener`."
  [^String connection-id ^String remote-address]
  (let [socket-ref   (AtomicReference.)
        listener-ref (AtomicReference.)
        closed?      (AtomicBoolean. false)
        transport    (build-transport connection-id remote-address
                                      socket-ref listener-ref closed?)
        ws-listener  (build-ws-listener connection-id
                                        socket-ref listener-ref closed?)]
    [transport ws-listener]))
