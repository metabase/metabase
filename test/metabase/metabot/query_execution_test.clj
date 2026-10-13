(ns metabase.metabot.query-execution-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.query-execution :as query-execution]
   [metabase.metabot.tools.util :as tools.util]
   ;; Tests redefine `process-query` here, not in `metabase.query-processor.core`. The core var is a potemkin copy of
   ;; this one, so once other tests have patched both, redefining the copy no longer takes effect.
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.test :as mt]))

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

(deftest execute-page-request-cancellation-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [request-chan (a/promise-chan)
          seen!        (fn [request-canceled-chan during-query]
                         (mt/with-dynamic-fn-redefs [qp/process-query (fn [_query]
                                                                        (let [query-chan qp.pipeline/*canceled-chan*
                                                                              seen       (during-query query-chan)]
                                                                          ;; As the QP does when a query ends.
                                                                          (some-> query-chan a/close!)
                                                                          {:status :completed
                                                                           :data   {:cols [] :rows [[seen]]}}))]
                           (-> (query-execution/execute-page! (venues-query 3) 3 :agent request-canceled-chan)
                               :rows
                               ffirst)))
          canceled     (fn [query-chan]
                         (first (a/alts!! [query-chan (a/timeout 5000)])))]
      (testing "without a request to follow, the QP is left to make its own channel"
        (is (false? (seen! nil some?))))
      (testing "a query runs on a channel of its own, and the QP closing that one leaves the request's open"
        (is (true? (seen! request-chan #(and (some? %) (not= request-chan %)))))
        (is (nil? (a/poll! request-chan))))
      (testing "a canceled request cancels the query that is running"
        (is (some? (seen! request-chan (fn [query-chan]
                                         (a/>!! request-chan :canceled)
                                         (canceled query-chan)))))))))

(deftest execute-page-canceled-run-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [failure #(try
                     (query-execution/execute-page! (venues-query 3) 3 :agent %)
                     (catch clojure.lang.ExceptionInfo e
                       (ex-data e)))]
      (testing "a request canceled while the driver runs the query reaches the driver, and the run reads as canceled"
        (let [request-chan (a/promise-chan)
              driver-saw   (atom nil)]
          (binding [qp.pipeline/*execute* (fn [_driver _query _respond]
                                            (a/>!! request-chan :canceled)
                                            ;; A driver stops when its channel says so, and responds with nothing.
                                            (reset! driver-saw (first (a/alts!! [qp.pipeline/*canceled-chan*
                                                                                 (a/timeout 5000)])))
                                            nil)]
            (is (=? {:error :query-canceled} (failure request-chan)))
            (is (some? @driver-saw)))))
      (testing "a request that is already canceled runs nothing"
        (let [ran? (atom false)]
          (binding [qp.pipeline/*execute* (fn [_driver _query _respond]
                                            (reset! ran? true)
                                            nil)]
            (is (=? {:error :query-canceled} (failure (doto (a/promise-chan) (a/>!! :canceled)))))
            (is (false? @ran?))))))))
