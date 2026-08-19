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

;; Regression test for https://github.com/metabase/metabase/issues/69264
;; When a user's `settings` column contains a non-decodable string (e.g., an encrypted value whose encryption key
;; is no longer set), `encrypted-json-out` returns the raw string instead of a map. Setting a user-local setting
;; then tried to `assoc` onto that string and threw
;; `java.lang.ClassCastException: class java.lang.String cannot be cast to class clojure.lang.Associative`.
(deftest set-user-local-setting-with-corrupted-settings-column-test
  (testing "Setting a user-local setting should succeed even when *user-local-values* holds a non-map string (#69264)"
    (mt/with-test-user :rasta
      (setting/with-user-local-values (delay (atom "not-valid-json-this-is-broken"))
        (is (= "light" (users.settings/color-scheme! "light"))
            "setting a user-local-only setting should succeed even when the existing settings value was undecodable")
        (is (= "light" (users.settings/color-scheme))
            "the new value should be readable after the corrupted value was replaced")))))
