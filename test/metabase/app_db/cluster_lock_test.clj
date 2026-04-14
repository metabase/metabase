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
             clojure.lang.ExceptionInfo #"Failed to obtain cluster lock"
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

(defn- run-with-lock
  "Run `thunk` with the given lock opts on a future. Returns a map of
  `{:entered, :release, :done}` latches/promise the caller can use to
  coordinate with the running future."
  [lock-opts]
  (let [entered (CountDownLatch. 1)
        release (CountDownLatch. 1)
        done    (promise)]
    (future
      (try
        (sut/with-cluster-lock lock-opts
          (.countDown entered)
          (.await release))
        (deliver done :ok)
        (catch Throwable e
          (deliver done [:err (ex-message e)]))))
    {:entered entered :release release :done done}))

(defn- acquirable-within?
  "Returns true if `lock-opts` can be acquired within `timeout-ms` milliseconds."
  [lock-opts timeout-ms]
  (let [entered  (promise)
        acquired (future
                   (try
                     (sut/with-cluster-lock lock-opts
                       (deliver entered :yes))
                     (catch Throwable _
                       (deliver entered :err))))
        result   (deref entered timeout-ms :timeout)]
    (future-cancel acquired)
    (= result :yes)))

(deftest share-exclusive-mode-test
  ;; h2 uses in-process ReentrantReadWriteLock; everything else uses real row locks.
  ;; Warm up the row first so we're not racing on the initial INSERT.
  (sut/with-cluster-lock ::rw-test :warm)
  (testing "two :share holders run concurrently"
    (let [a (run-with-lock {:lock ::rw-test :mode :share})
          b (run-with-lock {:lock ::rw-test :mode :share})]
      (is (.await ^CountDownLatch (:entered a) 3 TimeUnit/SECONDS))
      (is (.await ^CountDownLatch (:entered b) 3 TimeUnit/SECONDS))
      (.countDown ^CountDownLatch (:release a))
      (.countDown ^CountDownLatch (:release b))
      (is (= :ok (deref (:done a) 3000 :timeout)))
      (is (= :ok (deref (:done b) 3000 :timeout)))))
  (testing ":share blocks :exclusive while held"
    (let [a (run-with-lock {:lock ::rw-test :mode :share})]
      (is (.await ^CountDownLatch (:entered a) 3 TimeUnit/SECONDS))
      (is (false? (acquirable-within? {:lock ::rw-test :mode :exclusive} 500)))
      (.countDown ^CountDownLatch (:release a))
      (is (= :ok (deref (:done a) 3000 :timeout)))
      ;; After release, exclusive should be able to enter.
      (is (true? (acquirable-within? {:lock ::rw-test :mode :exclusive} 3000)))))
  (testing ":exclusive blocks :share while held"
    (let [a (run-with-lock {:lock ::rw-test :mode :exclusive})]
      (is (.await ^CountDownLatch (:entered a) 3 TimeUnit/SECONDS))
      (is (false? (acquirable-within? {:lock ::rw-test :mode :share} 500)))
      (.countDown ^CountDownLatch (:release a))
      (is (= :ok (deref (:done a) 3000 :timeout)))
      (is (true? (acquirable-within? {:lock ::rw-test :mode :share} 3000))))))

(deftest intent-lock-multi-test
  ;; Warm both leaves so we're not racing on initial INSERTs.
  (sut/with-cluster-lock {:locks [{:lock ::intent-root :mode :share}
                                  {:lock ::intent-leaf-1 :mode :exclusive}]}
    :warm-1)
  (sut/with-cluster-lock {:locks [{:lock ::intent-root :mode :share}
                                  {:lock ::intent-leaf-2 :mode :exclusive}]}
    :warm-2)
  (testing "shared-on-root + exclusive-on-leaf: different leaves run in parallel"
    (let [a (run-with-lock {:locks [{:lock ::intent-root :mode :share}
                                    {:lock ::intent-leaf-1 :mode :exclusive}]})
          b (run-with-lock {:locks [{:lock ::intent-root :mode :share}
                                    {:lock ::intent-leaf-2 :mode :exclusive}]})]
      (is (.await ^CountDownLatch (:entered a) 3 TimeUnit/SECONDS))
      (is (.await ^CountDownLatch (:entered b) 3 TimeUnit/SECONDS))
      (.countDown ^CountDownLatch (:release a))
      (.countDown ^CountDownLatch (:release b))
      (is (= :ok (deref (:done a) 3000 :timeout)))
      (is (= :ok (deref (:done b) 3000 :timeout)))))
  (testing "shared-on-root + exclusive-on-leaf: same leaf serializes"
    (let [a (run-with-lock {:locks [{:lock ::intent-root :mode :share}
                                    {:lock ::intent-leaf-1 :mode :exclusive}]})]
      (is (.await ^CountDownLatch (:entered a) 3 TimeUnit/SECONDS))
      (is (false? (acquirable-within? {:locks [{:lock ::intent-root :mode :share}
                                               {:lock ::intent-leaf-1 :mode :exclusive}]}
                                      500)))
      (.countDown ^CountDownLatch (:release a))
      (is (= :ok (deref (:done a) 3000 :timeout)))))
  (testing "exclusive-on-root (global) blocks any shared-on-root db-scoped writer"
    (let [a (run-with-lock {:lock ::intent-root :mode :exclusive})]
      (is (.await ^CountDownLatch (:entered a) 3 TimeUnit/SECONDS))
      (is (false? (acquirable-within? {:locks [{:lock ::intent-root :mode :share}
                                               {:lock ::intent-leaf-1 :mode :exclusive}]}
                                      500)))
      (.countDown ^CountDownLatch (:release a))
      (is (= :ok (deref (:done a) 3000 :timeout))))))

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
