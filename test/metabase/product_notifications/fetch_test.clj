(ns metabase.product-notifications.fetch-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.product-notifications.fetch :as fetch]
   [metabase.test :as mt])
  (:import
   (java.io ByteArrayInputStream)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- body-stream
  [body]
  (ByteArrayInputStream. (.getBytes ^String body StandardCharsets/UTF_8)))

(deftest ^:parallel fetch-feed-test
  (testing "decodes and validates a bounded successful response"
    (mt/with-dynamic-fn-redefs
      [http/get (fn [_url _options]
                  {:status 200
                   :body   (body-stream
                            "{\"notifications\":[{\"id\":\"hello\",\"schema_version\":1,\"title\":\"Hello\",\"content\":\"World\",\"conditions\":{\"audience\":\"all_users\",\"deployment\":\"any\",\"edition\":\"any\",\"starts_at\":\"2026-01-01T00:00:00Z\",\"ends_at\":\"2027-01-01T00:00:00Z\"}}]}")})]
      (is (= ["hello"]
             (mapv :notification_id (:notifications (fetch/fetch-feed)))))))
  (testing "does not decode a non-success response"
    (mt/with-dynamic-fn-redefs
      [http/get (fn [_url _options]
                  {:status 503
                   :body   (body-stream "not json")})]
      (is (= :http
             (-> (try
                   (fetch/fetch-feed)
                   (catch clojure.lang.ExceptionInfo e e))
                 ex-data
                 :phase)))))
  (testing "refuses an unbounded response body"
    (mt/with-dynamic-fn-redefs
      [http/get (fn [_url _options]
                  {:status 200
                   :body   (ByteArrayInputStream. (byte-array (inc (* 1024 1024))))})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"decode or validate"
           (fetch/fetch-feed))))))
