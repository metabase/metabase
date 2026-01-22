(ns ^:mb/driver-tests metabase.testing-api.workspace-resources-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest workspace-resources-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (mt/with-premium-features #{:workspaces :dependencies :transforms}
      (mt/with-model-cleanup [:model/Collection
                              :model/Transform
                              :model/TransformRun
                              :model/Workspace
                              :model/WorkspaceTransform
                              :model/WorkspaceInput
                              :model/WorkspaceOutput]
        (testing "POST /api/testing/workspace/resources creates test resources"
          (testing "global transforms only (no workspace)"
            (let [orders (mt/format-name :orders)]
              (is (=? {:workspace-id  nil
                       :global-map    {(keyword orders) int?, :x1 int?, :x2 int?}
                       :workspace-map {}}
                      (mt/user-http-request :crowberto :post 200 "testing/workspace/resources"
                                            {:global {:x1 [orders], :x2 [:x1]}})))))
          (testing "complex graph with real tables, mock tables, and chained transforms"
            (let [orders   (mt/format-name :orders)
                  products (mt/format-name :products)
                  people   (mt/format-name :people)]
              (is (=? {:workspace-id  int?
                       :global-map    {(keyword orders)   int?
                                       (keyword products) int?
                                       :t4                int?
                                       :x1                int?
                                       :x2                int?
                                       :x3                int?
                                       :x4                int?}
                       :workspace-map {:x5 string?, :x6 string?}}
                      (mt/user-http-request :crowberto :post 200 "testing/workspace/resources"
                                            {:global    {:x1 [orders]
                                                         :x2 [products]
                                                         :x3 [:x1 :x2]
                                                         :x4 [:t4]}
                                             :workspace {:definitions {:x2 [:x1]
                                                                       :x5 [orders :x3]
                                                                       :x6 [:x5 people]}}}))))))))))
