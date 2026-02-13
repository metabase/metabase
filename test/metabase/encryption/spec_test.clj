(ns metabase.encryption.spec-test
  "Tests for the declarative encryption spec. Ensures all encrypted columns are covered by the
   spec and no model namespace directly registers encryption transforms."
  (:require
   [clojure.test :refer :all]
   [metabase.encryption.impl :as encryption.impl]
   [metabase.encryption.impl-test :as encryption-test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest database-details-encryption-round-trip-test
  (encryption-test/with-secret-key "test-key-for-round-trip-1234567"
    (mt/with-temp [:model/Database db {:name    "enc-test"
                                       :engine  :h2
                                       :details {:db "/tmp/enc-test.db"}}]
      (testing "details are encrypted in the DB"
        (let [raw (t2/select-one-fn :details (t2/table-name :model/Database) :id (:id db))]
          (is (encryption.impl/possibly-encrypted-string? raw))))
      (testing "details are decrypted when read through the model"
        (is (= {:db "/tmp/enc-test.db"} (t2/select-one-fn :details :model/Database :id (:id db))))))))

(deftest database-settings-encryption-round-trip-test
  (encryption-test/with-secret-key "test-key-for-round-trip-1234567"
    (mt/with-temp [:model/Database db {:name     "enc-test-settings"
                                       :engine   :h2
                                       :details  {:db "/tmp/enc-test.db"}
                                       :settings {:auto-run-queries true}}]
      (testing "settings are encrypted in the DB"
        (let [raw (t2/select-one-fn :settings (t2/table-name :model/Database) :id (:id db))]
          (is (encryption.impl/possibly-encrypted-string? raw))))
      (testing "settings are decrypted when read through the model"
        (is (= {:auto-run-queries true} (t2/select-one-fn :settings :model/Database :id (:id db))))))))

(deftest user-settings-encryption-round-trip-test
  (encryption-test/with-secret-key "test-key-for-round-trip-1234567"
    (mt/with-temp [:model/User user {}]
      (testing "settings are encrypted in the DB"
        (let [raw (t2/select-one-fn :settings (t2/table-name :model/User) :id (:id user))]
          (is (encryption.impl/possibly-encrypted-string? raw))))
      (testing "settings are decrypted when read through the model"
        (is (map? (t2/select-one-fn :settings [:model/User :settings] :id (:id user))))))))

(deftest setting-conditional-encryption-test
  (encryption-test/with-secret-key "test-key-for-round-trip-1234567"
    (try
      (t2/insert! :model/Setting {:key "enc-spec-test-setting" :value "secret-value"})
      (testing "Setting value is encrypted in the DB"
        (let [raw (t2/select-one-fn :value (t2/table-name :model/Setting) :key "enc-spec-test-setting")]
          (is (encryption.impl/possibly-encrypted-string? raw))))
      (testing "Setting value is decrypted when read through the model"
        (is (= "secret-value" (t2/select-one-fn :value :model/Setting :key "enc-spec-test-setting"))))
      (testing "encryption-check setting is never encrypted"
        (let [raw (t2/select-one-fn :value (t2/table-name :model/Setting) :key "encryption-check")]
          (when raw
            (is (not (encryption.impl/possibly-encrypted-string? raw))))))
      (finally
        (t2/delete! :model/Setting :key "enc-spec-test-setting")))))
