(ns metabase.cmd.enable-encryption-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.cmd.core :as cmd]
   [metabase.cmd.enable-encryption :refer [enable-encryption!]]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- raw-value [k]
  (t2/select-one-fn :value :setting 'key k))

(defn- restart! []
  (reset! (:status mdb.connection/*application-db*) ::not-set-up)
  (mdb/setup-db! :create-sample-content? false))

(deftest cmd-enable-encryption-errors-when-failed-test
  (mt/with-dynamic-fn-redefs [enable-encryption! #(throw (Exception. "err"))
                              cmd/system-exit!   identity]
    (is (= 1 (cmd/enable-encryption)))))

(deftest enable-encryption!-test
  (testing "enabling encryption on an existing, unencrypted instance"
    (encryption-test/with-secret-key nil
      (mt/with-temp-empty-app-db [_conn :h2]
        (mdb/setup-db! :create-sample-content? true)
        (t2/insert! :model/Setting {'key "test-setting", 'value "plain value"})
        ;; the v53 migration's legacy plaintext marker; new code never writes it and reads it as "no sentinel"
        (is (= "unencrypted" (raw-value "encryption-check")))
        (encryption-test/with-secret-key "key1"
          (testing "startup refuses until the command has been run"
            (is (thrown-with-msg? Exception #"already contains data.*run `enable-encryption`" (restart!)))
            (is (= "unencrypted" (raw-value "encryption-check"))))
          (testing "the command encrypts everything and writes the sentinel"
            (enable-encryption!)
            (is (encryption/decryptable-string? (raw-value "encryption-check")))
            (is (encryption/decryptable-string? (raw-value "test-setting")))
            (is (= "plain value" (t2/select-one-fn :value :model/Setting 'key "test-setting")))
            (is (encryption/decryptable-string? (t2/select-one-fn :details :metabase_database)))
            (is (map? (t2/select-one-fn :details :model/Database))))
          (testing "startup now succeeds"
            (is (= :done (restart!))))
          (testing "running it again is a no-op"
            (let [sentinel (raw-value "encryption-check")]
              (enable-encryption!)
              (is (= sentinel (raw-value "encryption-check"))))))
        (testing "running it with a different key than the database was encrypted with aborts"
          (encryption-test/with-secret-key "key2"
            (is (thrown-with-msg? Exception #"encrypted with a different key" (enable-encryption!)))))))))
