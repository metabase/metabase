(ns metabase-enterprise.advanced-permissions.models.permissions.data-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- insert-database-with-tables!
  "Inserts a Database with `n` Tables, each with an ID Field, and returns `[db-id table-ids]`."
  [n]
  (let [db-id     (first (t2/insert-returning-pks! :model/Database
                                                   [(merge (mt/with-temp-defaults :model/Database)
                                                           {:engine :h2 :details {:db "mem:download-levels-test"}})]))
        table-ids (vec (t2/insert-returning-pks! :model/Table
                                                 (for [i (range n)]
                                                   (merge (mt/with-temp-defaults :model/Table)
                                                          {:db_id db-id :name (str "T" i) :schema "PUBLIC" :active true}))))]
    (t2/insert! :model/Field (for [table-id table-ids]
                               (merge (mt/with-temp-defaults :model/Field)
                                      {:table_id table-id :name "ID" :base_type :type/Integer :database_type "INT"
                                       :semantic_type :type/PK})))
    [db-id table-ids]))

(defn- give-download!
  "Gives the group with `group-id` query access and the download level `level` on the Database with `db-id`, and All
  Users nothing there."
  [group-id db-id level]
  (perms/set-database-permission! (perms/all-users-group) db-id :perms/view-data :blocked)
  (perms/set-database-permission! (perms/all-users-group) db-id :perms/create-queries :no)
  (perms/set-database-permission! (perms/all-users-group) db-id :perms/download-results :no)
  (perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)
  (perms/set-database-permission! group-id db-id :perms/create-queries :query-builder-and-native)
  (perms/set-database-permission! group-id db-id :perms/download-results level))

(defn- table-query
  "A query counting the rows of the Table with `table-id` of the Database with `db-id`."
  [db-id table-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)]
    (-> (lib/query mp (lib.metadata/table mp table-id))
        (lib/aggregate (lib/count)))))

(defn- join-query
  "A query of the Table with `table-id` joined to the Table with `other-id` on their ID Fields."
  [db-id table-id other-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        pk #(lib.metadata/field mp (t2/select-one-pk :model/Field :table_id %))]
    (lib/join (lib/query mp (lib.metadata/table mp table-id))
              (lib/join-clause (lib.metadata/table mp other-id) [(lib/= (pk table-id) (pk other-id))]))))

(defn- native-query
  "A native query of the Database with `db-id`."
  [db-id]
  (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1"))

(defn- card-query
  "A query of the Card with `card-id` of the Database with `db-id`."
  [db-id card-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- insert-card!
  "Inserts a Card of `query` in the Collection with `collection-id` and returns its id."
  [collection-id query]
  (first (t2/insert-returning-pks! :model/Card [(merge (mt/with-temp-defaults :model/Card)
                                                       {:collection_id collection-id
                                                        :database_id   (:database query)
                                                        :dataset_query query})])))

(defn- per-query-level
  "The download level of `query` for the user with `user-id`, computed one query at a time."
  [query user-id]
  (let [user-info                   (perms/user-info user-id)
        db-id                       (:database query)
        {:keys [table-ids native?]} (query-perms/query->source-ids query)
        whole-db?                   (or (= :mbql.stage/native (:lib/type (lib/query-stage query -1)))
                                        native?
                                        (lib/any-native-stage-not-introduced-by-sandbox? query))
        values                      (if whole-db?
                                      #{(get (perms/every-table-in-database-permissions-for-user
                                              user-info :perms/download-results [db-id])
                                             db-id)}
                                      (set (vals (perms/table-permissions-for-user
                                                  user-info :perms/download-results (zipmap table-ids (repeat db-id))))))]
    (or (values :no) (values :ten-thousand-rows) :one-million-rows)))

(deftest download-perms-levels-test
  (testing "download-perms-levels gives each query the level computed for it alone"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                     :model/PermissionsGroupMembership _              {:group_id group-id :user_id (mt/user->id :rasta)}
                     :model/Collection                 {coll-id :id}  {}]
        (mt/with-model-cleanup [:model/Database :model/Card]
          (let [[full-db [full-a full-b]] (insert-database-with-tables! 2)
                [limited-db [limited-a]]  (insert-database-with-tables! 1)
                [none-db [none-a]]        (insert-database-with-tables! 1)
                _                         (give-download! group-id full-db :one-million-rows)
                _                         (give-download! group-id limited-db :ten-thousand-rows)
                _                         (give-download! group-id none-db :no)
                _                         (perms/set-table-permissions! group-id :perms/download-results
                                                                        {full-b :ten-thousand-rows})
                source-card               (insert-card! coll-id (table-query full-db full-a))
                queries                   [(table-query full-db full-a)
                                           (table-query full-db full-b)
                                           (table-query limited-db limited-a)
                                           (table-query none-db none-a)
                                           (native-query full-db)
                                           (native-query limited-db)
                                           (native-query none-db)
                                           (join-query full-db full-a full-b)
                                           (card-query full-db source-card)]
                levels                    (perms/download-perms-levels queries (mt/user->id :rasta))]
            (is (= [:one-million-rows :ten-thousand-rows :ten-thousand-rows :no
                    :ten-thousand-rows :ten-thousand-rows :no :ten-thousand-rows :one-million-rows]
                   levels))
            (is (= (mapv #(per-query-level % (mt/user->id :rasta)) queries) levels))
            (is (= levels (mapv #(perms/download-perms-level % (mt/user->id :rasta)) queries)))
            (testing "an admin has the full level everywhere"
              (is (= (repeat (count queries) :one-million-rows)
                     (perms/download-perms-levels queries (mt/user->id :crowberto)))))
            (testing "without the feature every query has the full level"
              (mt/with-premium-features #{}
                (is (= (repeat (count queries) :full)
                       (perms/download-perms-levels queries (mt/user->id :rasta))))))))))))

(deftest pulse-attachments-check-test
  (testing "a subscription with attachments is refused when the user cannot download one of its Cards"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                     :model/PermissionsGroupMembership _              {:group_id group-id :user_id (mt/user->id :rasta)}
                     :model/Collection                 {coll-id :id}  {}]
        (mt/with-model-cleanup [:model/Database :model/Card]
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) coll-id)
          (let [[full-db [full-a]] (insert-database-with-tables! 1)
                [none-db [none-a]] (insert-database-with-tables! 1)
                _                  (give-download! group-id full-db :one-million-rows)
                _                  (give-download! group-id none-db :no)
                full-cards         (for [_ (range 3)] (insert-card! coll-id (table-query full-db full-a)))
                none-card          (insert-card! coll-id (table-query none-db none-a))
                attached           #(hash-map :id % :include_csv true)
                can-create?        #(mt/with-current-user (mt/user->id :rasta)
                                      (mi/can-create? :model/Pulse {:cards (map attached %) :collection_id coll-id}))]
            (is (true? (boolean (can-create? full-cards))))
            (is (false? (boolean (can-create? (conj (vec full-cards) none-card)))))
            (testing "without attachments the download level does not matter"
              (is (true? (boolean (mt/with-current-user (mt/user->id :rasta)
                                    (mi/can-create? :model/Pulse {:cards         [{:id none-card}]
                                                                  :collection_id coll-id}))))))))))))

(defn- cards-on-own-tables!
  "Inserts a Database of `n` Tables that the group with `group-id` downloads from at the limited level, with a Card of
  each Table and a Card on each of those in the Collection with `collection-id`, and returns the Card ids."
  [n group-id collection-id]
  (let [[db-id table-ids] (insert-database-with-tables! n)
        _                 (give-download! group-id db-id :one-million-rows)
        _                 (perms/set-table-permissions! group-id :perms/download-results
                                                        (zipmap table-ids (repeat :ten-thousand-rows)))
        table-cards       (mapv #(insert-card! collection-id (table-query db-id %)) table-ids)]
    (into table-cards (map #(insert-card! collection-id (card-query db-id %))) table-cards)))

(defn- warm-statement-count
  "The number of app DB statements of a second call of `thunk`."
  [thunk]
  (thunk)
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(deftest ^:synchronized download-perms-statement-count-test
  (testing "dashboard query_metadata and GET /api/pulse cost as many statements for 10 Cards on their own Tables as for 40"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                       :model/PermissionsGroupMembership _              {:group_id group-id :user_id (mt/user->id :rasta)}
                       :model/Collection                 {coll-id :id}  {}]
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) coll-id)
          (mt/with-model-cleanup [:model/Database :model/Card :model/Dashboard :model/Pulse]
            (let [counts (fn [n]
                           (let [card-ids     (cards-on-own-tables! n group-id coll-id)
                                 dashboard-id (first (t2/insert-returning-pks! :model/Dashboard
                                                                               [(merge (mt/with-temp-defaults :model/Dashboard)
                                                                                       {:collection_id coll-id})]))
                                 pulse-id     (first (t2/insert-returning-pks! :model/Pulse
                                                                               [(merge (mt/with-temp-defaults :model/Pulse)
                                                                                       {:creator_id    (mt/user->id :rasta)
                                                                                        :collection_id coll-id})]))]
                             (t2/insert! :model/DashboardCard (map-indexed (fn [i card-id]
                                                                             (merge (mt/with-temp-defaults :model/DashboardCard)
                                                                                    {:dashboard_id dashboard-id :card_id card-id
                                                                                     :row i :col 0}))
                                                                           card-ids))
                             (t2/insert! :model/PulseCard (map-indexed (fn [i card-id]
                                                                         (merge (mt/with-temp-defaults :model/PulseCard)
                                                                                {:pulse_id pulse-id :card_id card-id :position i}))
                                                                       card-ids))
                             {:query-metadata (warm-statement-count
                                               #(mt/user-http-request :rasta :get 200
                                                                      (format "dashboard/%d/query_metadata" dashboard-id)))
                              :pulses         (warm-statement-count #(mt/user-http-request :rasta :get 200 "pulse"))}))]
              (is (= (counts 10) (counts 40))))))))))
