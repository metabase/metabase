(ns metabase.metabot.tools.sql.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.sql.common :as sql-common]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest metadata-provider-when-native-permitted-default-test
  (testing "a new database grants All Users native permissions by default"
    (mt/with-temp [:model/Database db {}]
      (mt/with-test-user :rasta
        (is (some? (sql-common/metadata-provider-when-native-permitted (u/the-id db))))))))

(deftest metadata-provider-when-native-permitted-query-builder-only-test
  (testing "query-builder-only access must not expose metadata for casing correction"
    (mt/with-temp [:model/Database db {}]
      (perms/set-database-permission! (perms/all-users-group) (u/the-id db) :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (is (nil? (sql-common/metadata-provider-when-native-permitted (u/the-id db))))))))

(deftest metadata-provider-when-native-permitted-two-database-test
  (testing "native permission on one database must not leak metadata for another"
    (mt/with-temp [:model/Database db-a {}
                   :model/Database db-b {}]
      (perms/set-database-permission! (perms/all-users-group) (u/the-id db-b) :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (is (some? (sql-common/metadata-provider-when-native-permitted (u/the-id db-a)))
            "native access to database A")
        (is (nil? (sql-common/metadata-provider-when-native-permitted (u/the-id db-b)))
            "only query-builder access to database B")))))

(deftest metadata-provider-when-native-permitted-granular-table-test
  (testing "native permission on only some tables of a database is not database-level native access"
    (mt/with-temp [:model/Database db {}
                   :model/Table t1 {:db_id (u/the-id db)}
                   :model/Table t2 {:db_id (u/the-id db)}]
      (perms/set-table-permission! (perms/all-users-group) (u/the-id t1)
                                   :perms/create-queries :query-builder-and-native)
      (perms/set-table-permission! (perms/all-users-group) (u/the-id t2)
                                   :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (is (nil? (sql-common/metadata-provider-when-native-permitted (u/the-id db))))))))

(deftest metadata-provider-when-native-permitted-superuser-test
  (testing "a superuser always gets a metadata provider"
    (mt/with-temp [:model/Database db {}]
      (perms/set-database-permission! (perms/all-users-group) (u/the-id db) :perms/create-queries :no)
      (mt/with-test-user :crowberto
        (is (some? (sql-common/metadata-provider-when-native-permitted (u/the-id db))))))))
