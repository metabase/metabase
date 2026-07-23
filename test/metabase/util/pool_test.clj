(ns metabase.util.pool-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.pool :as u.pool])
  (:import
   (io.aleph.dirigiste Pool)
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(defn- mock-worker
  "Create a mock 'worker' object. The pool doesn't care what type the objects are - it just stores and
  returns them."
  [id]
  {:worker-id  id
   :created-at (System/currentTimeMillis)})

(defn- counting-generator
  "Returns a generator function that counts how many workers it has created."
  [counter-atom]
  (fn []
    (mock-worker (swap! counter-atom inc))))

(defn- failing-generator
  "Returns a generator that fails after creating n workers."
  [counter-atom fail-after]
  (fn []
    (let [id (swap! counter-atom inc)]
      (when (> id fail-after)
        (throw (ex-info "Generator limit reached" {:count id :limit fail-after})))
      (mock-worker id))))

;;; ------------------------------------------------- Test Helpers ---------------------------------------------------

(defn- test-pool
  "Create a pool for testing with sensible defaults.
  Returns [pool created-count-atom destroyed-atom]."
  ([]
   (test-pool {}))
  ([config]
   (let [created   (atom 0)
         destroyed (atom [])
         pool      (u.pool/create-pool (counting-generator created)
                                       (fn [worker] (swap! destroyed conj worker))
                                       (merge {:max-size 2, :idle-minutes 1} config))]
     [pool created destroyed])))

(defn- with-worker
  "Execute f with a worker from pool, releasing it afterwards."
  [^Pool pool f]
  (let [worker (.acquire pool :test)]
    (try
      (f worker)
      (finally
        (.release pool :test worker)))))

(defn- run-concurrent
  "Run n threads concurrently, each executing f with a worker from pool.
  Returns vector of results."
  [pool n f]
  (let [latch   (CountDownLatch. n)
        results (atom [])
        futures (doall
                 (for [i (range n)]
                   (future
                     (.countDown latch)
                     (.await latch)
                     (let [result (with-worker pool (fn [worker] (f i worker)))]
                       (swap! results conj result)))))]
    (doseq [fut futures] @fut)
    @results))

;;; ------------------------------------------------ Pool Size Tests -------------------------------------------------

(deftest pool-respects-maximum-size-test
  (testing "Pool never creates more than max workers even under concurrent load"
    (let [[pool created] (test-pool {:max-size 2})
          num-threads 20
          results (run-concurrent pool num-threads
                                  (fn [_i worker]
                                    (Thread/sleep (long (+ 10 (rand-int 50))))
                                    worker))]
      (is (<= @created 2)
          (str "Pool created " @created " workers but max is 2"))
      (is (= num-threads (count results))
          "All threads should have received a worker"))))

(deftest pool-reuses-idle-workers-test
  (testing "Sequential uses reuse the same worker instead of creating new ones"
    (let [[pool created] (test-pool)]
      (with-worker pool (fn [_worker] (is (= 1 @created) "First use creates one worker")))
      (with-worker pool (fn [worker]
                          (is (= 1 @created) "Second use reuses the same worker")
                          (is (= 1 (:worker-id worker))))))))

;;; ------------------------------------------------ Disposal Tests --------------------------------------------------

(deftest pool-dispose-destroys-and-replaces-workers-test
  (testing "Disposing a worker calls destroy and the next acquire generates a fresh one"
    (let [[pool created destroyed] (test-pool)
          worker (.acquire ^Pool pool :test)]
      (.dispose ^Pool pool :test worker)
      (is (= [worker] @destroyed) "Disposed worker should be destroyed")
      (with-worker pool (fn [_worker] (is (= 2 @created) "Disposed worker should be replaced"))))))

;;; --------------------------------------------- Generator Failure Tests --------------------------------------------

(deftest pool-handles-generator-failures-test
  (testing "Pool gracefully handles when generator fails"
    (let [counter (atom 0)
          pool (u.pool/create-pool (failing-generator counter 1) (fn [_worker]) {:max-size 2, :idle-minutes 1})]
      (is (some? (with-worker pool identity)) "First worker creation succeeds")
      ;; Dispose to force new creation
      (let [worker (.acquire ^Pool pool :test)]
        (.dispose ^Pool pool :test worker))
      (is (thrown? Exception (with-worker pool identity)) "Generator failure should propagate"))))

;;; ------------------------------------------- Concurrent Access Tests ----------------------------------------------

(deftest pool-handles-concurrent-access-safely-test
  (testing "Pool handles concurrent access without race conditions"
    (let [[pool created] (test-pool {:max-size 2})
          num-threads 50
          results (run-concurrent pool num-threads
                                  (fn [i _worker]
                                    (Thread/sleep (long (rand-int 20)))
                                    i))]
      (is (= num-threads (count results)) "All threads should complete successfully")
      (is (<= @created 2) (str "Created " @created " workers, expected <= 2")))))

;;; -------------------------------------------- Pool Behavior Tests -------------------------------------------------

(deftest pool-stores-and-returns-objects-test
  (testing "Pool correctly stores and returns arbitrary objects"
    (let [[pool created] (test-pool)
          result1 (with-worker pool identity)
          result2 (with-worker pool identity)]
      (is (map? result1))
      (is (= 1 (:worker-id result1)))
      (is (= 1 @created))
      (is (map? result2))
      (is (= 1 (:worker-id result2)))  ;; Same worker ID
      (is (= 1 @created)))))
