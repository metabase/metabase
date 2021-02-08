(ns metabase.db.env-test
  (:require [clojure.test :refer :all]
            [metabase.db.env :as mdb.env]))

(deftest connection-string-or-spec->db-type-test
  (doseq [[subprotocol expected] {"postgres"   :postgres
                                  "postgresql" :postgres
                                  "mysql"      :mysql
                                  "h2"         :h2}
          protocol               [subprotocol (str "jdbc:" subprotocol)]
          url                    [(str protocol "://abc")
                                  (str protocol ":abc")
                                  (str protocol ":cam@localhost/my_db?password=123456")
                                  (str protocol "://localhost/my_db")]]
    (testing (pr-str (list 'connection-string-or-spec->db-type url))
      (is (= expected
             (#'mdb.env/connection-string-or-spec->db-type url)))))
  (testing "Should throw an Exception for an unsupported subprotocol"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Unsupported application database type: \"sqlserver\""
         (#'mdb.env/connection-string-or-spec->db-type "jdbc:sqlserver://bad"))))
  (testing "Finds type from jdbc-spec"
    (let [spec {:password "password",
                :characterSetResults "UTF8",
                :characterEncoding "UTF8",
                :type :mysql,
                :classname "org.mariadb.jdbc.Driver",
                :subprotocol "mysql",
                :useSSL false,
                :zeroDateTimeBehavior "convertToNull",
                :user "foo",
                :subname "//172.17.0.2:3306/metabase",
                :useCompression true,
                :useUnicode true}]
      (is (= :mysql (#'mdb.env/connection-string-or-spec->db-type spec))))))

(deftest ensure-jdbc-protocol-test
  (let [conn-uri "postgresql://localhost:metabase?username=johndoe"
        jdbc-conn-uri (str "jdbc:" conn-uri)]
    (doseq [[input expected] [[conn-uri jdbc-conn-uri]
                              [jdbc-conn-uri jdbc-conn-uri]
                              [nil nil]]]
      (is (= expected (#'mdb.env/ensure-jdbc-protocol input))))))

(deftest old-password-style?-test
  (are [old? conn-uri] (is (= old? (#'mdb.env/old-password-style? conn-uri)))
    false  "mysql://foo@172.17.0.2:3306/metabase?password=password"
    true "mysql://foo:password@172.17.0.2:3306/metabase"))

(deftest connection-from-jdbc-string-test
  (testing "handles old style just fine"
    (let [conn-uri "mysql://foo@172.17.0.2:3306/metabase?password=password"]
      (is (= (str "jdbc:" conn-uri)
             (#'mdb.env/connection-from-jdbc-string conn-uri)))))
  (testing "When using old-style passwords parses and returns jdbc specs"
    (let [conn-uri "mysql://foo:password@172.17.0.2:3306/metabase"]
      (is (= {:classname   "org.mariadb.jdbc.Driver"
              :subprotocol "mysql"
              :subname     "//172.17.0.2:3306/metabase"
              :type        :mysql
              :user        "foo"
              :password    "password"
              :dbname      "metabase"}
             (#'mdb.env/connection-from-jdbc-string conn-uri)))))
  (testing "handles nil"
    (is (nil? (#'mdb.env/connection-from-jdbc-string nil)))))
