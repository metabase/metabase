(ns metabase-enterprise.workspaces.promotion-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.promotion :as ws.promotion]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest promote-transforms-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-temp [:model/Table                     t1   {:schema "public", :name "table_1"}
                   :model/Table                     t2   {:schema "public", :name "table_2"}
                   :model/Transform x1                   {:name        "Transform 1"
                                                          :description "Original description"
                                                          :target      {:type     "table"
                                                                        :database 1
                                                                        :schema   "public"
                                                                        :name     "table_1"}}
                   :model/Transform x2                   {:name        "Transform 2"
                                                          :description "Another original"
                                                          :target      {:type     "table"
                                                                        :database 1
                                                                        :schema   "public"
                                                                        :name     "table_2"}}
                   :model/Workspace                 ws   {:name "Test Workspace"}
                   :model/Table                     wst1 {:schema "isolated__place", :name "public__table_1"}
                   :model/Table                     wst2 {:schema "isolated__place", :name "public__table_2"}
                   :model/WorkspaceMappingTable     _    {:upstream_id   (:id t1)
                                                          :downstream_id (:id wst1)
                                                          :workspace_id  (:id ws)}
                   :model/WorkspaceMappingTable     _    {:upstream_id   (:id t2)
                                                          :downstream_id (:id wst2)
                                                          :workspace_id  (:id ws)}
                   :model/Transform                 wsx1 {:name         "Transform 1"
                                                          :description  "Modified description"
                                                          :workspace_id (:id ws)
                                                          :target      {:type     "table"
                                                                        :database 1
                                                                        :schema   "isolated__place"
                                                                        :name     "public__table_1"}}
                   :model/Transform                 wsx2 {:name         "Transform 2"
                                                          :description  "Modified description 2"
                                                          :workspace_id (:id ws)
                                                          :target      {:type     "table"
                                                                        :database 1
                                                                        :schema   "isolated__place"
                                                                        :name     "public__table_2"}}
                   :model/WorkspaceMappingTransform _m1  {:upstream_id   (:id x1)
                                                          :downstream_id (:id wsx1)
                                                          :workspace_id  (:id ws)}
                   :model/WorkspaceMappingTransform _m2  {:upstream_id   (:id x2)
                                                          :downstream_id (:id wsx2)
                                                          :workspace_id  (:id ws)}]

      (testing "promote-transforms! updates originals and reports success"
        (let [result (ws.promotion/promote-transforms! ws)]
          (testing "promotion worked"
            (is (=? {:promoted [{:id (:id x1)}
                                {:id (:id x2)}]}
                    result)))

          (testing "original transforms were updated with ws versions"
            (is (= (:description wsx1)
                   (t2/select-one-fn :description :model/Transform :id (:id x1))))
            (is (= (:description wsx2)
                   (t2/select-one-fn :description :model/Transform :id (:id x2))))))))))

(deftest promote-transforms-with-error-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-temp [:model/Table     t1                 {:schema "public", :name "table_1"}
                   :model/Transform x1                 {:name "Transform 1"}
                   :model/Workspace ws                 {:name "Test Workspace"}
                   :model/Table     t2                 {:schema "isolated", :name "public__table_1"}
                   :model/Transform wsx1               {:name         "Transform 1"
                                                        :workspace_id (:id ws)
                                                        :target      {:type     "table"
                                                                      :database 1
                                                                      :schema   "isolated"
                                                                      :name     "public__table_1"}}
                   :model/WorkspaceMappingTable      _ {:upstream_id   (:id t1)
                                                        :downstream_id (:id t2)
                                                        :workspace_id  (:id ws)}
                   :model/WorkspaceMappingTransform _m {:upstream_id   (:id x1)
                                                        :downstream_id (:id wsx1)
                                                        :workspace_id  (:id ws)}]

      (testing "promote-transforms! handles errors gracefully"
        (with-redefs [t2/update!
                      (fn [& _args]
                        (throw (ex-info "Execution failed" {})))]

          (is (=? {:promoted nil
                   :errors   [{:id    (:id wsx1)
                               :error "Execution failed"}]}
                  (mt/with-log-level [metabase-enterprise.workspaces.promotion :fatal]
                    (ws.promotion/promote-transforms! ws)))))))))
