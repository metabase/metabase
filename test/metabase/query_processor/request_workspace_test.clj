(ns metabase.query-processor.request-workspace-test
  "A query in a workspace that a request names reads that workspace's data, so it writes nothing that every workspace
  shares, and reads nothing that holds another workspace's data."
  {:clj-kondo/config '{:linters
                       ;; allowing with-temp in this namespace since a Card's result metadata is saved in the app DB
                       {:discouraged-var {metabase.test/with-temp {:level :off}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.query-processor.middleware.persistence :as qp.persistence]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(deftest card-result-metadata-is-not-saved-test
  (testing "a Card's result metadata is not saved from a run in a workspace that a request names"
    (let [query (mt/native-query {:query "SELECT ID, NAME FROM VENUES"})]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
        (t2/update! :model/Card :id card-id {:result_metadata nil})
        (mt/with-dynamic-fn-redefs [workspaces/workspace-bound? (constantly true)]
          (is (= :completed
                 (:status (qp/process-query (qp/userland-query query {:card-id    card-id
                                                                      :query-hash (qp.util/query-hash {})}))))))
        (is (nil? (t2/select-one-fn :result_metadata :model/Card :id card-id)))))))

(deftest persisted-model-is-not-substituted-test
  (let [query {:database 1
               :stages   [{:lib/type              :mbql.stage/native
                           :native                "SELECT 1"
                           :persisted-info/native "SELECT * FROM persisted"}]}]
    (testing "the persisted table of a model is used outside a workspace that a request names"
      (is (= query (qp.persistence/substitute-persisted-query query))))
    (testing "a query in a workspace that a request names does not use the persisted table, which holds the shared rows"
      (mt/with-dynamic-fn-redefs [workspaces/workspace-bound? (constantly true)]
        (binding [api/*current-user-id* nil]
          (let [stage (-> (qp.persistence/substitute-persisted-query query) :stages first)]
            (is (not (contains? stage :persisted-info/native)))
            (is (true? (:qp/skip-persisted-cache stage)))))))))
