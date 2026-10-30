(ns metabase-enterprise.monitor-relay.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.rows :as relay.rows]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- app-db? []
  (#{:postgres :mysql} (mdb/db-type)))

(defn- utc-instant
  "SQL for the timestamp 2026-10-28T09:15:02.250Z. On MySQL, run it under the session time zone `+00:00`."
  []
  (if (= :mysql (mdb/db-type))
    "TIMESTAMP '2026-10-28 09:15:02.250'"
    "TIMESTAMPTZ '2026-10-28T09:15:02.250Z'"))

(deftest user-times-test
  (when (app-db?)
    (mt/with-temp [:model/User user {}]
      (let [move! #(t2/query [(str "UPDATE core_user SET date_joined = " (utc-instant) ", last_login = " (utc-instant)
                                   " WHERE id = ?")
                              (:id user)])]
        (if (= :mysql (mdb/db-type))
          (#'relay.db/in-time-zone "+00:00" move!)
          (move!))
        (mt/with-system-timezone-id! "America/New_York"
          (testing "a user's times are sent in UTC, also when the JVM runs in another time zone"
            (doseq [read [[:in "u.id" [(:id user)]] [:page (:id user) 1]]]
              (is (=? [{:id          (:id user)
                        :date_joined "2026-10-28T09:15:02.250Z"
                        :last_login  "2026-10-28T09:15:02.250Z"}]
                      (relay.rows/encode :user (relay.db/state-rows :user read)))
                  (str read)))))))))

(deftest mysql-time-zone-test
  (when (= :mysql (mdb/db-type))
    (let [zone #(:time_zone (t2/query-one ["SELECT @@session.time_zone AS time_zone"]))]
      (t2/with-connection [_conn]
        (let [saved (zone)]
          (t2/query ["SET time_zone = '+02:00'"])
          (try
            (testing "a user read sets the session's time zone back"
              (relay.db/state-rows :user [:page 0 1])
              (is (= "+02:00" (zone))))
            (finally
              (t2/query ["SET time_zone = ?" saved]))))))))

(deftest reads-test
  (when (app-db?)
    (mt/with-temp [:model/PermissionsGroup g1 {}
                   :model/PermissionsGroup g2 {}
                   :model/PermissionsGroup g3 {}]
      (testing "a read by ids reads the asked rows that exist"
        (is (= [(:id g1) (:id g3)]
               (sort (map :id (relay.db/state-rows :group [:in "g.id" [(:id g1) (:id g3) Integer/MAX_VALUE]]))))))
      (testing "a page reads the ids from one, in order, at most the limit"
        (is (= [(:id g2) (:id g3)] (map :id (relay.db/state-rows :group [:page (:id g2) 2]))))
        (is (= [(:id g3)] (map :id (relay.db/state-rows :group [:page (:id g3) 2]))))))
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db)}
                   :model/Table    t2 {:db_id (:id db)}
                   :model/Field    f1 {:table_id (:id t1)}
                   :model/Field    f2 {:table_id (:id t2)}]
      (testing "fields and tables read through the overlay by a column, and from an id"
        (is (= [(:id f1) (:id f2)] (sort (map :id (relay.db/state-rows :field [:in "f.id" [(:id f1) (:id f2)]])))))
        (is (= [(:id f2)] (map :id (relay.db/state-rows :field [:in "f.table_id" [(:id t2)]]))))
        (is (= [(:id f2)] (map :id (relay.db/state-rows :field [:page (:id f2) 10]))))
        (is (= [(:id t2)] (map :id (relay.db/state-rows :table [:page (:id t2) 10]))))))))
