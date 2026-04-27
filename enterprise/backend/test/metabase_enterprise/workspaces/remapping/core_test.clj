(ns metabase-enterprise.workspaces.remapping.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]))

(deftest map-store-enabled-for-db?-test
  (testing "returns false for DB without remappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (false? (ws.remapping/enabled-for-db? 999)))))

  (testing "returns true for DB with remappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["public" "orders"] ["mb_iso" "orders"]}})]
      (is (true? (ws.remapping/enabled-for-db? 1)))
      (is (false? (ws.remapping/enabled-for-db? 2))))))

(deftest map-store-remappings-for-db-test
  (testing "returns empty map for DB without remappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (= {} (ws.remapping/remappings-for-db 999)))))

  (testing "returns correct mappings"
    (let [mappings {["github_analytics" "commits"] ["mb_iso_abc" "commits"]
                    ["github_analytics" "prs"]     ["mb_iso_abc" "prs"]}]
      (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {1 mappings})]
        (is (= mappings (ws.remapping/remappings-for-db 1))))))

  (testing "different DBs have independent remappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["s1" "t1"] ["s2" "t1"]}
                                               2 {["s3" "t3"] ["s4" "t3"]}})]
      (is (= {["s1" "t1"] ["s2" "t1"]} (ws.remapping/remappings-for-db 1)))
      (is (= {["s3" "t3"] ["s4" "t3"]} (ws.remapping/remappings-for-db 2))))))

(deftest skip-remapping-test
  (testing "*skip-remapping?* makes enabled-for-db? return false"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["public" "orders"] ["mb_iso" "orders"]}})
              ws.remapping/*skip-remapping?* true]
      (is (false? (ws.remapping/enabled-for-db? 1))))))
