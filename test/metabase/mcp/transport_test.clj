(ns metabase.mcp.transport-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.mcp.transport :as mcp.transport]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.server.streaming-response.thread-pool :as thread-pool])
  (:import
   (java.io StringWriter Writer)))

(set! *warn-on-reflection* true)

(defn- signaling-writer!
  "A `Writer` that copies everything written to `sink` and then offers `::request-canceled` on `chan`. Cancelling at
  exactly the moment the stream writes a keepalive removes the timing dependency from the test below: the loop is
  cancelled at the instant it would otherwise start waiting out the keepalive interval."
  ^Writer [^StringWriter sink chan]
  (proxy [Writer] []
    (write
      ([data]
       (cond
         (string? data)  (.write sink ^String data)
         (integer? data) (.write sink (int data))
         :else           (.write sink ^chars data))
       (a/offer! chan ::request-canceled))
      ([data off len]
       (if (string? data)
         (.write sink ^String data (int off) (int len))
         (.write sink ^chars data (int off) (int len)))
       (a/offer! chan ::request-canceled)))
    (flush [])
    (close [])))

(defn- run-keepalive-loop!
  "Run the keepalive loop on a separate thread, returning `:returned` if it finished within 5s and `:timed-out` if
  it is still holding its thread."
  [writer tools-hash-fn canceled-chan interval-ms]
  (deref (future (#'mcp.transport/keepalive-loop! writer tools-hash-fn nil canceled-chan interval-ms)
                 :returned)
         5000
         :timed-out))

(deftest keepalive-loop-releases-its-thread-when-the-client-disconnects-test
  (testing (str "GHY-4331: a stream cancelled mid-interval releases its thread promptly instead of holding it until "
                "the next keepalive tick")
    (let [canceled (a/promise-chan)
          sink     (StringWriter.)]
      (is (= :returned (run-keepalive-loop! (signaling-writer! sink canceled) (constantly "hash") canceled 30000)))
      (testing "the keepalive written before the cancellation still reached the client"
        (is (= ": keepalive\n\n" (str sink)))))))

(deftest keepalive-loop-emits-tools-list-changed-on-hash-change-test
  (testing "a change in the visible tool set between ticks emits notifications/tools/list_changed exactly once"
    (let [canceled (a/promise-chan)
          sink     (StringWriter.)
          calls    (atom 0)
          hash-fn  (fn [_scopes]
                     (let [n (swap! calls inc)]
                       ;; cancel on the third read so the loop terminates after a known number of ticks
                       (when (>= n 3)
                         (a/offer! canceled ::request-canceled))
                       (if (= n 1) "hash-1" "hash-2")))]
      (is (= :returned (run-keepalive-loop! sink hash-fn canceled 1)))
      (let [output (str sink)]
        (is (= 3 (count (re-seq #": keepalive" output))))
        (is (= 1 (count (re-seq #"notifications/tools/list_changed" output))))))))

(deftest keepalive-stream-does-not-run-on-the-shared-streaming-pool-test
  (testing (str "GHY-4331: the GET keepalive blocks for the life of the client's connection, so it must not be "
                "submitted to the fixed streaming-response pool that also serves query downloads")
    (let [captured  (atom nil)
          real-fn   @#'streaming-response/-streaming-response
          responded (promise)]
      (with-redefs-fn {#'mcp.transport/require-valid-session    (fn [_user-id _session-id] {:session-id "session"})
                       #'streaming-response/-streaming-response (fn [f options]
                                                                  (reset! captured options)
                                                                  (real-fn f options))}
        (fn []
          (#'mcp.transport/handle-get (constantly "hash") 1 {:headers {"mcp-session-id" "session"}}
                                      #(deliver responded %) (fn [e] (throw e)))))
      (is (= 200 (:status (deref responded 5000 nil))))
      (let [executor (:executor @captured)]
        (is (some? executor)
            "the keepalive stream must name an executor rather than defaulting to the shared pool")
        (is (not= executor (thread-pool/thread-pool)))))))
