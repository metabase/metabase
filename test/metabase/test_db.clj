(ns metabase.test_db
  (:require [metabase.db :refer :all]
            [clojure.java.jdbc :as jdbc]
            [expectations :refer :all]
            [korma.core :refer :all]))


(def testdb-jdbc {:subprotocol "h2"
                  :subname (str db-file ";DATABASE_TO_UPPER=FALSE")})


; create a simple sample table
(jdbc/execute! testdb-jdbc
  ["drop table if exists del_test"])
(jdbc/execute! testdb-jdbc
  ["create table del_test(id int)"])

(defentity DelTest
  (table :del_test))

(defn count-rows []
  (some-> (jdbc/query testdb-jdbc ["select count(*) as cnt from del_test"] :row-fn :cnt) first))

; insert a value and make sure its there
(expect [nil] (jdbc/insert! testdb-jdbc :del_test {:id 1}))
(expect 1 (count-rows))

; call del function and validate result was true
(expect nil (del DelTest :id 1))

; make sure value was removed
(expect 0 (count-rows))
