(ns ^:mb/driver-tests metabase-enterprise.workspaces.e2e-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest isolation-e2e-test
  (mt/test-drivers #_(mt/normal-drivers-with-feature :workspace) #{:postgres}
    (mt/with-model-cleanup [:model/Transform :model/Workspace]
      (mt/with-temp [:model/Transform {transform-id :id} {:name   "Transform 1"
                                                          :source {:type  "query"
                                                                   ;; TODO we should use native query here
                                                                   :query (mt/mbql-query orders {:limit 1})}
                                                          :target {:type "table"
                                                                   :name (str "test_table_1_" (mt/random-name))}}]
        (let [workspace             (mt/with-current-user (mt/user->id :crowberto)
                                      (ws.common/create-workspace! (mt/user->id :crowberto)
                                                                   {:name        (mt/random-name)
                                                                    :database_id (mt/id)
                                                                    :upstream    {:transforms [transform-id]}}))
              isolated-transform-id (t2/select-one-fn :downstream_id :model/WorkspaceMappingTransform :workspace_id (:id workspace))
              isolated-transform    (t2/select-one :model/Transform isolated-transform-id)
              executed-transform    (transforms.execute/execute! isolated-transform {:run-method :manual})
              output-table          (-> executed-transform :object :output-table)]
          (testing "execute the transform with the original query is fine and the output is in an isolated schema"
            (transforms.tu/wait-for-table (name output-table) 1000)
            (is (str/starts-with? (namespace output-table) "mb__isolation"))
            (is (= 1 (count (transforms.tu/table-rows (name output-table))))))

          (testing "changing the query without granting access will fail"
            (t2/update! :model/Transform isolated-transform-id {:source {:type  "query"
                                                                         ;; TODO we should use native query here
                                                                         :query (mt/mbql-query venues {:limit 1})}})
            (is (thrown-with-msg?
                 Exception
                 #"ERROR: permission denied for table.*"
                 (transforms.execute/execute! (t2/select-one :model/Transform isolated-transform-id) {:run-method :manual})))))))))
