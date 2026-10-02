(ns metabase.metabot.query-execution-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.query-execution :as query-execution]
   [metabase.metabot.tools.util :as tools.util]
   [metabase.query-processor.core :as qp]
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
