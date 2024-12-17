(ns metabase.encryption-test
  (:require
   [clojure.test :refer :all]
   [metabase.db :as mdb]
   [metabase.encryption :as encryption]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(deftest setup-encryption-test
  (testing "Database with initially no encryption"
    (encryption-test/with-secret-key ""
      (mt/with-temp-empty-app-db [_conn :h2]
        (mdb/setup-db! :create-sample-content? true)
        (encryption/setup-encryption)
        (let [setting-value (:value (t2/select-one "setting" :key "site-uuid-for-version-info-fetching"))]
          (is (not (nil? setting-value)))
          (is (string/valid-uuid? setting-value)))

        (testing "Adding encryption encrypts database on restart"
          (encryption-test/with-secret-key "key1"
            (encryption/setup-encryption)
            (let [setting-value (:value (t2/select-one "setting" :key "site-uuid-for-version-info-fetching"))] ; need to select directly from "settings" to avoid auto-decryption
              (is (not (string/valid-uuid? setting-value)))))))))
  (testing "Database created with encryption configured is encrypted"
    (encryption-test/with-secret-key "key2"
      (mt/with-temp-empty-app-db [_conn :h2]
        (mdb/setup-db! :create-sample-content? true)
        (encryption/setup-encryption)
        (let [setting-value (:value (t2/select-one "setting" :key "site-uuid-for-version-info-fetching"))] ; need to select directly from "settings" to avoid auto-decryption
          (is (not (nil? setting-value)))
          (is (not (string/valid-uuid? setting-value))))
        (encryption-test/with-secret-key "different-key"
          (is (thrown-with-msg? Exception #"Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains" (encryption/setup-encryption)))
          (let [setting-value (:value (t2/select-one "setting" :key "site-uuid-for-version-info-fetching"))] ; need to select directly from "settings" to avoid auto-decryption
            (is (not (string/valid-uuid? setting-value)))))))))
