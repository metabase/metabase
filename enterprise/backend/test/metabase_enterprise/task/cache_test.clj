(ns metabase-enterprise.task.cache-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.task.cache :as task.cache]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn field-filter-query
  "A native query with an optional template tag"
  []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"date" {:name         "date"
                                      :display-name "Check-In Date"
                                      :type         :text}}
              :query         "SELECT count(*) FROM CHECKINS [[WHERE date = {{date}}]]"}})

(defn run-query-for-card-with-params
  [card-id params]
  (mt/as-admin
    (qp.card/process-query-for-card
     card-id :api
     :parameters params
     :make-run (constantly
                (fn [query info]
                  (qp/process-query (qp/userland-query (assoc query :info info))))))))

(deftest queries-to-rerun-test
  (testing "Given a card, we re-run a limited number of variations of the card's query"
    (binding [qp.util/*execute-async?* false]
      (t2/delete! :model/QueryExecution)
      (mt/with-temp [:model/Card card {:name "Cached card"
                                       :dataset_query (field-filter-query)}]
        (let [param-val-1 "2024-12-01"
              params-1    [{:type  :text
                            :target [:variable [:template-tag "date"]]
                            :value param-val-1}]
              param-val-2 "2024-12-02"
              params-2    [{:type  :text
                            :target [:variable [:template-tag "date"]]
                            :value param-val-2}]
              to-rerun    #(@#'task.cache/queries-to-rerun card (t/minus (t/offset-date-time) (t/minutes 10)))
              param-vals  #(-> % :parameters first :value)]
          ;; Sanity check that the query actually runs
          (is (= [[1000]] (mt/rows (run-query-for-card-with-params (u/the-id card) []))))
          (is (= 1 (count (to-rerun))))

          (run-query-for-card-with-params (u/the-id card) params-1)
          (is (= [nil param-val-1] (map param-vals (to-rerun))))

          (run-query-for-card-with-params (u/the-id card) params-2)
          (is (= [nil param-val-1 param-val-2] (map param-vals (to-rerun))))

          (testing "Running a query again bumps it up in the result list"
            (run-query-for-card-with-params (u/the-id card) params-2)
            (is (= [param-val-2 nil param-val-1] (map param-vals (to-rerun)))))

          (testing "Only *queries-to-rerun-per-card* queries are returned"
            (binding [task.cache/*queries-to-rerun-per-card* 2]
              (is (= [param-val-2 nil] (map param-vals (to-rerun)))))))))))
