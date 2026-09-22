(ns metabase-enterprise.workspaces.serialization-test
  "Serialization of a table a transform wrote into a workspace schema. Its identity travels as the canonical table's,
  so what a workspace changed can be exported and loaded elsewhere without carrying the workspace with it."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(def ^:private workspace-schema "ws_serdes")
(def ^:private workspace-table "ws_orders")

(defn- do-with-workspace-orders!
  "Calls `f` with the canonical `[schema name]` of the orders table and the id of the workspace table standing in
  for it, with that workspace bound so the serdes hooks resolve its remapping.

  With `bind?` false the workspace exists but is not in force, which is how a caller outside any workspace sees the
  same rows."
  ([f] (do-with-workspace-orders! f true))
  ([f bind?]
   (let [{:keys [schema name]} (t2/select-one [:model/Table :schema :name] :id (mt/id :orders))]
     (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws-serdes", :creator_id (mt/user->id :crowberto)}]
       (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema workspace-schema}}
         (mt/with-temp [:model/WorkspaceTableRemapping _        {:db_id        (mt/id)
                                                                 :workspace_id ws-id
                                                                 :from_schema  schema
                                                                 :from_table   name
                                                                 :to_schema    workspace-schema
                                                                 :to_table     workspace-table}
                        :model/Table                   ws-table {:db_id  (mt/id)
                                                                 :schema workspace-schema
                                                                 :name   workspace-table}]
           (#'ws.impl/clear-remappings-cache!)
           (if bind?
             (workspaces/with-workspace ws-id (f [schema name] (:id ws-table)))
             (f [schema name] (:id ws-table)))))))))

(deftest workspace-table-exports-as-the-canonical-table-test
  (testing "a workspace table travels as the canonical table it stands in for, so content referencing it loads
            against whatever backs that table on the other side -- a different workspace, or none"
    (mt/with-premium-features #{:workspaces}
      (do-with-workspace-orders!
       (fn [[schema name] ws-table-id]
         (is (= [(t2/select-one-fn :name :model/Database :id (mt/id)) schema name]
                (serdes/*export-table-fk* ws-table-id))))))))

(deftest the-canonical-table-imports-to-the-workspace-table-test
  (testing "and loading that reference here lands on the workspace table backing it, so imported content reads what
            this workspace produced"
    (mt/with-premium-features #{:workspaces}
      (do-with-workspace-orders!
       (fn [[schema name] ws-table-id]
         (let [db-name (t2/select-one-fn :name :model/Database :id (mt/id))]
           (is (= ws-table-id
                  (serdes/*import-table-fk* [db-name schema name])))))))))

(deftest fields-travel-under-the-canonical-table-too-test
  (testing "`export-field-fk` names the table through `export-table-fk`, so a workspace table's fields travel under
            the canonical table as well"
    (mt/with-premium-features #{:workspaces}
      (do-with-workspace-orders!
       (fn [[schema name] ws-table-id]
         (mt/with-temp [:model/Field field {:table_id ws-table-id, :name "total", :base_type :type/Float}]
           (is (= [(t2/select-one-fn :name :model/Database :id (mt/id)) schema name "total"]
                  (serdes/*export-field-fk* (:id field))))))))))

(deftest a-workspace-table-does-not-export-outside-its-workspace-test
  (testing "outside the workspace that owns it, a workspace table has no identity to export"
    ;; `export-table-fk` names a table through the overlay, and the overlay hides workspace schemas from any
    ;; reader. Inside the owning workspace the table travels as the canonical one it stands in for (above);
    ;; outside, there is nothing to name -- which is right, since nothing out here should be referencing it.
    (mt/with-premium-features #{:workspaces}
      (do-with-workspace-orders!
       (fn [_canonical ws-table-id]
         (is (= [nil nil nil] (serdes/*export-table-fk* ws-table-id))))
       false)))) ; workspace exists, not in force
