(ns metabase.metabot.query-execution-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.settings :as driver.settings]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.query-execution :as query-execution]
   [metabase.metabot.tools.util :as tools.util]
   ;; Tests redefine `process-query` here, not in `metabase.query-processor.core`. The core var is a potemkin copy of
   ;; this one, so once other tests have patched both, redefining the copy no longer takes effect.
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- venues-query
  [limit]
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/order-by (lib.metadata/field mp (mt/id :venues :id)))
        (lib/limit limit)
        lib/prepare-for-serialization)))

(deftest execute-page-truncation-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "a result that fills the page exactly is complete"
      (is (=? {:returned 3 :truncated? false :rows #(= 3 (count %))}
              (query-execution/execute-page! (venues-query 3) 3 :agent))))
    (testing "a result with more rows than the page is truncated to the page"
      (is (=? {:returned 2 :truncated? true :rows #(= 2 (count %))}
              (query-execution/execute-page! (venues-query 3) 2 :agent))))))

(deftest execute-page-failure-is-an-agent-error-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [captured (atom nil)]
      (mt/with-dynamic-fn-redefs [qp/process-query (fn [query]
                                                     (reset! captured query)
                                                     {:status :failed :error "Column FOO not found"})]
        (is (= {:output "Query failed: Column FOO not found"}
               (try
                 (query-execution/execute-page! (assoc (venues-query 3) :info {:context :ad-hoc}) 3 :agent)
                 (catch clojure.lang.ExceptionInfo e
                   (tools.util/handle-agent-error e)))))
        (testing "the run is recorded under the caller's context, not one named in the query"
          (is (=? {:info {:executed-by (mt/user->id :rasta) :context :agent}}
                  @captured)))))))

(deftest execute-page-marks-a-permission-refusal-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [failure #(try
                     (query-execution/execute-page! (venues-query 3) 3 :agent)
                     (catch clojure.lang.ExceptionInfo e
                       (ex-data e)))]
      (testing "a query the user may not run fails as a permission error"
        (mt/with-no-data-perms-for-all-users!
          (is (=? {:error :query-failed, :permissions-error? true} (failure)))))
      (testing "any other failure does not"
        (mt/with-dynamic-fn-redefs [qp/process-query (constantly {:status :failed, :error "Column FOO not found"})]
          (is (=? {:error :query-failed, :permissions-error? false} (failure))))))))

(defn- received
  "The value `chan` delivers within 5 seconds, or nil."
  [chan]
  (first (a/alts!! [chan (a/timeout 5000)])))

(defn- waiting-execute
  "An [[qp.pipeline/*execute*]] that calls `before!`, then waits as a driver does until its channel says to stop,
  records what the channel delivered in `saw`, and responds with nothing."
  [before! saw]
  (fn [_driver _query _respond]
    (before!)
    (reset! saw (received qp.pipeline/*canceled-chan*))
    nil))

(deftest execute-page-request-cancellation-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [query        (venues-query 3)
          request-chan (a/promise-chan)
          seen!        (fn [request-canceled-chan during-query]
                         (let [seen (atom nil)]
                           (mt/with-dynamic-fn-redefs [qp/process-query (fn [_query]
                                                                          (let [query-chan qp.pipeline/*canceled-chan*]
                                                                            (reset! seen (during-query query-chan))
                                                                            ;; As the QP does when a query ends.
                                                                            (some-> query-chan a/close!)
                                                                            {:status :completed
                                                                             :data   {:cols [] :rows []}}))]
                             ;; A canceled run throws; what the query saw is the point here.
                             (try
                               (query-execution/execute-page! query 3 :agent
                                                              {:request-canceled-chan request-canceled-chan})
                               (catch clojure.lang.ExceptionInfo _)))
                           @seen))]
      (testing "without a request to follow, the QP is left to make its own channel"
        (is (false? (seen! nil some?))))
      (testing "a query runs on a channel of its own, and the QP closing that one leaves the request's open"
        (is (true? (seen! request-chan #(and (some? %) (not= request-chan %)))))
        (is (nil? (a/poll! request-chan)))))))

(deftest execute-page-canceled-run-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [query   (venues-query 3)
          failure #(try
                     (query-execution/execute-page! query 3 :agent {:request-canceled-chan %})
                     (catch clojure.lang.ExceptionInfo e
                       (ex-data e)))]
      (testing "a request canceled while the driver runs the query reaches the driver, and the run reads as canceled"
        (let [request-chan (a/promise-chan)
              driver-saw   (atom nil)]
          (binding [qp.pipeline/*execute* (waiting-execute #(a/>!! request-chan :canceled) driver-saw)]
            (is (=? {:error :query-canceled} (failure request-chan)))
            (is (some? @driver-saw)))))
      (testing "a request that is already canceled runs nothing"
        (let [ran? (atom false)]
          (binding [qp.pipeline/*execute* (fn [_driver _query _respond]
                                            (reset! ran? true)
                                            nil)]
            (is (=? {:error :query-canceled} (failure (doto (a/promise-chan) (a/>!! :canceled)))))
            (is (false? @ran?))))))))

(deftest execute-page-stopped-mid-stream-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [query (venues-query 3)
          cols  (for [column ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"]]
                  {:name column})
          run   (fn [stop! options]
                  ;; A driver streams rows until its channel says to stop.
                  ;; The QP returns the rows read so far as a completed result, which must not read as a complete page.
                  (binding [qp.pipeline/*execute* (fn [_driver _query respond]
                                                    (let [rows (atom (for [id [1 2 3]] [id "Venue" 1 0.0 0.0 1]))]
                                                      (respond {:cols cols}
                                                               (qp.reducible/reducible-rows
                                                                (fn []
                                                                  (when (= 3 (count @rows))
                                                                    (stop!)
                                                                    (received qp.pipeline/*canceled-chan*))
                                                                  (let [row (first @rows)]
                                                                    (swap! rows rest)
                                                                    row))))))]
                    (try
                      (query-execution/execute-page! query 3 :agent options)
                      (catch clojure.lang.ExceptionInfo e
                        (ex-data e)))))]
      (testing "a request canceled after the first row reads as canceled"
        (let [request-chan (a/promise-chan)]
          (is (=? {:error :query-canceled}
                  (run #(a/>!! request-chan :canceled) {:request-canceled-chan request-chan})))))
      (testing "a time limit reached after the first row reads as timed out"
        (is (=? {:error :query-timed-out}
                (run (constantly nil) {:timeout-ms 200})))))))

(deftest execute-page-time-limit-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [query          (venues-query 3)
          driver-saw     (atom nil)
          limit-ms       (atom nil)
          ;; The query timeout the driver ran under, which a connection pool it opened would keep.
          driver-timeout (atom nil)
          failure        (fn [run]
                           (reset! driver-saw nil)
                           (reset! limit-ms nil)
                           (let [stop!   (atom nil)
                                 before! (fn []
                                           (reset! driver-timeout driver.settings/*query-timeout-ms*)
                                           (some-> @stop! (apply [])))]
                             ;; The limit fires once the driver is waiting, not on a clock started before
                             ;; preprocessing, so on a slow runner it still stops the query in flight.
                             (mt/with-dynamic-fn-redefs [query-execution/schedule-time-limit!
                                                         (fn [timeout-ms stop-query!]
                                                           (reset! limit-ms timeout-ms)
                                                           (reset! stop! stop-query!)
                                                           ((mt/original-fn #'query-execution/schedule-time-limit!)
                                                            (u/hours->ms 1)
                                                            (constantly nil)))]
                               (binding [qp.pipeline/*execute* (waiting-execute before! driver-saw)]
                                 (try
                                   (run)
                                   (catch clojure.lang.ExceptionInfo e
                                     (ex-data e)))))))]
      (testing "a run that reaches its time limit is stopped, and reads as timed out"
        (is (=? {:error :query-timed-out}
                (failure #(query-execution/execute-page! query 3 :agent {:timeout-ms 60000}))))
        (is (= 60000 @limit-ms))
        (is (some? @driver-saw))
        (testing "without shortening the database query timeout, which a connection pool opened by the run would keep"
          (is (= driver.settings/*query-timeout-ms* @driver-timeout))))
      (testing "the database query timeout still applies when it is the shorter"
        (binding [driver.settings/*query-timeout-ms* 30000]
          (is (=? {:error :query-timed-out}
                  (failure #(query-execution/execute-page! query 3 :agent {:timeout-ms 60000}))))
          (is (= 30000 @limit-ms))
          (is (some? @driver-saw))))
      (testing "a caller that sets no limit gets the database query timeout, reported as any failed query is"
        ;; The QP's own timer, which may stop the run before or after it reaches the driver.
        (binding [driver.settings/*query-timeout-ms* 200]
          (is (=? {:error :query-failed}
                  (failure #(query-execution/execute-page! query 3 :agent))))
          (is (nil? @limit-ms)))))))
