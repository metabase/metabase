(ns metabase.util.cluster-lock-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.db :as mdb]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.cluster-lock :as sut]))

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
