(ns metabase.app-db.snapshot-test-util.dump-util-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.snapshot-test-util.dump-util :as dump-util]))

(deftest creates-view?-test
  (are [sql expected] (= expected (dump-util/creates-view? sql))
    ;; the forms the dumpers write
    "CREATE VIEW v AS SELECT 1"                                                    true
    "CREATE OR REPLACE VIEW `v` AS SELECT 1"                                       true
    "CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v` AS SELECT 1"                  true
    "  create or replace sql security definer view `v` as select 1"               true
    ;; the other clauses MySQL allows between CREATE and VIEW
    "CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`%` SQL SECURITY INVOKER VIEW v AS" true
    ;; not views
    "CREATE TABLE view_log (id INT)"                                               false
    "INSERT INTO v VALUES ('CREATE VIEW x')"                                       false
    "CREATE MATERIALIZED VIEW v AS SELECT 1"                                       false))

(defn- statements [text]
  (dump-util/lines->statements (str/split-lines text)))

(deftest lines->statements-test
  (testing "statements end on a line ending in a semicolon, which is dropped"
    (is (= ["CREATE TABLE t (\n  id INT\n)" "INSERT INTO t VALUES (1)"]
           (statements "CREATE TABLE t (\n  id INT\n);\nINSERT INTO t VALUES (1);"))))
  (testing "comments, client directives and session settings between statements are dropped"
    (is (= ["INSERT INTO t VALUES (1)"]
           (statements (str "-- dumped by pg_dump\n"
                            "/*!40101 SET NAMES utf8 */;\n"
                            "SET statement_timeout = 0;\n"
                            "SELECT pg_catalog.set_config('search_path', '', false);\n"
                            "\n"
                            "INSERT INTO t VALUES (1);")))))
  (testing "a semicolon at the end of a line inside a string does not end the statement"
    (is (= ["INSERT INTO t VALUES ('a;\nb')"]
           (statements "INSERT INTO t VALUES ('a;\nb');"))))
  (testing "a doubled quote stays inside the string"
    (is (= ["INSERT INTO t VALUES ('it''s;\nfine')"]
           (statements "INSERT INTO t VALUES ('it''s;\nfine');"))))
  (testing "backslash escapes, as MySQL writes them"
    (testing "a backslashed quote stays inside the string"
      (is (= ["INSERT INTO t VALUES ('it\\'s;\nfine')"]
             (statements "INSERT INTO t VALUES ('it\\'s;\nfine');"))))
    (testing "a string ending in an escaped backslash still closes"
      (is (= ["INSERT INTO t VALUES ('C:\\\\')" "INSERT INTO t VALUES (2)"]
             (statements "INSERT INTO t VALUES ('C:\\\\');\nINSERT INTO t VALUES (2);"))))))
