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
        transport
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
            (when (.compareAndSet closed? false true)
              (when-let [sock (.get socket-ref)]
                (ring.ws/close sock code reason))))
          (isOpen [_]
            (and (not (.get closed?)) (some? (.get socket-ref))))
          (getRemoteAddress [_]
            (or remote-address "unknown")))
        ws-listener
        {:on-open    (fn on-open [sock]
                       (.set socket-ref sock)
                       (log/debugf "collab transport opened: %s" connection-id))
         :on-message (fn on-message [_sock msg]
                       (when-let [^ReceiveListener l (.get listener-ref)]
                         (.onMessage l (->bytes msg))))
         :on-close   (fn on-close [_sock _code _reason]
                       (.set closed? true)
                       (.set socket-ref nil)
                       (log/debugf "collab transport closed: %s" connection-id))
         :on-error   (fn on-error [_sock ^Throwable t]
                       (.set closed? true)
                       (log/warnf t "collab transport error: %s" connection-id))}]
    [transport ws-listener]))
