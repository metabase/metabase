(ns metabase.cmd.load-and-dump-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase.cmd.compare-h2-dbs :as compare-h2-dbs]
            [metabase.cmd.copy.h2 :as h2]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [metabase.cmd.refresh-integration-test-db-metadata :as refresh]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.setup :as mdb.setup]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.models.setting :as setting]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.test.generate :as mtg]
            [metabase.util.i18n.impl :as i18n.impl]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn populate-h2-db! [h2-file]
  (let [spec {:subprotocol "h2"
              :subname     (format "file:%s" h2-file)
              :classname   "org.h2.Driver"}]
    (binding [mdb.connection/*db-type*   :h2
              mdb.connection/*jdbc-spec* spec
              db/*db-connection*         spec
              db/*quoting-style*         (mdb.connection/quoting-style :h2)
              setting/*disable-cache*    true]
      (with-redefs [i18n.impl/site-locale-from-setting-fn (atom (constantly false))]
        (refresh/refresh-integration-test-db-metadata)
        (mdb.setup/setup-db! :h2 spec true)
        (mtg/generate-data!)))))

(defn- abs-path
  [path]
  (.getAbsolutePath (io/file path)))

(defn copy-db-file [source-path dest-path]
  (io/copy (io/file (str source-path ".mv.db"))
           (io/file (str dest-path   ".mv.db"))))

(deftest load-and-dump-test
  (testing "loading data to h2 and porting to DB and migrating back to H2"
    (let [h2-fixture-db-file (abs-path "frontend/test/__runner__/test_db_fixture.db")
          h2-fixture-tmp-file (java.io.File/createTempFile "test_db_fixture" ".db")
          h2-file            (abs-path "/tmp/out.db")
          db-name            "dump-test"]
      (copy-db-file h2-fixture-db-file h2-fixture-tmp-file)
      (populate-h2-db! h2-fixture-tmp-file)
      (mt/test-drivers #{:h2 :postgres}
        (h2/delete-existing-h2-database-files! h2-file)
        (binding [mdb.connection/*db-type*   driver/*driver*
                  mdb.connection/*jdbc-spec* (if (= driver/*driver* :h2)
                                               {:subprotocol "h2"
                                                :subname     (format "mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))
                                                :classname   "org.h2.Driver"}
                                               (let [details (tx/dbdef->connection-details driver/*driver*
                                                                                           :db {:database-name db-name})]
                                                 ((case driver/*driver*
                                                    :postgres db.spec/postgres
                                                    :mysql    db.spec/mysql) details)))]
          (when-not (= driver/*driver* :h2)
            (tx/create-db! driver/*driver* {:database-name db-name}))
          (load-from-h2/load-from-h2! h2-fixture-tmp-file)
          (dump-to-h2/dump-to-h2! h2-file)
          (is (not (compare-h2-dbs/different-contents?
                    h2-file
                    h2-fixture-tmp-file))))))))
