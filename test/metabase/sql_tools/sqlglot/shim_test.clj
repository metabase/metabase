(ns metabase.sql-tools.sqlglot.shim-test
  (:require
   [clojure.test :refer :all]
   [metabase.sql-tools.sqlglot.shim :as sqlglot.shim])
  (:import
   (io.aleph.dirigiste Pool)
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Test Fixtures --------------------------------------------------

(defn- mock-context
  "Create a mock 'context' object. Since Context is final, we just return a map with metadata.
  The pool doesn't care what type the objects are - it just stores and returns them."
  [id]
  {:context-id id
   :created-at (System/currentTimeMillis)})

(defn- counting-generator
  "Returns a generator function that counts how many contexts it has created."
  [counter-atom]
  (fn []
    (let [id (swap! counter-atom inc)]
      (mock-context id))))

(defn- failing-generator
  "Returns a generator that fails after creating n contexts."
  [counter-atom fail-after]
  (fn []
    (let [id (swap! counter-atom inc)]
      (when (> id fail-after)
        (throw (ex-info "Generator limit reached" {:count id :limit fail-after})))
      (mock-context id))))

;;; ------------------------------------------------- Test Helpers ---------------------------------------------------

(defn- test-pool
  "Create a pool for testing with sensible defaults.
  Returns [pool created-count-atom]."
  ([]
   (test-pool {}))
  ([config]
   (let [counter (atom 0)
         generator (counting-generator counter)
         pool (#'sqlglot.shim/make-python-context-pool generator config)]
     [pool counter])))

(defn- with-pool
  "Execute f with a context from pool. Uses with-open for proper resource management."
  [pool f]
  (with-open [^java.io.Closeable ctx (#'sqlglot.shim/acquire-context pool)]
    (f ctx)))

(defn- run-concurrent
  "Run n threads concurrently, each executing f with a context from pool.
  Returns vector of results."
  [pool n f]
  (let [latch   (CountDownLatch. n)
        results (atom [])
        futures (doall
                 (for [i (range n)]
                   (future
                     (.countDown latch)
                     (.await latch)
                     (let [result (with-pool pool (fn [ctx] (f i ctx)))]
                       (swap! results conj result)))))]
    (doseq [fut futures] @fut)
    @results))

;;; ------------------------------------------------ Pool Size Tests -------------------------------------------------

(deftest pool-respects-maximum-size-test
  (testing "Pool never creates more than max contexts even under concurrent load"
    (let [[pool created-count] (test-pool {:max-size 3})
          num-threads 20
          results (run-concurrent pool num-threads
                                  (fn [_i ctx]
                                    (Thread/sleep (long (+ 10 (rand-int 50))))
                                    ctx))]

      (is (<= @created-count 3)
          (str "Pool created " @created-count " contexts but max is 3"))
      (is (= num-threads (count results))
          "All threads should have received a context"))))

(deftest pool-maintains-minimum-size-test
  (testing "Pool keeps at least 1 context available"
    (let [[pool created-count] (test-pool)]
      (with-pool pool (fn [_ctx] (is (= 1 @created-count) "First use creates one context")))
      (Thread/sleep (long 100))
      (with-pool pool (fn [_ctx] (is (= 1 @created-count) "Second use reuses the same context"))))))

;;; ----------------------------------------------- Context Expiry Tests ---------------------------------------------

(deftest pool-expires-old-contexts-test
  (testing "Pool disposes of contexts that have exceeded their TTL"
    (let [[pool _created-count] (test-pool {:ttl-minutes 10})
          [context expiry-ts :as tuple] (.acquire ^Pool pool :python)]
      (try
        (is (some? context) "Context should be created")
        (is (number? expiry-ts) "Expiry timestamp should be set")
        (is (< (System/nanoTime) expiry-ts) "Expiry should be in the future")

        (let [expiry-in-minutes (/ (- expiry-ts (System/nanoTime)) (* 1000000000 60))]
          (is (< 9 expiry-in-minutes 11) "Expiry should be approximately 10 minutes"))
        (finally
          (.release ^Pool pool :python tuple))))))

(deftest with-pooled-context-handles-expired-contexts-test
  (testing "with-pooled-context properly handles and replaces expired contexts"
    (let [[pool created-count] (test-pool)]
      (with-pool pool (fn [_ctx] (is (= 1 @created-count))))

      ;; Manually expire by disposing
      (let [tuple (.acquire ^Pool pool :python)]
        (.dispose ^Pool pool :python tuple))

      (with-pool pool (fn [_ctx] (is (= 2 @created-count) "Expired context should be replaced"))))))

;;; --------------------------------------------- Generator Failure Tests --------------------------------------------

(deftest pool-handles-generator-failures-test
  (testing "Pool gracefully handles when generator fails"
    (let [counter (atom 0)
          generator (failing-generator counter 1)
          pool (#'sqlglot.shim/make-python-context-pool generator)]

      (is (some? (with-pool pool identity)) "First context creation succeeds")

      ;; Dispose to force new creation
      (let [tuple (.acquire ^Pool pool :python)]
        (.dispose ^Pool pool :python tuple))

      (is (thrown? Exception (with-pool pool identity)) "Generator failure should propagate"))))

;;; ------------------------------------------- Concurrent Access Tests ----------------------------------------------

(deftest pool-handles-concurrent-access-safely-test
  (testing "Pool handles concurrent access without race conditions"
    (let [[pool created-count] (test-pool {:max-size 3})
          num-threads 50
          results (run-concurrent pool num-threads
                                  (fn [i _ctx]
                                    (Thread/sleep (long (rand-int 20)))
                                    i))]

      (is (= num-threads (count results)) "All threads should complete successfully")
      (is (<= @created-count 3) (str "Created " @created-count " contexts, expected <= 3")))))

;;; -------------------------------------------- Pool Behavior Tests -------------------------------------------------

(deftest pool-stores-and-returns-objects-test
  (testing "Pool correctly stores and returns arbitrary objects"
    (let [[pool created-count] (test-pool)
          result1 (with-pool pool :context)
          result2 (with-pool pool :context)]

      (is (map? result1))
      (is (= 1 (:context-id result1)))
      (is (= 1 @created-count))

      (is (map? result2))
      (is (= 1 (:context-id result2)))  ;; Same context ID
      (is (= 1 @created-count)))))

;;; -------------------------------------------- SQL Parsing Tests -------------------------------------------------

(deftest ^:parallel basic-select-test
  (testing "Simple SELECT parses correctly"
    (let [result (sqlglot.shim/p "SELECT id, name FROM users")]
      (is (= ["users"] (:tables_source result)))
      (is (= ["id" "name"] (sort (:columns result)))))))

(deftest ^:parallel cte-test
  (testing "CTE (WITH clause) parsing"
    (let [result (sqlglot.shim/p "WITH active_users AS (SELECT * FROM users WHERE active)
                             SELECT * FROM active_users")]
      ;; tables_source excludes CTE references, returning only real tables
      ;; tables_all includes CTE names as well
      (is (= ["users"] (:tables_source result)))
      (is (= ["active_users" "users"] (sort (:tables_all result)))))))

(deftest ^:parallel join-test
  (testing "JOIN parsing extracts all tables"
    (let [result (sqlglot.shim/p "SELECT u.name, o.total
                             FROM users u
                             JOIN orders o ON u.id = o.user_id")]
      (is (= ["orders" "users"] (sort (:tables_source result)))))))

(deftest ^:parallel dollar-quote-test
  (testing "PostgreSQL dollar-quoted strings (fails in JSqlParser)"
    (let [result (sqlglot.shim/p "SELECT $tag$hello world$tag$")]
      (is (map? result))
      (is (contains? result :ast)))))

(deftest ^:parallel ast-structure-test
  (testing "AST structure is returned"
    (let [result (sqlglot.shim/p "SELECT 1")]
      (is (= "Select" (get-in result [:ast :type]))))))

(deftest ^:parallel subquery-test
  (testing "Subquery table extraction"
    (let [result (sqlglot.shim/p "SELECT * FROM (SELECT id FROM users) AS sub")]
      (is (= ["users"] (:tables_source result))))))

(deftest ^:parallel aggregate-test
  (testing "Aggregate functions in projections"
    (let [result (sqlglot.shim/p "SELECT COUNT(*), SUM(amount) FROM orders")]
      (is (= ["orders"] (:tables_source result)))
      ;; Projections are named_selects - unnamed aggregates may not appear
      (is (vector? (:projections result))))))
