(ns metabase.app-db.cluster-lock-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.app-db.cluster-lock :as sut]
   [metabase.app-db.core :as mdb]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest with-cluster-locking-test
  (testing "works when used non-concurrently"
    (is (nil? (sut/with-cluster-lock ::test-lock (Thread/sleep 1)))))
  (when (not= (mdb/db-type) :h2)
    (testing "cluster locking test error if lock is not released"
      (let [fin-chan (a/chan)
            ready-chan (a/chan)]
        (future (sut/with-cluster-lock ::test-lock (a/>!! ready-chan :ready) (a/<!! fin-chan)))
        (a/<!! ready-chan) ;; make sure the future above starts
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Failed to run statement with cluster lock"
             (sut/with-cluster-lock ::test-lock (Thread/sleep 1))))
        (a/>!! fin-chan :done)))
    (testing "cluster no retry on other error"
      (let [fin-chan (a/chan)]
        (future (sut/with-cluster-lock ::test-lock (a/<!! fin-chan)))
        (future (Thread/sleep 500) (a/>!! fin-chan :done))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Bad Error"
             (sut/with-cluster-lock ::test-lock (throw (ex-info "Bad Error" {})))))))
    (testing "cluster locking test no error if lock is released"
      (let [fin-chan (a/chan)]
        (future (sut/with-cluster-lock ::test-lock (a/<!! fin-chan)))
        (future (Thread/sleep 500) (a/>!! fin-chan :done))
        (is (nil? (sut/with-cluster-lock ::test-lock (Thread/sleep 1))))))))

(deftest concurrent-lock-creation-race-test
  (testing "Two threads racing to create the same lock for the first time"
    ;; h2 is not race-proof, but it is also not cross-process
    (when (not= (mdb/db-type) :h2)
      ;; Ensure that we are creating the lock for the first time
      (t2/delete! :metabase_cluster_lock :lock_name (u/qualified-name ::race-test-lock))

      (let [results   (atom [])
            result!   (partial swap! results conj)
            thread!   (fn [id ^CountDownLatch start-latch ^CountDownLatch end-latch thunk]
                        (future
                          (try
                            (sut/with-cluster-lock ::race-test-lock
                              (try
                                (.countDown start-latch)
                                (thunk)
                                (result! [id :done])
                                (catch Exception e
                                  (result! [id :failed (:reason (ex-data e) :unknown)]))))
                            (catch Exception e
                              (result! [:a :locking-failed e]))
                            (finally
                              (.countDown end-latch)))))
            a-started (CountDownLatch. 1)
            b-started (CountDownLatch. 1)
            a-ended   (CountDownLatch. 1)
            b-ended   (CountDownLatch. 1)]

        (thread! :a a-started a-ended
                 #(when-not (.await b-started 1 TimeUnit/SECONDS)
                    (throw (ex-info "B did not start while A was still running" {:reason :timeout}))))
        (.await a-started)
        (thread! :b b-started b-ended
                 #(.await a-ended))
        (.await b-ended)
        (is (= [[:a :failed :timeout]
                [:b :done]]
               @results))))))
