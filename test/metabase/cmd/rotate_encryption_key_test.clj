(ns metabase.cmd.rotate-encryption-key-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.cmd :as cmd]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [metabase.cmd.rotate-encryption-key :refer [rotate-encryption-key!]]
            [metabase.cmd.test-util :as cmd.test-util]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.models :refer [Database Setting]]
            [metabase.models.interface :as interface]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.util.encryption :as encrypt]
            [metabase.util.encryption-test :as eu]
            [toucan.db :as db]
            [toucan.models :as models]))

(defn do-with-model-type
  [mtype in-type-fns f]
  (let [type-fns        (var-get #'models/type-fns)
        before-type-fns @type-fns]
    (swap! type-fns update mtype merge in-type-fns)
    (try
      (f)
      (finally
        (reset! type-fns before-type-fns)))))

(defmacro with-model-type
  [mtype type-fns & body]
  `(do-with-model-type ~mtype ~type-fns (fn [] ~@body)))

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

(defn- raw-value [keyy]
  (:value (first (jdbc/query mdb.connection/*jdbc-spec*
                             ["select value from setting where setting.key=?;" keyy]))))

(deftest cmd-rotate-encryption-key-errors-when-failed-test
  (with-redefs [rotate-encryption-key! #(throw "err")
                cmd/system-exit! identity]
    (is (= 1 (cmd/rotate-encryption-key
              "89ulvIGoiYw6mNELuOoEZphQafnF/zYe+3vT+v70D1A=")))))

(deftest rotate-encryption-key!-test
  ;; (metabase.test/set-test-drivers! #{:mysql})
  (eu/with-secret-key nil
    (let [h2-fixture-db-file @cmd.test-util/fixture-db-file-path
          db-name            (str "test_" (str/lower-case (mt/random-name)))
          original-timestamp "2021-02-11 18:38:56.042236+00"
          [k1 k2 k3]         ["89ulvIGoiYw6mNELuOoEZphQafnF/zYe+3vT+v70D1A="
                              "yHa/6VEQuIItMyd5CNcgV9nXvzZcX6bWmiY0oOh6pLU="
                              "BCQbKNVu6N8TQ2BwyTC0U0oCBqsvFVr2uhEM/tRgJUM="]]
      (mt/test-drivers #{:postgres :h2 :mysql}
        (with-model-type :encrypted-json {:out #'interface/encrypted-json-out}
          (binding [mdb.connection/*db-type*   driver/*driver*
                    mdb.connection/*jdbc-spec* (persistent-jdbcspec driver/*driver* db-name)
                    db/*db-connection*         (persistent-jdbcspec driver/*driver* db-name)
                    db/*quoting-style*         driver/*driver*]
            (when-not (= driver/*driver* :h2)
              (tx/create-db! driver/*driver* {:database-name db-name}))
            (load-from-h2/load-from-h2! h2-fixture-db-file)
            (db/insert! Setting {:key "nocrypt", :value "unencrypted value"})
            (db/insert! Setting {:key "settings-last-updated", :value original-timestamp})
            (eu/with-secret-key k1
              (db/insert! Setting {:key "k1crypted", :value "encrypted with k1"})
              (db/update! Database 1 {:details "{\"db\":\"/tmp/test.db\"}"}))

            (testing "rotating with the same key is a noop"
              (eu/with-secret-key k1
                (rotate-encryption-key! k1)
                ;; plain->newkey
                (testing "for unencrypted values"
                  (is (not= "unencrypted value" (raw-value "nocrypt")))
                  (is (= "unencrypted value" (db/select-one-field :value Setting :key "nocrypt"))))
                ;; samekey->samekey
                (testing "for values encrypted with the same key"
                  (is (not= "encrypted with k1" (raw-value "k1crypted")))
                  (is (= "encrypted with k1" (db/select-one-field :value Setting :key "k1crypted"))))))

            (testing "settings-last-updated is updated AND plaintext"
              (is (not= original-timestamp (raw-value "settings-last-updated")))
              (is (not (encrypt/possibly-encrypted-string? (raw-value "settings-last-updated")))))

            (testing "rotating with a new key is recoverable"
              (eu/with-secret-key k1 (rotate-encryption-key! k2))
              (testing "with new key"
                (eu/with-secret-key k2
                  (is (= "unencrypted value" (db/select-one-field :value Setting :key "nocrypt")))
                  (is (= {:db "/tmp/test.db"} (db/select-one-field :details Database :id 1)))))
              (testing "but not with old key"
                (eu/with-secret-key k1
                  (is (not= "unencrypted value" (db/select-one-field :value Setting :key "nocrypt")))
                  (is (not= "{\"db\":\"/tmp/test.db\"}" (db/select-one-field :details Database :id 1))))))

            (testing "full rollback when a database details looks encrypted with a different key than the current one"
              (eu/with-secret-key k3
                (db/insert! Database {:name "k3", :engine :mysql, :details "{\"db\":\"/tmp/k3.db\"}"}))
              (eu/with-secret-key k2
                (db/insert! Database {:name "k2", :engine :mysql, :details "{\"db\":\"/tmp/k2.db\"}"})
                (is (thrown? clojure.lang.ExceptionInfo (rotate-encryption-key! k3))))
              (eu/with-secret-key k3
                (is (not= {:db "/tmp/k2.db"} (db/select-one-field :details Database :name "k2")))
                (is (= {:db "/tmp/k3.db"} (db/select-one-field :details Database :name "k3")))))

            (testing "rotate-encryption-key! to nil decrypts the encrypted keys"
              (db/update! Database 1 {:details "{\"db\":\"/tmp/test.db\"}"})
              (db/update-where! Database {:name "k3"} :details "{\"db\":\"/tmp/test.db\"}")
              (eu/with-secret-key k2
                (rotate-encryption-key! nil))
              (is (= "unencrypted value" (raw-value "nocrypt"))))

            (testing "short keys fail to rotate"
              (is (thrown? Throwable (rotate-encryption-key! "short"))))))))))
