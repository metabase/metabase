(ns metabase.db.env-test
  (:require [clojure.test :refer :all]
            [metabase.db.data-source :as mdb.data-source]
            [metabase.db.env :as mdb.env]))

(deftest raw-connection-string->type-test
  (are [s expected] (= expected (#'mdb.env/raw-connection-string->type s))
    "jdbc:postgres:wow"   :postgres
    "postgres:wow"        :postgres
    "jdbc:postgresql:wow" :postgres
    "postgresql:wow"      :postgres))

(deftest connection-string-data-source-test
  (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:postgresql://metabase?user=cam&password=1234")
         (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase?user=cam&password=1234"})
         (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase?user=cam&password=1234", :mb-db-user "", :mb-db-pass ""})))

  (testing "Raw connection string should support separate username and/or password (#20122)"
    (testing "username and password"
      (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:postgresql://metabase" "cam" "1234")
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-user "cam", :mb-db-pass "1234"}))))
    (testing "username only"
      (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:postgresql://metabase" "cam" nil)
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-user "cam"})
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-user "cam", :mb-db-pass ""}))))
    (testing "password only"
      (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:postgresql://metabase" nil "1234")
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-pass "1234"})
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-user  "", :mb-db-pass "1234"}))))))
