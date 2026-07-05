(ns metabase.search.appdb.table-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.table :as search.table]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (org.h2.jdbc JdbcSQLSyntaxErrorException)
   (org.postgresql.util PSQLException PSQLState)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest gen-table-name-test
  (testing "generates a unique, prefixed, dash-free table name"
    (let [a (search.table/gen-table-name)
          b (search.table/gen-table-name)]
      (is (str/starts-with? (name a) "search_index__"))
      (is (not= a b) "two calls produce distinct names")
      (is (not (str/includes? (name a) "-")) "nano-id dashes are replaced with underscores")))
  (testing "an optional suffix is appended (used to mark temp tables)"
    (is (str/ends-with? (name (search.table/gen-table-name "_temp")) "_temp"))))

(deftest table-not-found-exception?-test
  (testing "true when the cause is a driver missing-table error"
    (is (true? (search.table/table-not-found-exception?
                (ex-info "wrapped" {} (PSQLException. "relation does not exist" PSQLState/UNDEFINED_TABLE)))))
    (is (true? (search.table/table-not-found-exception?
                (ex-info "wrapped" {} (JdbcSQLSyntaxErrorException. "Table not found" "" "" 42102 nil ""))))))
  (testing "false for unrelated errors"
    (is (false? (search.table/table-not-found-exception? (ex-info "no cause" {}))))
    (is (false? (search.table/table-not-found-exception? (ex-info "wrapped" {} (RuntimeException. "boom")))))))

(deftest create-exists-drop-roundtrip-test
  ;; create-table! dispatches into the appdb specialization, which is only implemented for the DBs that
  ;; support the appdb search index (postgres + h2); on mysql/mariadb there is no method.
  (when (#{:postgres :h2} (mdb/db-type))
    (testing "a created table is detected by exists? and gone after drop-table!"
      (let [tbl (search.table/gen-table-name "_temp")]
        (try
          (is (false? (boolean (search.table/exists? tbl))) "absent before creation")
          (search.table/create-table! tbl)
          (is (true? (boolean (search.table/exists? tbl))) "present after creation")
          ;; the table is real and writable: it has the base columns
          (is (= 0 (t2/count tbl)))
          (finally
            (#'search.table/drop-table! tbl)))
        (is (false? (boolean (search.table/exists? tbl))) "absent after drop")))))

(deftest exists?-nil-test
  (testing "exists? on nil is falsey without hitting the DB"
    (is (not (search.table/exists? nil)))))
