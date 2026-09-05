(ns metabase.driver.quack.wire
  "Encode requests and decode responses for the Quack message types the
  Metabase driver needs (connect / prepare / fetch / disconnect / error).
  Body decoding of result-bearing messages is delegated to types."
  (:require
   [metabase.driver.quack.codec :as c]
   [metabase.driver.quack.types :as types])
  (:import [java.nio ByteBuffer]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Request encoding
;; ---------------------------------------------------------------------------
;; Each builder takes a `client-query-id` (monotonic idx_t) threaded into
;; MessageHeader field 3. The Quack reference doc says this id "correlates
;; client / server logs" — join on (quack_connection_id, client_query_id).
;; Caller (quack.client) assigns one per request via an atom counter.
(defn connection-request
  "Encode a CONNECTION_REQUEST (type 1) — the first message; carries the auth
  token. The server returns a connection id used by all later messages."
  ^bytes [{:keys [token client-version platform]
           :or {client-version "metabase-quack-driver" platform "metabase"}}
          client-query-id]
  (c/message (c/header c/type-connection-request nil client-query-id)
             (c/object
              (c/field 1 (c/string token))
              (c/field 2 (c/string client-version))
              (c/field 3 (c/string platform))
              (c/field 4 (c/varuint 1))      ; min supported quack version
              (c/field 5 (c/varuint 1)))))   ; max supported quack version

(defn prepare-request
  "Encode a PREPARE_REQUEST (type 3) — run `sql`; the response carries the first
  batch of rows + a result-uuid for subsequent FETCHes."
  ^bytes [connection-id sql client-query-id]
  (c/message (c/header c/type-prepare-request connection-id client-query-id)
             (c/object (c/field 1 (c/string sql)))))

(defn fetch-request
  "Encode a FETCH_REQUEST (type 7) — pull the next batch for the result identified
  by `result-uuid` (a [upper lower] long pair from the prepare response).
  Shares the PREPARE's `client-query-id` so the whole result stream correlates."
  ^bytes [connection-id result-uuid client-query-id]
  (let [[upper lower] result-uuid]
    (c/message (c/header c/type-fetch-request connection-id client-query-id)
               (c/object (c/field 1 (c/hugeint upper lower))))))

(defn disconnect-request
  "Encode a DISCONNECT_MESSAGE (type 11) — tear down the connection. Best-effort."
  ^bytes [connection-id client-query-id]
  (c/message (c/header c/type-disconnect-message connection-id client-query-id)
             (c/object)))

;; ---------------------------------------------------------------------------
;; Response decoding
;; ---------------------------------------------------------------------------
(def type->kw
  "Map Quack message type identifiers to their keywords."
  {c/type-connection-request  :connection-request
   c/type-connection-response :connection-response
   c/type-prepare-request     :prepare-request
   c/type-prepare-response    :prepare-response
   c/type-fetch-request       :fetch-request
   c/type-fetch-response      :fetch-response
   c/type-success-response    :success-response
   c/type-disconnect-message  :disconnect-message
   c/type-error-response      :error-response})

(defn- read-header
  "Decode a Quack message header from the buffer."
  [^ByteBuffer b]
  (-> (c/read-object
       (fn [fid acc bb]
         (condp = fid
           1 (assoc acc :type (c/read-uleb128 bb))
           2 (assoc acc :connection-id (c/read-utf8 bb))
           3 (let [v (c/read-uleb128 bb)] (assoc acc :client-query-id (when (not= v c/invalid-index) v)))
           (throw (ex-info "unknown header field" {:fid fid}))))
       b)
      (update :type #(get type->kw % %))))

(defn decode-response
  "Parse a response buffer into {:header {...} :body {...}}.
  prepare/fetch bodies include :result-types, :result-names, :chunks, etc.
  error bodies include :message."
  [^bytes buf]
  (let [b      (c/reader buf)
        header (read-header b)
        body   (case (:type header)
                 :connection-response
                 (c/read-object (fn [fid acc bb]
                                  (condp = fid
                                    1 (assoc acc :server-version (c/read-utf8 bb))
                                    2 (assoc acc :server-platform (c/read-utf8 bb))
                                    3 (assoc acc :quack-version (c/read-uleb128 bb))
                                    (throw (ex-info "unknown conn-response field" {:fid fid}))))
                                b {})
                 :prepare-response (types/read-prepare-response b)
                 :fetch-response   (types/read-fetch-response b)
                 :success-response (do (c/read-object (fn [_ a _] a) b) {})
                 :error-response   (c/read-object (fn [fid acc bb]
                                                    (if (= fid 1)
                                                      (assoc acc :message (c/read-utf8 bb))
                                                      (throw (ex-info "unknown error field" {:fid fid}))))
                                                  b {})
                 nil)]
    {:header header :body body}))

(defn error?
  "True if a decoded response is an ERROR_RESPONSE (the server rejected the request)."
  [resp] (= :error-response  (-> resp :header :type)))

(defn success?
  "True if a decoded response is a SUCCESS_RESPONSE (e.g. a disconnect ack)."
  [resp] (= :success-response (-> resp :header :type)))
