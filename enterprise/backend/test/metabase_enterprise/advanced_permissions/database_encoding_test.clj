(ns metabase-enterprise.advanced-permissions.database-encoding-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- insert-managed-databases!
  "Inserts a Database with a Table for each of `managed?`, with one readable and one internal setting, gives All Users
  nothing on them, and gives the group with `group-id` query access to all of them and management of those whose
  `managed?` is true, and returns `[db-id table-id]` pairs."
  [group-id managed?]
  (vec (for [manage? managed?]
         (let [db-id    (first (t2/insert-returning-pks! :model/Database
                                                         [(merge (mt/with-temp-defaults :model/Database)
                                                                 {:engine   :h2
                                                                  :details  {:db "mem:database-encoding-test"}
                                                                  :settings {:unaggregated-query-row-limit 5
                                                                             :auto-cruft-tables            ["x"]}})]))
               table-id (first (t2/insert-returning-pks! :model/Table
                                                         [(merge (mt/with-temp-defaults :model/Table)
                                                                 {:db_id db-id :active true})]))]
           (perms/set-database-permission! (perms/all-users-group) db-id :perms/view-data :blocked)
           (perms/set-database-permission! (perms/all-users-group) db-id :perms/create-queries :no)
           (perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)
           (perms/set-database-permission! group-id db-id :perms/create-queries :query-builder)
           (perms/set-database-permission! group-id db-id :perms/manage-database (if manage? :yes :no))
           [db-id table-id]))))

(defn- insert-card!
  "Inserts a Card counting the rows of the Table with `table-id` of the Database with `db-id` in the Collection with
  `collection-id`, and returns its id."
  [collection-id [db-id table-id]]
  (let [mp (lib-be/application-database-metadata-provider db-id)]
    (first (t2/insert-returning-pks! :model/Card
                                     [(merge (mt/with-temp-defaults :model/Card)
                                             {:collection_id collection-id
                                              :database_id   db-id
                                              :dataset_query (-> (lib/query mp (lib.metadata/table mp table-id))
                                                                 (lib/aggregate (lib/count)))})]))))

(defn- insert-dashboard!
  "Inserts a Dashboard of the Cards with `card-ids` in the Collection with `collection-id` and returns its id."
  [collection-id card-ids]
  (let [dashboard-id (first (t2/insert-returning-pks! :model/Dashboard
                                                      [(merge (mt/with-temp-defaults :model/Dashboard)
                                                              {:collection_id collection-id})]))]
    (t2/insert! :model/DashboardCard (map-indexed (fn [i card-id]
                                                    (merge (mt/with-temp-defaults :model/DashboardCard)
                                                           {:dashboard_id dashboard-id :card_id card-id :row i :col 0}))
                                                  card-ids))
    dashboard-id))

(defn- table-dependencies!
  "Inserts a Dependency of the Card with `card-id` on each Table of `databases`, `[db-id table-id]` pairs."
  [card-id databases]
  (t2/insert! :model/Dependency (for [[_ table-id] databases]
                                  {:from_entity_type :card  :from_entity_id card-id
                                   :to_entity_type   :table :to_entity_id   table-id})))

(defn- shown
  "Whether the response shows the details of `database`, and the keys of its settings it shows."
  [database]
  [(contains? database :details) (set (keys (:settings database)))])

(defn- graph-databases
  "The Databases of the Table nodes of the dependency graph of the Card with `card-id`, as rasta gets it, by id."
  [card-id]
  (into {}
        (keep (fn [{:keys [type data]}] (when (= "table" type) [(:db_id data) (:db data)])))
        (:nodes (mt/user-http-request :rasta :get 200 "ee/dependencies/graph" :type "card" :id card-id))))

(deftest databases-in-other-responses-encoded-as-alone-test
  (testing "dashboard query_metadata and the dependency graph show each Database as GET /api/database/:id does"
    (mt/with-premium-features #{:advanced-permissions :dependencies}
      (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                     :model/PermissionsGroupMembership _              {:group_id group-id :user_id (mt/user->id :rasta)}
                     :model/Collection                 {coll-id :id}  {}]
        (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
        (mt/with-model-cleanup [:model/Database :model/Card :model/Dashboard :model/Dependency]
          (let [databases    (insert-managed-databases! group-id [true false false])
                db-ids       (mapv first databases)
                card-ids     (mapv #(insert-card! coll-id %) databases)
                dashboard-id (insert-dashboard! coll-id card-ids)
                _            (table-dependencies! (first card-ids) databases)
                alone        (mapv #(shown (mt/user-http-request :rasta :get 200 (format "database/%d" %))) db-ids)
                metadata-dbs (m/index-by :id (:databases (mt/user-http-request
                                                          :rasta :get 200 (format "dashboard/%d/query_metadata" dashboard-id))))
                graph-dbs    (graph-databases (first card-ids))]
            (is (= [[true #{:unaggregated-query-row-limit}]
                    [false #{:unaggregated-query-row-limit}]
                    [false #{:unaggregated-query-row-limit}]]
                   alone))
            (is (= alone (mapv (comp shown metadata-dbs) db-ids)))
            (is (= alone (mapv (comp shown graph-dbs) db-ids)))))))))

(defn- warm-statement-count
  "The number of app DB statements of a second call of `thunk`."
  [thunk]
  (thunk)
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(deftest ^:synchronized dependency-graph-database-encoding-statement-count-test
  (testing "the dependency graph costs as many statements for Tables on 10 Databases as on 40"
    (mt/with-premium-features #{:advanced-permissions :dependencies}
      (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                     :model/PermissionsGroupMembership _              {:group_id group-id :user_id (mt/user->id :rasta)}
                     :model/Collection                 {coll-id :id}  {}]
        (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
        (mt/with-model-cleanup [:model/Database :model/Card :model/Dependency]
          (let [counts (fn [n]
                         (let [databases (insert-managed-databases! group-id (take n (cycle [true false])))
                               card-id   (insert-card! coll-id (first databases))]
                           (table-dependencies! card-id databases)
                           (warm-statement-count #(graph-databases card-id))))]
            (is (= (counts 10) (counts 40)))))))))
