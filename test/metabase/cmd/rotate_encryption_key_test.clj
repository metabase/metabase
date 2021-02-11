(ns metabase.cmd.rotate-encryption-key-test
  (:require [clojure.java.io :as io]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.cmd :as cmd]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [metabase.cmd.rotate-encryption-key :refer [rotate-encryption-key!]]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.models :refer [Database Setting]]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.util.encryption :as encrypt]
            [metabase.util.encryption-test :as eu]
            [toucan.db :as db]))

(defn- persistent-jdbcspec
  "Return a jdbc spec for the specified `db-type` on the db `db-name`. In case of H2, makes the connection persistent
  10secs to give us time to fetch the results later."
  [db-type db-name]
  (case db-type
    :h2 {:subprotocol "h2"
         :subname     (format "mem:%s;DB_CLOSE_DELAY=10" db-name)
         :classname   "org.h2.Driver"}
    :postgres (db.spec/postgres (tx/dbdef->connection-details :postgres :db {:database-name db-name}))
    :mysql (db.spec/mysql (tx/dbdef->connection-details :mysql :db {:database-name db-name}))))

(defn- abs-path
  [path]
  (.getAbsolutePath (io/file path)))

(defn- raw-value [key]
  (:value (first (jdbc/query mdb.connection/*jdbc-spec*
                             ["select value from setting where setting.key=?;" key]))))

(deftest cmd-rotate-encryption-key-errors-when-failed-test
  (with-redefs [rotate-encryption-key! #(throw "err")
                cmd/system-exit! identity]
    (is (= 1 (cmd/rotate-encryption-key
              "89ulvIGoiYw6mNELuOoEZphQafnF/zYe+3vT+v70D1A=")))))

(deftest rotate-encryption-key!-test
  ;; (metabase.test.data.env/set-test-drivers! #{:mysql})
  (eu/with-secret-key nil
    (let [h2-fixture-db-file (abs-path "frontend/test/__runner__/test_db_fixture.db")
          db-name (str "test_" (str/lower-case (mt/random-name)))
          original-timestamp  "2021-02-11 18:38:56.042236+00"
          [k1 k2 k3] ["89ulvIGoiYw6mNELuOoEZphQafnF/zYe+3vT+v70D1A="
                      "yHa/6VEQuIItMyd5CNcgV9nXvzZcX6bWmiY0oOh6pLU="
                      "BCQbKNVu6N8TQ2BwyTC0U0oCBqsvFVr2uhEM/tRgJUM="]]
      (mt/test-drivers #{:postgres :h2 :mysql}
        (with-redefs [metabase.models.interface/cached-encrypted-json-out #'metabase.models.interface/encrypted-json-out]
          (binding [mdb.connection/*db-type*   driver/*driver*
                   mdb.connection/*jdbc-spec* (persistent-jdbcspec driver/*driver* db-name)
                   db/*db-connection* (persistent-jdbcspec driver/*driver* db-name)
                   db/*quoting-style* driver/*driver*]
           (when-not (= driver/*driver* :h2)
             (tx/create-db! driver/*driver* {:database-name db-name}))
           (load-from-h2/load-from-h2! h2-fixture-db-file)
           (db/insert! Setting {:key "setting0", :value "val0"})
           (db/insert! Setting {:key "settings-last-updated", :value original-timestamp})
           (eu/with-secret-key k1
             (db/insert! Setting {:key "setting1", :value "val1"})
             (db/update! Database 1 {:details "{\"db\":\"/tmp/test.db\"}"}))

           (testing "rotating with the same key is a noop"
             (eu/with-secret-key k1
               (rotate-encryption-key! k1)
               ;; plain->newkey
               (is (not (= "val0" (raw-value "setting0"))))
               (is (= "val0" (db/select-one-field :value Setting :key "setting0")))
               ;; oldkey->newkey
               (is (not (= "val1" (raw-value "setting1"))))
               (is (= "val1" (db/select-one-field :value Setting :key "setting1")))))

           (testing "settings-last-updated is updated AND plaintext"
             (is (not (= original-timestamp (raw-value "settings-last-updated"))))
             (is (not (encrypt/possibly-encrypted-string? (raw-value "settings-last-updated")))))

           (testing "rotating with a new key is recoverable"
             (eu/with-secret-key k1 (rotate-encryption-key! k2))
             (eu/with-secret-key k2
               (is (= "val0" (db/select-one-field :value Setting :key "setting0")))
               (is (= {:db "/tmp/test.db"} (db/select-one-field :details Database :id 1))))
             (eu/with-secret-key k1
               (is (not (= "val0" (db/select-one-field :value Setting :key "setting0"))))
               (is (not (= "{\"db\":\"/tmp/test.db\"}" (db/select-one-field :details Database :id 1))))))

           (testing "full rollback when a setting looks encrypted with a different key than the current one"
             (eu/with-secret-key k3
               (db/insert! Setting {:key "setting3", :value "val3"}))
             (eu/with-secret-key k2
               (db/insert! Setting {:key "setting2", :value "val2"})
               (is (thrown? Throwable (rotate-encryption-key! k3))))
             (eu/with-secret-key k3
               (is (not (= "val2" (:value (first (db/select Setting :key [:= "setting2"]))))))
               (is (= "val3" (:value (first (db/select Setting :key [:= "setting3"])))))))

           (testing "full rollback when a database looks encrypted with a different key than the current one"
             (eu/with-secret-key k3
               (db/update! Database 1 {:details "{\"db\":\"/tmp/test.db\"}"}))
             (eu/with-secret-key k2
               (is (thrown? Throwable (rotate-encryption-key! k3))))
             (eu/with-secret-key k3
               (is (= {:db "/tmp/test.db"} (db/select-one-field :details Database :id 1)))))

           (testing "rotate-encryption-key! to nil decrypts the encrypted keys"
             (db/delete! Setting :key "setting3")
             (db/update! Database 1 {:details "{\"db\":\"/tmp/test.db\"}"})
             (eu/with-secret-key k2
               (rotate-encryption-key! nil))
             (is (= "val0" (raw-value "setting0"))))

           (testing "short keys fail to rotate"
             (is (thrown? Throwable (rotate-encryption-key! "short"))))))))))
