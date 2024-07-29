(ns metabase.db.env-test
  (:require
   [clojure.test :refer :all]
   [metabase.db.data-source :as mdb.data-source]
   [metabase.db.env :as mdb.env]
   [metabase.test :as mt]))

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
      (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:postgresql://metabase" "cam" "1234" nil)
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-user "cam", :mb-db-pass "1234"}))))
    (testing "username only"
      (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:postgresql://metabase" "cam" nil nil)
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-user "cam"})
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-user "cam", :mb-db-pass ""}))))
    (testing "password only"
      (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:postgresql://metabase" nil "1234" nil)
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-pass "1234"})
             (#'mdb.env/env->DataSource :postgres {:mb-db-connection-uri "postgres://metabase", :mb-db-user  "", :mb-db-pass "1234"}))))))

(deftest env-test
  (testing "default values for host and port"
    (mt/with-temp-env-var-value! [mb-db-host nil
                                  mb-db-port nil]
      (testing ":h2 -- don't supply defaults for host/port"
        (is (partial= {:mb-db-port nil
                       :mb-db-host nil}
                      (#'mdb.env/env* :h2))))
      (testing ":postgres"
        (is (partial= {:mb-db-host "localhost"
                       :mb-db-port 5432}
                      (#'mdb.env/env* :postgres))))
      (testing ":mysql"
        (is (partial= {:mb-db-host "localhost"
                       :mb-db-port 3306}
                      (#'mdb.env/env* :mysql))))
      (testing "Don't override values specified in environment variables with defaults."
        (mt/with-temp-env-var-value! [mb-db-port "3307"]
          (doseq [db-type [:mysql :postgres]]
            (testing db-type
              (is (partial= {:mb-db-port 3307}
                            (#'mdb.env/env* db-type))))))))))
