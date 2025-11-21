(ns metabase-enterprise.workspaces.promotion-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.workspaces.promotion :as ws.promotion]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest find-original-transform-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-temp [:model/Transform original       {}
                   :model/Workspace workspace      {}
                   :model/Transform workspace-copy {:workspace_id (:id workspace)}
                   :model/WorkspaceMappingTransform _m {:upstream_id   (:id original)
                                                        :downstream_id (:id workspace-copy)
                                                        :workspace_id  (:id workspace)}]
      (testing "find-original-transform uses workspace_mapping_transform table"
        (let [result (#'ws.promotion/find-original-transform workspace-copy (:id workspace))]
          (is (some? result))
          (is (= (:id original) (:id result)))
          (is (nil? (:workspace_id result))))))))

(deftest ^:parallel build-dependency-order-test
  (testing "build-dependency-order with no graph returns transforms in order"
    (let [transforms [{:id 1 :name "tx1"} {:id 2 :name "tx2"}]
          result (#'ws.promotion/build-dependency-order nil transforms)]
      (is (= [1 2] result))))

  (testing "build-dependency-order with empty graph returns transforms in order"
    (let [transforms [{:id 1 :name "tx1"} {:id 2 :name "tx2"}]
          result (#'ws.promotion/build-dependency-order {} transforms)]
      (is (= [1 2] result)))))

(deftest promote-transforms-test
  (mt/with-premium-features #{:workspaces :dependencies}
    (mt/with-temp [:model/Transform                 x1   {:name        "Transform 1"
                                                          :description "Original description"}
                   :model/Transform                 x2   {:name        "Transform 2"
                                                          :description "Another original"}
                   :model/Workspace                 ws   {:name "Test Workspace"}
                   :model/Transform                 wsx1 {:name         "Transform 1_DUP"
                                                          :description  "Modified description"
                                                          :workspace_id (:id ws)}
                   :model/Transform                 wsx2 {:name         "Transform 2_DUP"
                                                          :description  "Modified description 2"
                                                          :workspace_id (:id ws)}
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
    (mt/with-temp [:model/Transform x1                 {:name "Transform 1"}
                   :model/Workspace ws                 {:name "Test Workspace"}
                   :model/Transform wsx1               {:name         "Transform 1_DUP"
                                                        :workspace_id (:id ws)}
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
