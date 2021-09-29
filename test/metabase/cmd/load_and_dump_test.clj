(ns metabase.cmd.load-and-dump-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase.cmd.compare-h2-dbs :as compare-h2-dbs]
            [metabase.cmd.copy.h2 :as h2]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [metabase.cmd.test-util :as cmd.test-util]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.models.setting :as setting]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.util.i18n.impl :as i18n.impl]))

(defn- abs-path
  [path]
  (.getAbsolutePath (io/file path)))

(deftest load-and-dump-test
  (testing "Loading of data from h2 to DB and migrating back to H2"
    (let [h2-fixture-db-file @cmd.test-util/fixture-db-file-path
          h2-file            (abs-path "/tmp/out.db")
          db-name            "dump-test"]
      (mt/test-drivers #{:mysql :postgres :h2}
        (h2/delete-existing-h2-database-files! h2-file)
        (binding [setting/*disable-cache*    true
                  mdb.connection/*db-type*   driver/*driver*
                  mdb.connection/*jdbc-spec* (if (= driver/*driver* :h2)
                                               {:subprotocol "h2"
                                                :subname     (format "mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))
                                                :classname   "org.h2.Driver"}
                                               (let [details (tx/dbdef->connection-details driver/*driver*
                                                                                           :db {:database-name db-name})]
                                                 ((case driver/*driver*
                                                    :postgres db.spec/postgres
                                                    :mysql    db.spec/mysql) details)))]
          (with-redefs [i18n.impl/site-locale-from-setting-fn (atom (constantly false))]
            (when-not (= driver/*driver* :h2)
              (tx/create-db! driver/*driver* {:database-name db-name}))
            (load-from-h2/load-from-h2! h2-fixture-db-file)
            (dump-to-h2/dump-to-h2! h2-file)
            (is (not (compare-h2-dbs/different-contents?
                      h2-file
                      h2-fixture-db-file)))))))))
