(ns metabase-enterprise.workspaces.sync-hook-test
  "Tests for the `workspace-remap-schema+name` sync hook in
   `metabase.sync.fetch-metadata`. The enterprise impl in
   `metabase-enterprise.workspaces.remapping.core` reads through the active
   `*remapping-store*` so we bind a `MapRemappingStore` here — no DB temps."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase.driver :as driver]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:workspaces} (f))))

(deftest workspace-remap-schema+name-no-mapping-test
  (testing "without a remapping, the hook returns nil so sync queries the logical table"
    (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
      (is (nil? (ws.remapping/workspace-remap-schema+name 1 "PUBLIC" "ORDERS"))))))

(deftest workspace-remap-schema+name-with-mapping-test
  (testing "with a remapping, the hook returns the isolated warehouse [schema name]"
    (binding [ws.remapping/*remapping-store*
              (ws.remapping/map-store {1 {["PUBLIC" "ORDERS"] ["mb_iso_ws" "orders_copy"]}})]
      (is (= ["mb_iso_ws" "orders_copy"]
             (ws.remapping/workspace-remap-schema+name 1 "PUBLIC" "ORDERS"))))))

(deftest table-fields-metadata-honors-workspace-remapping-test
  (testing "sync/fetch-metadata/table-fields-metadata asks the driver about the remapped warehouse table"
    (let [db-id          (mt/id)
          describe-calls (atom [])]
      (binding [ws.remapping/*remapping-store*
                (ws.remapping/map-store {db-id {["PUBLIC" "ORDERS"] ["mb_iso_ws" "orders_copy"]}})]
        (with-redefs [driver/describe-fields
                      (fn [_driver _db & {:keys [table-names schema-names]}]
                        (swap! describe-calls conj {:path         :describe-fields
                                                    :table-names  table-names
                                                    :schema-names schema-names})
                        #{})
                      driver/describe-table
                      (fn [_driver _db table]
                        (swap! describe-calls conj {:path   :describe-table
                                                    :schema (:schema table)
                                                    :name   (:name table)})
                        {:fields #{}})]
          (let [logical-table (t2/instance :model/Table
                                           {:id 999 :name "ORDERS" :schema "PUBLIC" :db_id db-id})]
            (fetch-metadata/table-fields-metadata
             (t2/select-one :model/Database :id db-id)
             logical-table))
          (is (= 1 (count @describe-calls)))
          (let [call (first @describe-calls)]
            (testing "driver is asked about the remapped (to_schema, to_table_name), not the logical source"
              (case (:path call)
                :describe-fields
                (do (is (= ["orders_copy"] (:table-names call)))
                    (is (= ["mb_iso_ws"]   (:schema-names call))))
                :describe-table
                (do (is (= "orders_copy" (:name call)))
                    (is (= "mb_iso_ws"   (:schema call))))
                (is false (str "unexpected path " (:path call)))))))))))
