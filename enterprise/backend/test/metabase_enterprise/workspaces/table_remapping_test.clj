(ns metabase-enterprise.workspaces.table-remapping-test
  "Tests for the public writer API in `metabase-enterprise.workspaces.table-remapping`.
   Exercises the round-trip between `add-schema+table-mapping!`, `remap-table`,
   `remove-schema+table-mapping!`, `all-mappings-for-db`, and `clear-mappings-for-db!`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.test :as mt]))

(defn- clean-db-fixture
  "Run `f` with mappings cleared before and after so tests don't leak state."
  [db-id f]
  (ws.table-remapping/clear-mappings-for-db! db-id)
  (try (f)
       (finally (ws.table-remapping/clear-mappings-for-db! db-id))))

(deftest remap-table-returns-nil-when-no-mapping-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (is (nil? (ws.table-remapping/remap-table (mt/id) "nope_schema" "nope_table"))))))

(deftest add-then-remap-table-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (is (= ["ws_schema" "orders_copy"]
            (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))

(deftest all-mappings-for-db-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "PRODUCTS"] ["ws_schema" "products_copy"])
     (is (= {["PUBLIC" "ORDERS"]   ["ws_schema" "orders_copy"]
             ["PUBLIC" "PRODUCTS"] ["ws_schema" "products_copy"]}
            (ws.table-remapping/all-mappings-for-db (mt/id)))))))

(deftest remove-schema+table-mapping!-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (ws.table-remapping/remove-schema+table-mapping! (mt/id) ["PUBLIC" "ORDERS"])
     (is (nil? (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))

(deftest clear-mappings-for-db!-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "PRODUCTS"] ["ws_schema" "products_copy"])
     (ws.table-remapping/clear-mappings-for-db! (mt/id))
     (is (= {} (ws.table-remapping/all-mappings-for-db (mt/id)))))))
