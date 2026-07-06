(ns metabase.app-db.env-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.env :as mdb.env]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

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

(defn- jdbc-driver-registered?
  "Whether a `java.sql.Driver` of the given `classname` is currently registered with DriverManager."
  [classname]
  (boolean (some #(= classname (.getName (class %)))
                 (enumeration-seq (java.sql.DriverManager/getDrivers)))))

(deftest register-app-db-driver!-test
  (testing "loads the app-DB JDBC driver class so it self-registers with DriverManager"
    (#'mdb.env/register-app-db-driver! :postgres)
    (is (jdbc-driver-registered? "org.postgresql.Driver")))
  (testing "a db-type with no mapping is a no-op"
    (is (nil? (#'mdb.env/register-app-db-driver! :not-a-real-db-type)))))

(deftest env->DataSource-registers-driver-test
  (testing (str "building the app-DB DataSource registers its JDBC driver explicitly, so app-DB "
                "connectivity does not depend on DriverManager's ServiceLoader enumeration succeeding")
    (#'mdb.env/env->DataSource :postgres {:mb-db-host   "localhost"
                                          :mb-db-port   5432
                                          :mb-db-dbname "metabase"
                                          :mb-db-user   "u"})
    (is (jdbc-driver-registered? "org.postgresql.Driver"))))
