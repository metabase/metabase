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

(deftest fetch-feed-test
  (testing "decodes and validates a bounded successful response"
    (mt/with-dynamic-fn-redefs
      [http/get (fn [_url _options]
                  {:status 200
                   :body   (body-stream
                            "{\"notifications\":[{\"id\":\"hello\",\"schema_version\":1,\"title\":\"Hello\",\"content\":\"World\",\"conditions\":{\"audience\":\"all_users\",\"deployment\":\"any\",\"edition\":\"any\",\"starts_at\":\"2026-01-01T00:00:00Z\",\"ends_at\":\"2027-01-01T00:00:00Z\"}}]}")})]
      (is (= ["hello"]
             (mapv :notification_id (:notifications (fetch/fetch-feed!)))))))
  (testing "does not decode a non-success response"
    (mt/with-dynamic-fn-redefs
      [http/get (fn [_url _options]
                  {:status 503
                   :body   (body-stream "not json")})]
      (is (= :http
             (-> (try
                   (fetch/fetch-feed!)
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
           #"response size"
           (fetch/fetch-feed!))))))

(deftest fetch-feed-error-phases-test
  (doseq [[label response expected-phase]
          [["network" #(throw (Exception. "connection refused")) :network]
           ["decode" (constantly {:status 200
                                  :body   (body-stream "not json")}) :decode]
           ["validation" (constantly {:status 200
                                      :body   (body-stream "{\"notifications\":{}}")}) :validation]]]
    (testing label
      (mt/with-dynamic-fn-redefs [http/get (fn [& _args] (response))]
        (is (= expected-phase
               (-> (try
                     (fetch/fetch-feed!)
                     (catch clojure.lang.ExceptionInfo e e))
                   ex-data
                   :phase)))))))
