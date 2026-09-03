(ns metabase.cmd.enable-encryption-test
  "Requires `metabase.cloud-migration.models.cloud-migration` so that its read-only-mode guard on Toucan DML is
  installed here as it is in production; without it a regression of `enable-encryption!` onto Toucan DML passes."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.cloud-migration.models.cloud-migration :as cloud-migration]
   [metabase.cmd.core :as cmd]
   [metabase.cmd.enable-encryption :refer [enable-encryption!]]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment cloud-migration/keep-me)

(use-fixtures :once (fixtures/initialize :db))

(defsetting enable-encryption-test-setting
  "Test setting -- a plaintext setting row for `enable-encryption` to encrypt."
  :visibility :internal
  :encryption :no)

(defn- raw-value [k]
  (t2/select-one-fn :value :setting :key k))

(defn- restart! []
  (reset! (:status mdb.connection/*application-db*) ::not-set-up)
  (mdb/setup-db! :create-sample-content? false))

(defn- restore-cache-now!
  "Restore the Setting cache unconditionally, as `restore-cache-if-needed!` does in a fresh JVM; in the shared test JVM
  its once-a-minute throttle is often already spent by another application DB, which would mask the failure."
  [& _]
  (setting.cache/restore-cache!)
  true)

(deftest cmd-enable-encryption-errors-when-failed-test
  (mt/with-dynamic-fn-redefs [enable-encryption! #(throw (Exception. "err"))
                              cmd/system-exit!   identity]
    (is (= 1 (cmd/enable-encryption)))))

(deftest enable-encryption!-test
  (testing "enabling encryption on an existing, unencrypted instance"
    (encryption-test/with-secret-key nil
      (mt/with-temp-empty-app-db [_conn :h2]
        (mdb/setup-db! :create-sample-content? true)
        (t2/insert! :model/Setting {:key "enable-encryption-test-setting", :value "plain value"})
        ;; the v53 migration's legacy plaintext marker; new code never writes it and reads it as "no sentinel"
        (is (= "unencrypted" (raw-value "encryption-check")))
        (encryption-test/with-secret-key "key1"
          (testing "startup refuses until the command has been run"
            (is (thrown-with-msg? Exception #"already contains data.*run `enable-encryption`" (restart!)))
            (is (= "unencrypted" (raw-value "encryption-check"))))
          (testing "the command encrypts everything and writes the sentinel"
            (enable-encryption!)
            (is (encryption/decryptable-string? (raw-value "encryption-check")))
            (is (encryption/decryptable-string? (raw-value "enable-encryption-test-setting")))
            (is (= "plain value" (t2/select-one-fn :value :model/Setting :key "enable-encryption-test-setting")))
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

(deftest enable-encryption!-does-not-trip-the-read-only-mode-guard-test
  (testing "enabling encryption on an instance set up without a key survives the cloud-migration guard reading `read-only-mode` through an empty settings cache"
    (encryption-test/with-secret-key nil
      (mt/with-temp-empty-app-db [_conn :h2]
        (mdb/setup-db! :create-sample-content? true)
        (setting/set! :admin-email "admin@example.com")
        (is (= "admin@example.com" (raw-value "admin-email")))
        (encryption-test/with-secret-key "key1"
          (mt/with-dynamic-fn-redefs [setting.cache/restore-cache-if-needed! restore-cache-now!]
            (enable-encryption!))
          (is (encryption/decryptable-string? (raw-value "admin-email")))
          (is (= "admin@example.com" (t2/select-one-fn :value :model/Setting :key "admin-email"))))))))
