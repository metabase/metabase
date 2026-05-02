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
                                              {1 {["" "public" "orders"] ["" "mb_iso" "orders"]}})]
      (is (true? (ws.remapping/enabled-for-db? 1)))
      (is (false? (ws.remapping/enabled-for-db? 2))))))

(deftest map-store-remappings-for-db-test
  (testing "returns empty map for DB without remappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (= {} (ws.remapping/remappings-for-db 999)))))

  (testing "returns correct mappings (canonical 3-tuple shape)"
    (let [mappings {["" "github_analytics" "commits"] ["" "mb_iso_abc" "commits"]
                    ["" "github_analytics" "prs"]     ["" "mb_iso_abc" "prs"]}]
      (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {1 mappings})]
        (is (= mappings (ws.remapping/remappings-for-db 1))))))

  (testing "different DBs have independent remappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["" "s1" "t1"] ["" "s2" "t1"]}
                                               2 {["" "s3" "t3"] ["" "s4" "t3"]}})]
      (is (= {["" "s1" "t1"] ["" "s2" "t1"]} (ws.remapping/remappings-for-db 1)))
      (is (= {["" "s3" "t3"] ["" "s4" "t3"]} (ws.remapping/remappings-for-db 2)))))

  (testing "BigQuery 3-slot tuples (catalog populated)"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["mb-prod" "core" "orders"]
                                                  ["mb-prod" "ws_alice" "orders"]}})]
      (is (= {["mb-prod" "core" "orders"] ["mb-prod" "ws_alice" "orders"]}
             (ws.remapping/remappings-for-db 1))))))

(deftest skip-remapping-test
  (testing "*skip-remapping?* makes enabled-for-db? return false"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["" "public" "orders"] ["" "mb_iso" "orders"]}})
              ws.remapping/*skip-remapping?* true]
      (is (false? (ws.remapping/enabled-for-db? 1))))))

(deftest map-store-get-mapping-test
  (testing "targeted lookup by source tuple"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["" "public" "orders"]   ["" "ws" "orders"]
                                                  ["mb-prod" "core" "users"] ["mb-prod" "ws_alice" "users"]}})]
      (testing "found: returns the to-side tuple"
        (is (= ["" "ws" "orders"]
               (ws.remapping/get-mapping 1 ["" "public" "orders"])))
        (is (= ["mb-prod" "ws_alice" "users"]
               (ws.remapping/get-mapping 1 ["mb-prod" "core" "users"]))))
      (testing "miss returns nil"
        (is (nil? (ws.remapping/get-mapping 1 ["" "public" "nope"])))
        (is (nil? (ws.remapping/get-mapping 999 ["" "public" "orders"]))
            "wrong db-id returns nil")))))

;;; -------------------------- write methods on the map store --------------------------

(deftest map-store-insert-mapping-test
  (testing "insert into an empty store"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (some? (ws.remapping/insert-mapping! 1 ["" "public" "orders"] ["" "ws" "orders"])))
      (is (= {["" "public" "orders"] ["" "ws" "orders"]}
             (ws.remapping/remappings-for-db 1)))))

  (testing "insert is idempotent on the (db, from) key"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (some? (ws.remapping/insert-mapping! 1 ["" "public" "orders"] ["" "ws" "orders"])))
      (is (some? (ws.remapping/insert-mapping! 1 ["" "public" "orders"] ["" "ws" "orders"]))
          "duplicate insert resolves cleanly (returns truthy, no exception)")
      (is (= 1 (count (ws.remapping/remappings-for-db 1)))
          "only one row persists after duplicate insert")))

  (testing "BigQuery 3-slot insert"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (ws.remapping/insert-mapping! 1
                                    ["mb-prod" "core" "orders"]
                                    ["mb-prod" "ws_alice" "orders"])
      (is (= {["mb-prod" "core" "orders"] ["mb-prod" "ws_alice" "orders"]}
             (ws.remapping/remappings-for-db 1))))))

(deftest map-store-remove-mapping-test
  (testing "remove an existing mapping returns 1"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["" "public" "orders"] ["" "ws" "orders"]}})]
      (is (= 1 (ws.remapping/remove-mapping! 1 ["" "public" "orders"])))
      (is (= {} (ws.remapping/remappings-for-db 1)))))

  (testing "remove a non-existent mapping returns 0"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (= 0 (ws.remapping/remove-mapping! 1 ["" "public" "orders"]))))))

(deftest map-store-clear-for-db-test
  (testing "clear-for-db! removes only the target db's mappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["" "s1" "t1"] ["" "ws" "t1"]
                                                  ["" "s2" "t2"] ["" "ws" "t2"]}
                                               2 {["" "other" "x"] ["" "ws" "x"]}})]
      (is (= 2 (ws.remapping/clear-for-db! 1)))
      (is (= {} (ws.remapping/remappings-for-db 1)))
      (is (= {["" "other" "x"] ["" "ws" "x"]} (ws.remapping/remappings-for-db 2))
          "other db's remappings untouched"))))

(deftest display-context-suppresses-remapping-test
  (testing "with-display-context binds *skip-remapping?* true so enabled-for-db? returns false
            even when remap rows exist; restores the binding on exit"
    (require 'metabase.workspaces.table-remapping)
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {["" "public" "orders"] ["" "mb_iso" "orders"]}})]
      (is (true? (ws.remapping/enabled-for-db? 1))
          "baseline: remapping is enabled outside the display context")
      ((requiring-resolve 'metabase.workspaces.table-remapping/call-with-display-context)
       (fn []
         (is (false? (ws.remapping/enabled-for-db? 1))
             "inside the display context, remapping is suppressed")))
      (is (true? (ws.remapping/enabled-for-db? 1))
          "binding restored after the display context exits"))))
