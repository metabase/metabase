(ns metabase.api.testing-test
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.api.testing :as testing]
   [metabase.db :as mdb]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(deftest snapshot-test
  (when (= (mdb/db-type) :h2)
    (let [snapshot-name (mt/random-name)]
      (testing "Just make sure the snapshot endpoint doesn't crash."
        (let [file (io/file (#'testing/snapshot-path-for-name snapshot-name))]
          (try
            (is (= nil
                   (mt/user-http-request :rasta :post 204 (format "testing/snapshot/%s" snapshot-name))))
            (testing (format "File %s should have been created" (str file))
              (is (.exists file)))
            (finally
              (.delete file))))))))

(deftest restore-test
  (when (= (mdb/db-type) :h2)
    (testing "Should throw Exception if file does not exist"
      (is (= "Not found."
             (mt/user-http-request :rasta :post 404 (format "testing/restore/%s" (mt/random-name))))))))

(deftest e2e-test
  (when (= (mdb/db-type) :h2)
    (testing "Should be able to snapshot & restore stuff"
      (let [snapshot-name (munge (u/qualified-name ::test-snapshot))]
        (try
          (is (= nil
                 (mt/user-http-request :rasta :post 204 (format "testing/snapshot/%s" snapshot-name))))
          (is (= nil
                 (mt/user-http-request :rasta :post 204 (format "testing/restore/%s" snapshot-name))))
          (finally
            (.delete (io/file (#'testing/snapshot-path-for-name snapshot-name)))))))))

(deftest snapshot-restore-works-with-views
  ;; workaround for https://github.com/h2database/h2database/issues/3942, see comment in
  ;; `restore-app-db-from-snapshot!` for more details
  (let [snapshot-name (str (random-uuid))]
    (mt/with-temp-empty-app-db [_conn :h2]
      (jdbc/execute! {:datasource (mdb/app-db)} ["create table test_table (a int)"])
      (jdbc/execute! {:datasource (mdb/app-db)} ["insert into test_table (a) values (1)"])
      (jdbc/execute! {:datasource (mdb/app-db)} ["create or replace view test_view as select a from test_table"])
      (jdbc/execute! {:datasource (mdb/app-db)} ["alter table test_table add column b int"])
      (#'testing/save-snapshot! snapshot-name))
    (mt/with-temp-empty-app-db [_conn :h2]
      (#'testing/restore-snapshot! snapshot-name)
      (is (= [{:a 1}] (jdbc/query {:datasource (mdb/app-db)} ["select a from test_view"]))))))
