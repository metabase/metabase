(ns metabase-enterprise.workspaces.overlay-test
  "The Table overlay with the enterprise `enable-workspace-overlay?` in place: `metabase_table` rows name the tables
  sync found, and a read shows a workspace table where the canonical one it was written for would be."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.test :as mt]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.workspaces.core :as workspaces]
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
  that -- as sync leaves it -- has a Table row of its own.

  With `bind?` false the workspace exists but is not in force, which is how a reader outside any workspace sees the
  same rows."
  ([f] (do-with-workspace-orders! f true))
  ([f bind?]
   (let [{:keys [schema name]} (t2/select-one [:model/Table :schema :name] :id (mt/id :orders))]
     (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws-overlay", :creator_id (mt/user->id :crowberto)}]
       (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema workspace-schema}}
         (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id        (mt/id)
                                                          :workspace_id ws-id
                                                          :from_schema  schema
                                                          :from_table   name
                                                          :to_schema    workspace-schema
                                                          :to_table     workspace-table}
                        :model/Table                   _ {:db_id  (mt/id)
                                                          :schema workspace-schema
                                                          :name   workspace-table}]
           (#'ws.impl/clear-remappings-cache!)
           (if bind?
             (workspaces/with-workspace ws-id (f [schema name]))
             (f [schema name]))))))))

(deftest workspace-table-stands-where-the-canonical-one-would-test
  (testing "with workspaces on, the workspace table is what a reader sees, in the canonical table's place and under
            its name -- and the canonical row is not shown beside it"
    (mt/with-premium-features #{:workspaces}
      (do-with-workspace-orders!
       (fn [canonical]
         (is (= #{canonical} (tables (second canonical)))))))))

(deftest the-workspace-tables-own-columns-are-what-a-reader-gets-test
  (testing "the row standing in is the workspace table's own, so a run that changed the columns shows the change --
            the point of the whole thing"
    (mt/with-premium-features #{:workspaces}
      (do-with-workspace-orders!
       (fn [[schema name]]
         (let [row (t2/select-one [:model/Table :id :schema :name] :db_id (mt/id) :name name
                                  {:from [(warehouse-schema-overlay/table-query)]})]
           (is (= [schema name] [(:schema row) (:name row)])
               "it answers to the canonical name")
           (is (not= (mt/id :orders) (:id row))
               "but it is the workspace table's row, with the columns that run produced")))))))

(deftest the-canonical-table-stays-until-something-stands-in-test
  (testing "a remapping is recorded before the run writes and sync gives the table its row later still; until then
            the canonical table is all there is, so it keeps being shown"
    (mt/with-premium-features #{:workspaces}
      (let [{:keys [schema name]} (t2/select-one [:model/Table :schema :name] :id (mt/id :orders))]
        (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws-overlay", :creator_id (mt/user->id :crowberto)}]
          (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema workspace-schema}}
            (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id        (mt/id)
                                                             :workspace_id ws-id
                                                             :from_schema  schema
                                                             :from_table   name
                                                             :to_schema    workspace-schema
                                                             :to_table     workspace-table}]
              (#'ws.impl/clear-remappings-cache!)
              (workspaces/with-workspace ws-id
                (is (= #{[schema name]} (tables name)))))))))))

(deftest outside-a-workspace-only-the-canonical-table-is-visible-test
  (testing "outside any workspace the canonical table reads as itself and the workspace table is not shown at all"
    ;; Hiding the workspace schemas is unconditional: they are where runs write, not part of a database anyone
    ;; browses. Standing a workspace table in for a canonical one is the part that needs a workspace, and there is
    ;; none here -- so the canonical table is all that is left.
    (mt/with-premium-features #{:workspaces}
      (do-with-workspace-orders!
       (fn [canonical]
         (is (= #{canonical} (tables (second canonical)))))
       false)))) ; workspace exists, not in force

(deftest reads-are-the-real-tables-without-the-token-test
  (testing "without the :workspaces token feature the setting cannot turn the overlay on"
    (mt/with-premium-features #{}
      (do-with-workspace-orders!
       (fn [canonical]
         (is (= #{canonical [workspace-schema workspace-table]}
                (tables (second canonical)))))))))

(deftest the-flag-asks-for-the-real-tables-test
  (testing "`{:workspace-remapping? false}` is how sync reaches the tables as they really are"
    (mt/with-premium-features #{:workspaces}
      (do-with-workspace-orders!
       (fn [[schema name]]
         (is (= #{[schema name] [workspace-schema workspace-table]}
                (into #{}
                      (map (juxt :schema :name))
                      (t2/select [:model/Table :schema :name]
                                 :db_id (mt/id)
                                 :name [:in [name workspace-table]]
                                 {:from [(warehouse-schema-overlay/table-query
                                          {:workspace-remapping? false})]})))))))))

(deftest another-workspaces-table-is-not-shown-test
  (testing "a table synced from a workspace schema that no remapping of ours points at belongs to whoever wrote it,
            and is not part of the database anyone browses"
    (mt/with-premium-features #{:workspaces}
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
                                         {:workspace-remapping? false})]}))))))))))

(deftest a-schemaless-canonical-table-is-remapped-too-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws-overlay", :creator_id (mt/user->id :crowberto)}]
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema workspace-schema}}
        (mt/with-temp [:model/Table                   _ {:db_id (mt/id) :schema nil :name "schemaless"}
                       :model/WorkspaceTableRemapping _ {:db_id        (mt/id)
                                                         :workspace_id ws-id
                                                         :from_schema  nil
                                                         :from_table   "schemaless"
                                                         :to_schema    workspace-schema
                                                         :to_table     workspace-table}
                       :model/Table                   _ {:db_id  (mt/id)
                                                         :schema workspace-schema
                                                         :name   workspace-table}]
          (#'ws.impl/clear-remappings-cache!)
          (workspaces/with-workspace ws-id
            (is (= 1 (count (t2/select :model/Table :db_id (mt/id) :name "schemaless"
                                       {:from [(warehouse-schema-overlay/table-query)]}))))))))))

(deftest an-inactive-workspace-table-does-not-hide-the-canonical-one-test
  (mt/with-premium-features #{:workspaces}
    (let [{:keys [schema name]} (t2/select-one [:model/Table :schema :name] :id (mt/id :orders))]
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws-overlay", :creator_id (mt/user->id :crowberto)}]
        (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema workspace-schema}}
          (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id        (mt/id)
                                                           :workspace_id ws-id
                                                           :from_schema  schema
                                                           :from_table   name
                                                           :to_schema    workspace-schema
                                                           :to_table     workspace-table}
                         :model/Table                   _ {:db_id  (mt/id)
                                                           :schema workspace-schema
                                                           :name   workspace-table
                                                           :active false}]
            (#'ws.impl/clear-remappings-cache!)
            (workspaces/with-workspace ws-id
              (is (contains? (t2/select-pks-set :model/Table :db_id (mt/id) :active true
                                                {:from [(warehouse-schema-overlay/table-query)]})
                             (mt/id :orders))))))))))

(def ^:private other-workspace-table "ws_orders_other")

(deftest a-read-does-not-see-another-workspaces-table-test
  (testing "with two workspaces remapping the same canonical table, each sees only its own"
    ;; The overlay joins `workspace_table_remapping` in SQL rather than through the remapping hooks, so it has to
    ;; scope on the workspace itself. Unscoped, this join matches whichever row the planner reaches -- showing one
    ;; workspace the other's table under the canonical table's name.
    (mt/with-premium-features #{:workspaces}
      (let [{:keys [schema name]} (t2/select-one [:model/Table :schema :name] :id (mt/id :orders))]
        (mt/with-temp [:model/Workspace {ws-1 :id} {:name "ws-1", :creator_id (mt/user->id :crowberto)}
                       :model/Workspace {ws-2 :id} {:name "ws-2", :creator_id (mt/user->id :crowberto)}]
          (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema workspace-schema}}
            (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id        (mt/id)
                                                             :workspace_id ws-1
                                                             :from_schema  schema
                                                             :from_table   name
                                                             :to_schema    workspace-schema
                                                             :to_table     workspace-table}
                           :model/WorkspaceTableRemapping _ {:db_id        (mt/id)
                                                             :workspace_id ws-2
                                                             :from_schema  schema
                                                             :from_table   name
                                                             :to_schema    workspace-schema
                                                             :to_table     other-workspace-table}
                           :model/Table                   _ {:db_id  (mt/id)
                                                             :schema workspace-schema
                                                             :name   workspace-table}
                           :model/Table                   _ {:db_id  (mt/id)
                                                             :schema workspace-schema
                                                             :name   other-workspace-table}]
              (#'ws.impl/clear-remappings-cache!)
              (testing "each workspace's read resolves to its own physical table"
                (doseq [[ws-id expected] [[ws-1 workspace-table] [ws-2 other-workspace-table]]]
                  (workspaces/with-workspace ws-id
                    (let [rows (t2/select [:model/Table :id :schema :name]
                                          :db_id (mt/id)
                                          :name [:in [name workspace-table other-workspace-table]]
                                          {:from [(warehouse-schema-overlay/table-query)]})
                          ids  (into #{} (map :id) rows)]
                      (is (= #{[schema name]} (into #{} (map (juxt :schema :name)) rows))
                          "the canonical name is shown once, and the other workspace's table is not visible")
                      (is (= #{(t2/select-one-pk :model/Table :db_id (mt/id)
                                                 :schema workspace-schema :name expected)}
                             ids)
                          "and it is backed by this workspace's table, not the other's")))))
              (testing "with no workspace bound, the canonical table is shown and neither workspace table is"
                (is (nil? (workspaces/current-workspace-id)))
                (is (= #{[schema name]}
                       (into #{}
                             (map (juxt :schema :name))
                             (t2/select [:model/Table :schema :name]
                                        :db_id (mt/id)
                                        :name [:in [name workspace-table other-workspace-table]]
                                        {:from [(warehouse-schema-overlay/table-query)]}))))))))))))
