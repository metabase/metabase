(ns metabase.cmd.remove-encryption-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.cmd :as cmd]
   [metabase.cmd.remove-encryption :refer [remove-encryption!]]
   [metabase.db :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- raw-value [data-source keyy]
  (-> (jdbc/query {:connection data-source}
                  ["select \"VALUE\" from setting where setting.\"KEY\"=?;" keyy])
      first
      :value))

(deftest cmd-remove-encryption-errors-when-failed-test
  (with-redefs [remove-encryption! #(throw (Exception. "err"))
                cmd/system-exit! identity]
    (is (= 1 (cmd/remove-encryption)))))

(deftest remove-encryption!-test
  (testing "removing encryption"
    (encryption-test/with-secret-key "key1"
      (mt/with-temp-empty-app-db [_conn :h2]
        (mdb/setup-db! :create-sample-content? true)
        (t2/insert! :model/Setting {:key "test-setting", :value "unencrypted value"})

        (is (encryption/possibly-encrypted-string? (raw-value _conn "encryption-check")))
        (is (encryption/possibly-encrypted-string? (raw-value _conn "test-setting")))
        (remove-encryption!)
        (is (= "unencrypted" (raw-value _conn "encryption-check")))
        (is (not (encryption/possibly-encrypted-string? (raw-value _conn "test-setting"))))))))
