(ns metabase.users.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.users.settings :as users.settings]
   [toucan2.core :as t2]))

(deftest last-used-native-database-id-can-be-read-and-set
  (testing "last-used-native-database-id can be read and set"
    (mt/with-test-user :rasta
      (let [initial-value  (users.settings/last-used-native-database-id)
            existing-db-id (:id (t2/select-one :model/Database))
            wrong-db-id    -999]
        (is (nil? initial-value))
        (users.settings/last-used-native-database-id! existing-db-id)
        (is (= existing-db-id (users.settings/last-used-native-database-id)))
        (testing "returns nil if the database doesn't exist"
          (users.settings/last-used-native-database-id! wrong-db-id)
          (is (nil? (users.settings/last-used-native-database-id))))))))

(deftest last-used-native-database-id-can-be-read-and-set-2
  (testing "last-used-native-database-id should be a user-local setting"
    (is (=? {:user-local :only}
            (setting/resolve-setting :last-used-native-database-id)))
    (mt/with-temp [:model/Database {id1 :id} {:name "DB1"}
                   :model/Database {id2 :id} {:name "DB2"}]
      (mt/with-test-user :rasta
        (mt/discard-setting-changes [last-used-native-database-id]
          (users.settings/last-used-native-database-id! id1)
          (mt/with-test-user :crowberto
            (mt/discard-setting-changes [last-used-native-database-id]
              (users.settings/last-used-native-database-id! id2)
              (is (= (users.settings/last-used-native-database-id) id2))
              (mt/with-test-user :rasta
                (is (= (users.settings/last-used-native-database-id) id1))))))))))
