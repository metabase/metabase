(ns metabase-enterprise.workspaces.overlay-test
  "The Table overlay with the enterprise `enable-workspace-overlay?` in place: `metabase_table` rows name the tables
  sync found, and a read shows a workspace table where the canonical one it was written for would be."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.test :as mt]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(def ^:private workspace-schema "ws_overlay")
(def ^:private workspace-table "ws_orders")

(defn- tables
  "The `(schema, name)` pairs a Table read gives back for the orders table and its workspace table."
  [canonical-name]
  (into #{}
        (map (juxt :schema :name))
        (t2/select [:model/Table :schema :name]
                   :db_id (mt/id)
                   :name [:in [canonical-name workspace-table]]
                   {:from [(warehouse-schema-overlay/table-query)]})))

(defn- do-with-workspace-orders!
  "Calls `f` with the canonical `[schema name]` of the orders table, while a run has written it to a workspace table
  that -- as sync leaves it -- has a Table row of its own."
  [f]
  (let [{:keys [schema name]} (t2/select-one [:model/Table :schema :name] :id (mt/id :orders))]
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema workspace-schema}}
      (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id       (mt/id)
                                                       :from_schema schema
                                                       :from_table  name
                                                       :to_schema   workspace-schema
                                                       :to_table    workspace-table}
                     :model/Table                   _ {:db_id  (mt/id)
                                                       :schema workspace-schema
                                                       :name   workspace-table}]
        (#'ws.impl/clear-remappings-cache!)
        (f [schema name])))))

(deftest workspace-table-stands-where-the-canonical-one-would-test
  (testing "with workspaces on, the workspace table is what a reader sees, in the canonical table's place and under
            its name -- and the canonical row is not shown beside it"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (do-with-workspace-orders!
         (fn [canonical]
           (is (= #{canonical} (tables (second canonical))))))))))

(deftest the-workspace-tables-own-columns-are-what-a-reader-gets-test
  (testing "the row standing in is the workspace table's own, so a run that changed the columns shows the change --
            the point of the whole thing"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (do-with-workspace-orders!
         (fn [[schema name]]
           (let [row (t2/select-one [:model/Table :id :schema :name] :db_id (mt/id) :name name
                                    {:from [(warehouse-schema-overlay/table-query)]})]
             (is (= [schema name] [(:schema row) (:name row)])
                 "it answers to the canonical name")
             (is (not= (mt/id :orders) (:id row))
                 "but it is the workspace table's row, with the columns that run produced"))))))))

(deftest the-canonical-table-stays-until-something-stands-in-test
  (testing "a remapping is recorded before the run writes and sync gives the table its row later still; until then
            the canonical table is all there is, so it keeps being shown"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (let [{:keys [schema name]} (t2/select-one [:model/Table :schema :name] :id (mt/id :orders))]
          (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema workspace-schema}}
            (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id       (mt/id)
                                                             :from_schema schema
                                                             :from_table  name
                                                             :to_schema   workspace-schema
                                                             :to_table    workspace-table}]
              (#'ws.impl/clear-remappings-cache!)
              (is (= #{[schema name]} (tables name))))))))))

(deftest reads-are-the-real-tables-when-off-test
  (testing "with workspaces off both rows read as the tables they really are"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled false]
        (do-with-workspace-orders!
         (fn [canonical]
           (is (= #{canonical [workspace-schema workspace-table]}
                  (tables (second canonical))))))))))

(deftest reads-are-the-real-tables-without-the-token-test
  (testing "without the :workspaces token feature the setting cannot turn the overlay on"
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (do-with-workspace-orders!
         (fn [canonical]
           (is (= #{canonical [workspace-schema workspace-table]}
                  (tables (second canonical))))))))))

(deftest the-flag-asks-for-the-real-tables-test
  (testing "`{:workspace-remapping? false}` is how sync reaches the tables as they really are"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (do-with-workspace-orders!
         (fn [[schema name]]
           (is (= #{[schema name] [workspace-schema workspace-table]}
                  (into #{}
                        (map (juxt :schema :name))
                        (t2/select [:model/Table :schema :name]
                                   :db_id (mt/id)
                                   :name [:in [name workspace-table]]
                                   {:from [(warehouse-schema-overlay/table-query
                                            {:workspace-remapping? false})]}))))))))))

(deftest another-workspaces-table-is-not-shown-test
  (testing "a table synced from a workspace schema that no remapping of ours points at belongs to whoever wrote it,
            and is not part of the database anyone browses"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (do-with-workspace-orders!
         (fn [_canonical]
           (mt/with-temp [:model/Table _ {:db_id  (mt/id)
                                          :schema workspace-schema
                                          :name   "someone_elses_output"}]
             (is (empty? (t2/select [:model/Table :schema :name]
                                    :db_id (mt/id) :name "someone_elses_output"
                                    {:from [(warehouse-schema-overlay/table-query)]})))
             (testing "but it is still a real row, which sync sees"
               (is (=? [{:schema workspace-schema, :name "someone_elses_output"}]
                       (t2/select [:model/Table :schema :name]
                                  :db_id (mt/id) :name "someone_elses_output"
                                  {:from [(warehouse-schema-overlay/table-query
                                           {:workspace-remapping? false})]})))))))))))
