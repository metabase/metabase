(ns metabase.test_db
  (:require [metabase.db :refer :all]
            [clojure.java.jdbc :as jdbc]
            [expectations :refer :all]
            [korma.core :refer :all]))


(def testdb-jdbc {:subprotocol "h2"
                  :subname (str db-file)})


; create a simple sample table
;(jdbc/execute! testdb-jdbc
;  ["drop table if exists del_test"])
;(jdbc/execute! testdb-jdbc
;  ["create table del_test(id int, foobar varchar(50))"])
;
;(defentity DelTest
;  (table :del_test))
;
;(defn count-rows []
;  (some-> (jdbc/query testdb-jdbc ["select count(*) as cnt from del_test"] :row-fn :cnt) first))
;
;; insert a value and make sure its there
;(expect [nil] (jdbc/insert! testdb-jdbc :del_test {:id 1
;                                                   :foobar "something"}))
;(expect 1 (count-rows))
;(expect "something" (some-> (jdbc/query testdb-jdbc ["select foobar from del_test"] :row-fn :foobar) first))
;
;; call upd function and validate result was true
;(expect true (upd DelTest 1 :foobar "modified"))
;
;; validate our row was modified
;(expect "modified" (some-> (jdbc/query testdb-jdbc ["select foobar from del_test"] :row-fn :foobar) first))
;
;; call del function
;(expect nil (del DelTest :id 1))
;
;; make sure value was removed
;(expect 0 (count-rows))
