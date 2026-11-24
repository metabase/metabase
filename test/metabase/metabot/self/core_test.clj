(ns metabase.metabot.self.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.self.core :as self.core])
  (:import
   (java.io ByteArrayInputStream)))

(defn- parse-sse [s]
  (into [] (self.core/sse-reducible (ByteArrayInputStream. (.getBytes ^String s "UTF-8")))))

(deftest sse-reducible-optional-space-test
  (testing "parses data: lines with and without a single space after the colon per WHATWG SSE spec"
    (is (= [{:type "ping"}
            {:type "message_start"}
            {:type "content_block_delta" :index 0}]
           (parse-sse
            (str "event:ping\n"
                 "data:{\"type\":\"ping\"}\n\n"
                 "event: message_start\n"
                 "data: {\"type\":\"message_start\"}\n\n"
                 "event:content_block_delta\n"
                 "data:{\"type\":\"content_block_delta\",\"index\":0}\n\n"
                 "data:[DONE]\n"
                 "data:{\"ignored\":\"after-done\"}\n")))))

  (testing "stops on 'data: [DONE]' with space as well"
    (is (= [{:ok true}]
           (parse-sse "data: {\"ok\":true}\n\ndata: [DONE]\ndata: {\"ignored\":true}\n")))))
