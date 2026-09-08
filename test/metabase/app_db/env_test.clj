(ns metabase.app-db.env-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.env :as mdb.env]
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

(deftest audit-read-data-source-test
  (let [app-db-env {:mb-db-host "localhost", :mb-db-port 5432, :mb-db-dbname "metabase"
                    :mb-db-user "metabase", :mb-db-pass "app-pass"}
        default    (mdb.data-source/broken-out-details->DataSource
                    :postgres {:host "localhost", :port 5432, :db "metabase"
                               :user "metabase", :password "app-pass"})]
    (testing "with no audit-read identity configured, usage analytics uses the app-DB data source"
      (is (identical? default
                      (#'mdb.env/env->audit-read-DataSource :postgres app-db-env default))))
    (testing "MB_DB_AUDIT_READ_USER/PASS swap only the identity; host, port and database are inherited"
      (is (= (mdb.data-source/broken-out-details->DataSource
              :postgres {:host "localhost", :port 5432, :db "metabase", :ssl-cert nil
                         :user "metabase_audit_read", :password "audit-pass"})
             (#'mdb.env/env->audit-read-DataSource
              :postgres
              (assoc app-db-env
                     :mb-db-audit-read-user "metabase_audit_read"
                     :mb-db-audit-read-pass "audit-pass")
              default))))
    (testing "the same identity swap applies to a connection URI, so AWS IAM URL rewriting is not bypassed"
      (is (= (mdb.data-source/raw-connection-string->DataSource
              "jdbc:postgresql://localhost:5432/metabase" "metabase_audit_read" "audit-pass" nil true)
             (#'mdb.env/env->audit-read-DataSource
              :postgres
              {:mb-db-connection-uri   "postgres://localhost:5432/metabase"
               :mb-db-user             "metabase"
               :mb-db-pass             "app-pass"
               :mb-db-aws-iam          true
               :mb-db-audit-read-user  "metabase_audit_read"
               :mb-db-audit-read-pass  "audit-pass"}
              default))))
    (testing "an audit-read user with no password is meaningful -- AWS IAM and Azure supply no password"
      (is (= (mdb.data-source/broken-out-details->DataSource
              :postgres {:host "localhost", :port 5432, :db "metabase", :ssl-cert nil
                         :user "metabase_audit_read", :password nil})
             (#'mdb.env/env->audit-read-DataSource
              :postgres (assoc app-db-env :mb-db-audit-read-user "metabase_audit_read") default))))
    (testing "H2 has no users, so an audit-read identity can't apply"
      (is (identical? default
                      (#'mdb.env/env->audit-read-DataSource
                       :h2 (assoc app-db-env :mb-db-audit-read-user "metabase_audit_read") default))))))
