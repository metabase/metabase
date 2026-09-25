(ns metabase.mcp-client.transport-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp-client.transport :as transport])
  (:import
   (java.io ByteArrayInputStream InputStream)))

(set! *warn-on-reflection* true)

(defn- stream ^InputStream [^String s]
  (ByteArrayInputStream. (.getBytes s "UTF-8")))

(defn- read-all
  "Every message the reader hands to the callback, plus the message it stopped on (nil when it hit EOF)."
  [s done?]
  (let [seen (atom [])
        result (transport/read-sse-messages (stream s)
                                            (fn [m]
                                              (swap! seen conj m)
                                              (when (done? m) ::transport/done)))]
    {:seen @seen :result result}))

(deftest ^:parallel read-sse-messages-test
  (testing "comments, event/id/retry fields and CRLF line endings are skipped; data lines are dispatched"
    (is (= {:seen   [{:jsonrpc "2.0" :method "notifications/progress"}
                     {:jsonrpc "2.0" :id 7 :result {:ok true}}]
            :result {:jsonrpc "2.0" :id 7 :result {:ok true}}}
           (read-all (str "event: message\r\n"
                          "id: 1\r\n"
                          "retry: 100\r\n"
                          ": keepalive\r\n"
                          "data: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\"}\r\n"
                          "\r\n"
                          "event: message\r\n"
                          "data: {\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{\"ok\":true}}\r\n"
                          "\r\n")
                     #(= 7 (:id %))))))
  (testing "multi-line data is joined with newlines and a trailing event without a blank line is still dispatched"
    (is (= {:seen [{:a 1 :b 2}] :result {:a 1 :b 2}}
           (read-all "data: {\"a\": 1,\ndata: \"b\": 2}" (constantly true)))))
  (testing "an event without data is not dispatched"
    (is (= {:seen [] :result nil}
           (read-all "event: ping\n\n: comment only\n\n" (constantly true)))))
  (testing "EOF without the awaited message returns nil"
    (is (= {:seen [{:x 1}] :result nil}
           (read-all "data: {\"x\":1}\n\n" (constantly false))))))

(deftest ^:parallel read-sse-messages-stops-early-test
  (testing "reading stops at the awaited message without draining the rest of the stream"
    (let [body    (str "data: {\"id\":1,\"result\":{}}\n\n"
                       (str/join (repeat 10000 "data: {\"never\":\"read\"}\n\n")))
          in      (stream body)
          result  (transport/read-sse-messages in (fn [m] (when (= 1 (:id m)) ::transport/done)))]
      (is (= {:id 1 :result {}} result))
      (is (pos? (.available in)) "the rest of the stream was left unread"))))
