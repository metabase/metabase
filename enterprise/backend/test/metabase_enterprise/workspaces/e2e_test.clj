(ns ^:mb/driver-tests metabase-enterprise.workspaces.e2e-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.core :as workspaces]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- execute-workspace-transform!
  "Execute a transform within workspace isolation context. For testing purposes."
  [workspace transform opts]
  (workspaces/with-workspace-isolation workspace
    (transforms.i/execute! transform opts)))

(defn- mbql->native [query]
  (qp.store/with-metadata-provider (mt/id)
    (sql.qp/mbql->native driver/*driver* (qp.preprocess/preprocess query))))

(deftest isolation-e2e-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (mt/with-model-cleanup [:model/Transform :model/Workspace]
      (mt/with-temp [:model/Transform {transform-id :id} {:name   "Transform 1"
                                                          :source {:type  "query"
                                                                   :query (mt/native-query (mbql->native (mt/mbql-query orders {:limit 1})))}
                                                          :target {:type "table"
                                                                   :name (str "test_table_1_" (mt/random-name))}}]
        (let [workspace             (mt/with-current-user (mt/user->id :crowberto)
                                      (ws.common/create-workspace! (mt/user->id :crowberto)
                                                                   {:name        (mt/random-name)
                                                                    :database_id (mt/id)
                                                                    :upstream    {:transforms [transform-id]}}))
              isolated-transform-id (t2/select-one-fn :downstream_id :model/WorkspaceMappingTransform :workspace_id (:id workspace))
              isolated-transform    (t2/select-one :model/Transform isolated-transform-id)
              executed-transform    (execute-workspace-transform! workspace isolated-transform {:run-method :manual})
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
                 ;; PostgreSQL: "ERROR: permission denied for table..."
                 ;; BigQuery: "User does not have permission to query table..."
                 #"(?i)permission denied for table|does not have permission to query table"
                 (execute-workspace-transform! workspace (t2/select-one :model/Transform isolated-transform-id) {:run-method :manual})))))))
    #_(transforms.tu/with-transform-cleanup! [output-table-name (str "test_table_1_" (mt/random-name))])))
