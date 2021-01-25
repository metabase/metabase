(ns metabase.cmd.rotate-encryption-key-test
  (:require [clojure.java.io :as io]
            [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [metabase.cmd.rotate-encryption-key :refer [rotate-keys!]]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.models :refer [Database Setting]]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
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
  (:value (first (jdbc/query mdb.connection/*jdbc-spec* "select value from setting where key LIKE '';"))))

(deftest rotate-keys!-test
  (let [h2-fixture-db-file (abs-path "frontend/test/__runner__/test_db_fixture.db")
        db-name (str "test_" (mt/random-name))
        [k1 k2 k3] ["89ulvIGoiYw6mNELuOoEZphQafnF/zYe+3vT+v70D1A="
                    "yHa/6VEQuIItMyd5CNcgV9nXvzZcX6bWmiY0oOh6pLU="
                    "BCQbKNVu6N8TQ2BwyTC0U0oCBqsvFVr2uhEM/tRgJUM="]]
    (mt/test-drivers #{:mysql :postgres :h2}
      (binding [mdb.connection/*db-type*   driver/*driver*
                mdb.connection/*jdbc-spec* (persistent-jdbcspec driver/*driver* db-name)
                db/*db-connection* (persistent-jdbcspec driver/*driver* db-name)
                db/*quoting-style* driver/*driver*]
        (when-not (= driver/*driver* :h2)
          (tx/create-db! driver/*driver* {:database-name db-name}))
        (load-from-h2/load-from-h2! h2-fixture-db-file)
        (db/insert! Setting {:key "setting0", :value "val0"})
        (eu/with-secret-key k1
          (db/insert! Setting {:key "setting1", :value "val1"})
          (db/update! Database 1 {:details "{\"db\":\"/tmp/test.db\"}"}))

        (testing "rotating with the same key is a noop"
          (eu/with-secret-key k1
            (is (rotate-keys! k1))
            ;; plain->newkey
            (is (not (= "val0" (raw-value "setting0"))))
            (is (= "val0" (:value (first (db/select Setting :key [:= "setting0"])))))
            ;; oldkey->newkey
            (is (not (= "val1" (raw-value "setting1"))))
            (is (= "val1" (:value (first (db/select Setting :key [:= "setting1"])))))))

        (testing "rotating with a new key is recoverable"
          (eu/with-secret-key k1 (is (rotate-keys! k2)))
          (eu/with-secret-key k2 (is (= "val0" (:value (first (db/select Setting :key [:= "setting0"]))))))
          (eu/with-secret-key k1
            (is (not (= "val0" (:value (first (db/select Setting :key [:= "setting0"]))))))))

        (testing "full rollback when a field looks encrypted with a differnt key than the current one"
          (eu/with-secret-key k3
            (db/insert! Setting {:key "setting3", :value "val3"}))
          (eu/with-secret-key k2
            (db/insert! Setting {:key "setting4", :value "val4"})
            (is (not (rotate-keys! k3))))
          (eu/with-secret-key k3
            (is (not (= "val4" (:value (first (db/select Setting :key [:= "setting4"]))))))
            (is (= "val3" (:value (first (db/select Setting :key [:= "setting3"])))))))))))
