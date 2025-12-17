(ns ^:mb/driver-tests metabase-enterprise.workspaces.e2e-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- execute-workspace-transform!
  "Execute a transform within workspace isolation context. For testing purposes."
  [workspace ws-transform opts]
  (ws.isolation/with-workspace-isolation workspace
    (let [result (atom nil)]
      (t2/with-transaction [_tx]
        (let [transform (t2/insert-returning-instance!
                         :model/Transform
                         (select-keys ws-transform [:name :description :source :target]))]
          (reset! result (transforms.execute/execute! transform opts))
          ;; rather abort transaction
          (t2/delete! :model/Transform (:id transform))))
      @result)))

(defn- mbql->native [query]
  (qp.store/with-metadata-provider (mt/id)
    (sql.qp/mbql->native driver/*driver* (qp.preprocess/preprocess query))))

(deftest isolation-e2e-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace :transforms/table)
    (transforms.tu/with-transform-cleanup! [output-table-name (str "test_table_1_" (mt/random-name))]
      (mt/with-model-cleanup [:model/Transform :model/Workspace]
        (mt/with-temp [:model/Transform {transform-id :id} {:name   "Transform 1"
                                                            :source {:type  "query"
                                                                     :query (mt/native-query (mbql->native (mt/mbql-query orders {:limit 1})))}
                                                            :target {:type "table"
                                                                     :name output-table-name
                                                                     :database (mt/id)
                                                                     :schema (t2/select-one-fn :schema :model/Table (mt/id :orders))}}]
          (let [workspace          (mt/with-current-user (mt/user->id :crowberto)
                                     (ws.common/create-workspace! (mt/user->id :crowberto)
                                                                  {:name        (mt/random-name)
                                                                   :database_id (mt/id)
                                                                   :upstream    {:transforms [transform-id]}}))
                _                  (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                                                :transform transform-id
                                                                (t2/select-one :model/Transform transform-id))
                workspace          (u/poll {:thunk      #(t2/select-one :model/Workspace (:id workspace))
                                            :done?      #(= :ready (:status %))
                                            :timeout-ms 5000})
                isolated-transform (t2/select-one :model/WorkspaceTransform :workspace_id (:id workspace))
                ;; TODO We need to reimplement granting permission once we've reimplemented graph analysis
                #_#_executed-transform (execute-workspace-transform! workspace isolated-transform {:run-method :manual})
                #_#_output-table       (-> executed-transform :object :output-table)]

            #_(testing "execute the transform with the original query is fine and the output is in an isolated schema"
                (u/poll {:thunk     #(t2/select-one :model/Table :name (name output-table))
                         :done?      some?
                         :timeout-ms 1000})
                (transforms.tu/wait-for-table (name output-table) 1000)
                (is (str/starts-with? (namespace output-table) "mb__isolation"))
                (is (= 1 (count (transforms.tu/table-rows (name output-table))))))

            (testing "changing the query without granting access will fail"
              (t2/update! :model/WorkspaceTransform
                          {:ref_id (:ref_id isolated-transform)}
                          {:source {:type  "query"
                                    :query (mt/native-query (mbql->native (mt/mbql-query venues {:limit 1})))}})
              (is (thrown-with-msg?
                   Exception
                   #"ERROR: permission denied for table.*"
                   (execute-workspace-transform! workspace
                                                 (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id isolated-transform))
                                                 {:run-method :manual}))))))))))
