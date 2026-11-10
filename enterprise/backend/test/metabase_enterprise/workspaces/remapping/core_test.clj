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
                                              {1 {{:db "" :schema "public" :table "orders"}
                                                  {:db "" :schema "mb_iso" :table "orders"}}})]
      (is (true? (ws.remapping/enabled-for-db? 1)))
      (is (false? (ws.remapping/enabled-for-db? 2))))))

(deftest map-store-remappings-for-db-test
  (testing "returns empty map for DB without remappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (= {} (ws.remapping/remappings-for-db 999)))))
  (testing "returns correct mappings (canonical ::table-spec shape)"
    (let [mappings {{:db "" :schema "github_analytics" :table "commits"}
                    {:db "" :schema "mb_iso_abc"       :table "commits"}
                    {:db "" :schema "github_analytics" :table "prs"}
                    {:db "" :schema "mb_iso_abc"       :table "prs"}}]
      (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {1 mappings})]
        (is (= mappings (ws.remapping/remappings-for-db 1))))))
  (testing "different DBs have independent remappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {{:db "" :schema "s1" :table "t1"} {:db "" :schema "s2" :table "t1"}}
                                               2 {{:db "" :schema "s3" :table "t3"} {:db "" :schema "s4" :table "t3"}}})]
      (is (= {{:db "" :schema "s1" :table "t1"} {:db "" :schema "s2" :table "t1"}}
             (ws.remapping/remappings-for-db 1)))
      (is (= {{:db "" :schema "s3" :table "t3"} {:db "" :schema "s4" :table "t3"}}
             (ws.remapping/remappings-for-db 2)))))
  (testing "BigQuery 3-slot specs (catalog populated)"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {{:db "mb-prod" :schema "core"     :table "orders"}
                                                  {:db "mb-prod" :schema "ws_alice" :table "orders"}}})]
      (is (= {{:db "mb-prod" :schema "core"     :table "orders"}
              {:db "mb-prod" :schema "ws_alice" :table "orders"}}
             (ws.remapping/remappings-for-db 1))))))

(deftest skip-remapping-test
  (testing "*skip-remapping?* makes enabled-for-db? return false"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {{:db "" :schema "public" :table "orders"}
                                                  {:db "" :schema "mb_iso" :table "orders"}}})
              ws.remapping/*skip-remapping?* true]
      (is (false? (ws.remapping/enabled-for-db? 1))))))

(deftest map-store-get-mapping-test
  (testing "targeted lookup by source spec"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {{:db ""        :schema "public" :table "orders"} {:db ""        :schema "ws"       :table "orders"}
                                                  {:db "mb-prod" :schema "core"   :table "users"}  {:db "mb-prod" :schema "ws_alice" :table "users"}}})]
      (testing "found: returns the to-side spec"
        (is (= {:db "" :schema "ws" :table "orders"}
               (ws.remapping/get-mapping 1 {:db "" :schema "public" :table "orders"})))
        (is (= {:db "mb-prod" :schema "ws_alice" :table "users"}
               (ws.remapping/get-mapping 1 {:db "mb-prod" :schema "core" :table "users"}))))
      (testing "miss returns nil"
        (is (nil? (ws.remapping/get-mapping 1 {:db "" :schema "public" :table "nope"})))
        (is (nil? (ws.remapping/get-mapping 999 {:db "" :schema "public" :table "orders"}))
            "wrong db-id returns nil")))))

;;; -------------------------- write methods on the map store --------------------------

(deftest map-store-insert-mapping-test
  (testing "insert into an empty store"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (some? (ws.remapping/insert-mapping! 1
                                               {:db "" :schema "public" :table "orders"}
                                               {:db "" :schema "ws"     :table "orders"})))
      (is (= {{:db "" :schema "public" :table "orders"}
              {:db "" :schema "ws"     :table "orders"}}
             (ws.remapping/remappings-for-db 1)))))
  (testing "insert is idempotent on the (db, from) key"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (some? (ws.remapping/insert-mapping! 1
                                               {:db "" :schema "public" :table "orders"}
                                               {:db "" :schema "ws"     :table "orders"})))
      (is (some? (ws.remapping/insert-mapping! 1
                                               {:db "" :schema "public" :table "orders"}
                                               {:db "" :schema "ws"     :table "orders"}))
          "duplicate insert resolves cleanly (returns truthy, no exception)")
      (is (= 1 (count (ws.remapping/remappings-for-db 1)))
          "only one row persists after duplicate insert")))
  (testing "BigQuery 3-slot insert"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (ws.remapping/insert-mapping! 1
                                    {:db "mb-prod" :schema "core"     :table "orders"}
                                    {:db "mb-prod" :schema "ws_alice" :table "orders"})
      (is (= {{:db "mb-prod" :schema "core"     :table "orders"}
              {:db "mb-prod" :schema "ws_alice" :table "orders"}}
             (ws.remapping/remappings-for-db 1))))))

(deftest map-store-remove-mapping-test
  (testing "remove an existing mapping returns 1"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {{:db "" :schema "public" :table "orders"}
                                                  {:db "" :schema "ws"     :table "orders"}}})]
      (is (= 1 (ws.remapping/remove-mapping! 1 {:db "" :schema "public" :table "orders"})))
      (is (= {} (ws.remapping/remappings-for-db 1)))))
  (testing "remove a non-existent mapping returns 0"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (= 0 (ws.remapping/remove-mapping! 1 {:db "" :schema "public" :table "orders"}))))))

(deftest map-store-clear-for-db-test
  (testing "clear-for-db! removes only the target db's mappings"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {{:db "" :schema "s1" :table "t1"} {:db "" :schema "ws" :table "t1"}
                                                  {:db "" :schema "s2" :table "t2"} {:db "" :schema "ws" :table "t2"}}
                                               2 {{:db "" :schema "other" :table "x"} {:db "" :schema "ws" :table "x"}}})]
      (is (= 2 (ws.remapping/clear-for-db! 1)))
      (is (= {} (ws.remapping/remappings-for-db 1)))
      (is (= {{:db "" :schema "other" :table "x"} {:db "" :schema "ws" :table "x"}}
             (ws.remapping/remappings-for-db 2))
          "other db's remappings untouched"))))

(deftest display-context-suppresses-remapping-test
  (testing "with-display-context binds *skip-remapping?* true so enabled-for-db? returns false
            even when remap rows exist; restores the binding on exit"
    (require 'metabase.workspaces.table-remapping)
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store
                                              {1 {{:db "" :schema "public" :table "orders"}
                                                  {:db "" :schema "mb_iso" :table "orders"}}})]
      (is (true? (ws.remapping/enabled-for-db? 1))
          "baseline: remapping is enabled outside the display context")
      ((requiring-resolve 'metabase.workspaces.table-remapping/call-with-display-context)
       (fn []
         (is (false? (ws.remapping/enabled-for-db? 1))
             "inside the display context, remapping is suppressed")))
      (is (true? (ws.remapping/enabled-for-db? 1))
          "binding restored after the display context exits"))))
