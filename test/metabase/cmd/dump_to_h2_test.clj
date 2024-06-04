(ns metabase.cmd.dump-to-h2-test
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.cmd :as cmd]
   [metabase.cmd.copy :as copy]
   [metabase.cmd.copy.h2 :as copy.h2]
   [metabase.cmd.dump-to-h2 :as dump-to-h2]
   [metabase.cmd.load-from-h2 :as load-from-h2]
   [metabase.cmd.test-util :as cmd.test-util]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.test-util :as mdb.test-util]
   [metabase.driver :as driver]
   [metabase.models :refer [Database Setting]]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.i18n.impl :as i18n.impl]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest dump-deletes-target-db-files-tests
  ;; test fails when the application db is anything but H2 presently
  ;; TODO: make this test work with postgres / mysql / mariadb
  (mt/with-temp-file [tmp-h2-db "mbtest_dump.h2"
                      tmp-h2-db-mv "mbtest_dump.h2.mv.db"]
    (let [h2-file-dump-content "H:2,block:61,blockSize:1000,chunk:7,clean:1,created:18e17379d42,format:2,version:7"
          file-contents        {tmp-h2-db    h2-file-dump-content
                                tmp-h2-db-mv h2-file-dump-content}]
      ;; 1. Don't actually run the copy steps themselves or the flush
      (mt/with-dynamic-redefs [copy/copy!    (constantly nil)
                               jdbc/execute! (constantly nil)]
        (doseq [[filename contents] file-contents]
          (spit filename contents))
        (dump-to-h2/dump-to-h2! tmp-h2-db)

        (doseq [filename (keys file-contents)]
          (testing (str filename " was deleted")
            (is (false? (.exists (io/file filename))))))))))

(deftest cmd-dump-to-h2-returns-code-from-dump-test
  (with-redefs [dump-to-h2/dump-to-h2! #(throw (Exception. "err"))
                cmd/system-exit! identity]
    (is (= 1 (cmd/dump-to-h2 "file1")))))

(defn persistent-data-source
  "Return a jdbc spec for the specified `db-type` on the db `db-name`. In case of H2, makes the connection persistent
  10secs to give us time to fetch the results later."
  ^javax.sql.DataSource [db-type db-name]
  (let [spec (if (= db-type :h2)
               {:subprotocol "h2"
                :subname     (format "mem:%s;DB_CLOSE_DELAY=10" db-name)
                :classname   "org.h2.Driver"}
               (mdb/spec db-type (tx/dbdef->connection-details db-type :db {:database-name db-name})))]
    (mdb.test-util/->ClojureJDBCSpecDataSource spec)))

(deftest dump-to-h2-dump-plaintext-test
  (testing "dump-to-h2 --dump-plaintext"
    (let [h2-fixture-db-file @cmd.test-util/fixture-db-file-path
          db-name            (str "test_" (mt/random-name))]
      (mt/with-temp-file [h2-file-plaintext   (format "out-%s.db" (mt/random-name))
                          h2-file-enc         (format "out-%s.db" (mt/random-name))
                          h2-file-default-enc (format "out-%s.db" (mt/random-name))]
        (mt/test-drivers #{:h2 :postgres :mysql}
          (with-redefs [i18n.impl/site-locale-from-setting (constantly nil)]
            (binding [config/*disable-setting-cache*  true
                      mdb.connection/*application-db* (mdb.connection/application-db
                                                       driver/*driver*
                                                       (persistent-data-source driver/*driver* db-name))]
              (when-not (= driver/*driver* :h2)
                (tx/create-db! driver/*driver* {:database-name db-name}))
              (binding [copy/*copy-h2-database-details* true]
                (load-from-h2/load-from-h2! h2-fixture-db-file)
                (encryption-test/with-secret-key "89ulvIGoiYw6mNELuOoEZphQafnF/zYe+3vT+v70D1A="
                  (t2/insert! Setting {:key "my-site-admin", :value "baz"})
                  (t2/update! Database 1 {:details {:db "/tmp/test.db"}})
                  (dump-to-h2/dump-to-h2! h2-file-plaintext {:dump-plaintext? true})
                  (dump-to-h2/dump-to-h2! h2-file-enc {:dump-plaintext? false})
                  (dump-to-h2/dump-to-h2! h2-file-default-enc)))

              (testing "decodes settings and dashboard.details"
                (with-open [target-conn (.getConnection (copy.h2/h2-data-source h2-file-plaintext))]
                  (is (= "baz" (:value (first (jdbc/query {:connection target-conn}
                                                          "select \"VALUE\" from SETTING where \"KEY\"='my-site-admin';")))))
                  (is (= "{\"db\":\"/tmp/test.db\"}"
                         (:details (first (jdbc/query {:connection target-conn}
                                                      "select details from metabase_database where id=1;")))))))

              (testing "when flag is set to false, encrypted settings and dashboard.details are still encrypted"
                (with-open [target-conn (.getConnection (copy.h2/h2-data-source h2-file-enc))]
                  (is (not (= "baz"
                              (:value (first (jdbc/query {:connection target-conn}
                                                         "select \"VALUE\" from SETTING where \"KEY\"='my-site-admin';"))))))
                  (is (not (= "{\"db\":\"/tmp/test.db\"}"
                              (:details (first (jdbc/query {:connection target-conn}
                                                           "select details from metabase_database where id=1;"))))))))

              (testing "defaults to not decrypting"
                (with-open [target-conn (.getConnection (copy.h2/h2-data-source h2-file-default-enc))]
                  (is (not (= "baz"
                              (:value (first (jdbc/query {:connection target-conn}
                                                         "select \"VALUE\" from SETTING where \"KEY\"='my-site-admin';"))))))
                  (is (not (= "{\"db\":\"/tmp/test.db\"}"
                              (:details (first (jdbc/query {:connection target-conn}
                                                           "select details from metabase_database where id=1;")))))))))))))))
