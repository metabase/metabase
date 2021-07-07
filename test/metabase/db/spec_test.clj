(ns metabase.db.spec-test
  (:require [clojure.test :refer :all]
            [metabase.config :as config]
            [metabase.db.spec :as db.spec]))

(defn- default-pg-spec [db]
  {:classname                     "org.postgresql.Driver"
   :subprotocol                   "postgresql"
   :subname                       (format "//localhost:5432/%s" db)
   :OpenSourceSubProtocolOverride true
   :ApplicationName               config/mb-version-and-process-identifier})

(deftest basic-test
  (testing "Basic minimal config"
    (is (= (default-pg-spec "metabase")
           (db.spec/postgres
            {:host "localhost"
             :port 5432
             :db   "metabase"})))))

(deftest defaults-test
  (testing (str "Users that don't specify a `:dbname` (and thus no `:db`) will use the user's default, we should "
                "allow that")
    (is (= (assoc (default-pg-spec "") :dbname nil)
           (db.spec/postgres
            {:host   "localhost"
             :port   5432
             :dbname nil
             :db     nil})))))

(deftest allow-other-nils-test
  (testing "We should be tolerant of other random nil values sneaking through"
    (is (= (assoc (default-pg-spec "") :dbname nil, :somethingrandom nil)
           (db.spec/postgres
            {:host            "localhost"
             :port            nil
             :dbname          nil
             :db              nil
             :somethingrandom nil})))))

(deftest postgres-default-values-test
  (testing "Not specifying any of the values results in defaults"
    (is (= (default-pg-spec "")
           (db.spec/postgres {})))))

(defn- default-mysql-spec [db]
  {:classname                     "org.mariadb.jdbc.Driver"
   :subprotocol                   "mysql"
   :subname                       (format "//localhost:3306/%s" db)})

(deftest mysql-default-port-test
  (testing "Check that we default to port 3306 for MySQL databases, if `:port` is `nil`"
    (is (= (assoc (default-mysql-spec "") :dbname nil)
           (db.spec/mysql
            {:host   "localhost"
             :port   nil
             :dbname nil
             :db     nil})))))
