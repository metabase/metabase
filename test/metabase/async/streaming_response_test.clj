(ns metabase.async.streaming-response-test
  (:require [clj-http.client :as http]
            [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase
             [config :as config]
             [driver :as driver]
             [http-client :as test-client]
             [models :refer [Database]]
             [test :as mt]
             [util :as u]]
            [metabase.async.streaming-response :as streaming-response]
            [metabase.async.streaming-response.thread-pool :as thread-pool]
            [metabase.query-processor.context :as context])
  (:import [java.util.concurrent Executors ThreadPoolExecutor]
           org.apache.commons.lang3.concurrent.BasicThreadFactory$Builder))

(driver/register! ::test-driver)

(def ^:private canceled? (atom false))

(def ^:private thread-pool-size 5)

(defn- create-thread-pool! []
  (Executors/newFixedThreadPool thread-pool-size
                                (.build
                                 (doto (BasicThreadFactory$Builder.)
                                   (.namingPattern "streaming-response-test-thread-pool-%d")
                                   ;; Daemon threads do not block shutdown of the JVM
                                   (.daemon true)))))

(defonce ^:private thread-pools (atom {}))

(defn- set-db-tread-pool! [db-id new-pool]
  (let [[old] (swap-vals! thread-pools assoc db-id new-pool)]
    (when-let [old-pool (get old db-id)]
      (.shutdownNow ^ThreadPoolExecutor old-pool))))

(defn- do-with-db-thread-pool [thunk]
  (let [db-id (mt/id)]
    (set-db-tread-pool! db-id (create-thread-pool!))
    (try
      (thunk)
      (finally
        (set-db-tread-pool! db-id nil)))))

(defmacro ^:private with-db-thread-pool {:style/indent 0} [& body]
  `(do-with-db-thread-pool (fn [] ~@body)))

(defmacro ^:private with-test-driver-db {:style/indent 0} [& body]
  `(mt/with-temp Database [db# {:engine ::test-driver}]
     (mt/with-db db#
       (with-db-thread-pool
         ~@body))))

(defmethod driver/execute-reducible-query ::test-driver
  [_ {{{:keys [sleep]} :query} :native, database-id :database} context respond]
  {:pre [(integer? sleep) (integer? database-id)]}
  (let [^Runnable task           (bound-fn []
                                   (Thread/sleep sleep)
                                   (respond {:cols [{:name "Sleep", :base_type :type/Integer}]} [[sleep]]))
        ^ThreadPoolExecutor pool (or (get @thread-pools (u/get-id database-id))
                                     (throw (ex-info "No thread pool for DB" {:database-id database-id})))
        futur                    (.submit pool task)]
    (a/go
      (when (a/<! (context/canceled-chan context))
        (reset! canceled? true)
        (future-cancel futur)))))

(defmethod driver/connection-properties ::test-driver
  [& _]
  [])

(deftest basic-test
  (testing "Make sure our ::test-driver is working as expected"
    (with-test-driver-db
      (is (= [[10]]
             (mt/rows
               ((mt/user->client :lucky)
                :post 202 "dataset"
                {:database (mt/id)
                 :type     "native"
                 :native   {:query {:sleep 10}}})))))))

(deftest truly-async-test
  (testing "StreamingResponses should truly be asynchronous, and not block Jetty threads while waiting for results"
    (with-test-driver-db
      (let [max-threads        (or (config/config-int :mb-jetty-maxthreads) 50)
            num-requests       (+ max-threads 20)
            remaining          (atom num-requests)
            initial-task-count (.getTaskCount (thread-pool/thread-pool))
            futures            (atom nil)]
        (try
          (testing (format "%d simultaneous queries" num-requests)
            (dorun (pmap
                    (fn [_]
                      (swap! futures conj (http/post (test-client/build-url "dataset" nil)
                                                     (assoc (test-client/build-request-map (mt/user->credentials :lucky)
                                                                                           {:database (mt/id)
                                                                                            :type     "native"
                                                                                            :native   {:query {:sleep 500}}})
                                                            :async true)
                                                     identity
                                                     (fn [e] (throw e)))))
                    (range num-requests)))
            (Thread/sleep 100)
            (let [start-time-ms (System/currentTimeMillis)]
              (println "start-time-ms:" start-time-ms) ; NOCOMMIT
              (is (= {:status "ok"}
                     ((mt/user->client :rasta) :get 200 "health")))
              (testing "Health endpoint should complete before the first round of queries completes"
                (is (> @remaining (inc (- num-requests thread-pool-size)))))
              (testing "Health endpoint should complete in under 100ms regardless of how many queries are running"
                (let [elapsed-ms (- (System/currentTimeMillis) start-time-ms)]
                  (is (< elapsed-ms 100))))))
          (finally
            (doseq [futur @futures]
              (future-cancel futur))))))))

(deftest newlines-test
  (testing "Keepalive newlines should be written while waiting for a response."
    (with-redefs [streaming-response/keepalive-interval-ms 50]
      (with-test-driver-db
        (is (re= #"(?s)^\n{3,}\{\"data\":.*$"
                 (:body (http/post (test-client/build-url "dataset" nil)
                                   (test-client/build-request-map (mt/user->credentials :lucky)
                                                                  {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query {:sleep 300}}})))))))))

(deftest cancelation-test
  (testing "Make sure canceling a HTTP request ultimately causes the query to be canceled"
    (with-redefs [streaming-response/keepalive-interval-ms 50]
      (with-test-driver-db
        (reset! canceled? false)
        (let [futur (http/post (test-client/build-url "dataset" nil)
                               (assoc (test-client/build-request-map (mt/user->credentials :lucky)
                                                                     {:database (mt/id)
                                                                      :type     "native"
                                                                      :native   {:query {:sleep 5000}}})
                                      :async true)
                               identity
                               (fn [e] (throw e)))]
          (Thread/sleep 100)
          (future-cancel futur)
          (Thread/sleep 100)
          (is (= true
                 @canceled?)))))))
