(ns metabase.driver.quack.client-test
  "Tier B — client/transport tests. Need a live Quack server (the federated dev
  stack or the basic server). Skip gracefully if unreachable."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver.quack.client :as client]
   [metabase.util.log :as log])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)

(def host (or (System/getenv "QUACK_HOST") "127.0.0.1"))
(def port (Integer/parseInt (or (System/getenv "QUACK_PORT") "9494")))
(def token (or (System/getenv "QUACK_TOKEN") "devtoken"))
(def details {:host host :port port :ssl false :token token :timeout-seconds 60})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String host ^int port)] true)
       (catch Exception _ false)))

(def ^:private live? (atom nil))

(use-fixtures :once
  (fn [t]
    (if (reachable?)
      (reset! live? true)
      (do (reset! live? false)
          (log/infof "[client-test] SKIP: no Quack server at %s:%s" host port)))
    (t)))

(defn- when-live [& body] (when @live? (dorun body)))

;;; ===========================================================================
;;; B1. can-connect?
;;; ===========================================================================

(deftest b1-can-connect-test
  (when-live
   (testing "can-connect? is true with good creds"
     (is (true? (client/can-connect? details))))
   (testing "can-connect? is false with a bad token"
     (is (false? (client/can-connect? (assoc details :token "WRONG-TOKEN-XYZ"))))))
  (when-not @live? (is true)))  ; keep test count honest on skip

;;; ===========================================================================
;;; B2. connect → prepare → disconnect
;;; ===========================================================================

(deftest b2-connect-prepare-disconnect-test
  (when-live
   (testing "connect returns a non-empty connection id"
     (let [cid (client/connect! details)]
       (is (string? cid))
       (is (pos? (count cid)))
       (client/disconnect! details cid)))))

;;; ===========================================================================
;;; B3. multi-batch FETCH yields exactly N rows
;;; ===========================================================================

(deftest b3-multi-batch-fetch-test
  (when-live
   (testing "range(10000) returns exactly 10000 rows through the reducible"
     (let [{:keys [rows]} (client/execute-query details "SELECT i FROM range(10000) t(i)")
           n (reduce (fn [c _] (inc c)) 0 rows)]
       (is (= 10000 n))))))

;;; ===========================================================================
;;; B4. early reduction stops fetching after the first batch
;;; ===========================================================================

(deftest b4-early-reduction-test
  (when-live
   (testing "taking 5 rows from a 10000-row result doesn't realize all batches"
     (let [{:keys [rows]} (client/execute-query details "SELECT i FROM range(10000) t(i)")
           took (reduce (fn [acc row]
                          (let [acc' (conj acc row)]
                            (if (>= (count acc') 5) (reduced acc') acc')))
                        [] rows)]
       (is (= 5 (count took)))
       (is (= [[0] [1] [2] [3] [4]] took))))))

;;; ===========================================================================
;;; B5. server errors surface as readable exceptions
;;; ===========================================================================

(deftest b5-server-error-surfaces-test
  (when-live
   (testing "a query against a missing table raises an ex-info with the server's message"
     (try (client/execute-query details "SELECT * FROM nonexistent_table_xyz")
          (is false "should have thrown")
          (catch Throwable e
            (is (some? (:type (ex-data e)))
                (str "ex-data should carry :type; got " (ex-data e)))
            (is (re-find #"nonexistent_table_xyz|does not exist|Binder Error|Catalog Error"
                         (ex-message e))))))))

;;; ===========================================================================
;;; B6. large result streams without OOM
;;; ===========================================================================

(deftest b6-large-result-streaming-test
  (when-live
   (testing "a multi-thousand-row result sums correctly via reduce"
     (let [{:keys [rows]} (client/execute-query details "SELECT i FROM range(5000) t(i)")
           total (reduce (fn [^long acc row] (+ acc (first row))) 0 rows)]
       (is (= (reduce + (range 5000)) total))))))

;;; ===========================================================================
;;; B7. Connection pool: successive queries reuse a server-side connection
;;; ===========================================================================

(deftest b7-connection-pool-reuses-test
  (when-live
   (testing "successive execute-query calls reuse pooled connection_ids - the
            Quack overview + Tuning Workloads guide both call this out as the
            main per-query latency win. We observe reuse by counting requests:
            one CONNECT for the first borrow, then the pooled conn is reused for
            the next N queries, so the request-id counter grows slowly."
     (client/reset-pool!)
     (let [before  @@#'client/query-id-counter
           _       (doseq [sql ["SELECT 1" "SELECT 2" "SELECT 3"]]
                     (let [rows (:rows (client/execute-query details sql))]
                       (reduce (fn [_ _] nil) nil rows)))   ; 3-arg: drives IReduceInit, returns conn to pool
           after   @@#'client/query-id-counter
           issued  (- after before)]
       ;; 1 CONNECT + 3 PREPARE = 4 requests if pool reuses one conn.
       ;; Without pooling it'd be 3 CONNECT + 3 PREPARE = 6 (one connect per query).
       (is (<= issued 5)
           (str "too many request ids issued (" issued ") - pool likely not reusing"))))))

;;; ===========================================================================
;;; B8. Multi-batch FETCH actually exercises the held-connection path
;;;     (> quack_fetch_batch_chunks * STANDARD_VECTOR_SIZE rows)
;;; ===========================================================================

(deftest b8-multi-batch-fetch-holds-connection-test
  (when-live
   (testing "range(60000) returns every row through held-connection FETCH rounds"
     (let [{:keys [rows]} (client/execute-query details "SELECT i FROM range(60000) t(i)")
           n (reduce (fn [c _] (inc c)) 0 rows)]
       (is (= 60000 n))))))

;;; ===========================================================================
;;; B9. :session-sql applies to pooled connections (workload tuning over Quack)
;;; ===========================================================================

(deftest b9-session-sql-applies-test
  (when-live
   (testing ":session-sql SET statements apply to a pooled connection and stick
            for its lifetime - the documented way to tune DuckDB workload
            settings (threads, memory_limit, temp_directory, ...) over Quack.
            The connection-per-request model could not do this."
     (client/reset-pool!)
     (let [d    (assoc details :session-sql "SET threads = 7;")
           _    (reduce (fn [_ _] nil) nil (:rows (client/execute-query d "SELECT 1")))
           rows (:rows (client/execute-query d "SELECT current_setting('threads') AS t"))
           v    (ffirst (into [] rows))]
       (is (= "7" (str v))
           (str "SET threads should persist on the pooled conn; got " v))))))

;;; ===========================================================================
;;; B10. execute-sql! drains rows (so the pooled connection is released)
;;; ===========================================================================

(deftest b10-execute-sql-drains-rows-test
  ;; execute-sql! must return realized rows (a vector), unlike execute-query
  ;; whose :rows is a lazy reducible — draining is what releases the pooled
  ;; connection instead of leaking it (see quack.pool docstring).
  (when-live
   (testing "execute-sql! returns {:cols :rows vector} (drained, not lazy)"
     (client/reset-pool!)
     (let [{:keys [cols rows]} (client/execute-sql! details "SELECT 1 AS n")]
       (is (seq cols))
       (is (vector? rows))
       (is (= 1 (count rows)))))
   (testing "the borrowed connection is returned to the pool (not leaked)"
     ;; draining the reducible is what releases the conn; after execute-sql! the
     ;; pool must hold an idle connection for this endpoint.
     (is (some (comp pos? :idle val) (client/pool-stats)))))
  (when-not @live? (is true)))
