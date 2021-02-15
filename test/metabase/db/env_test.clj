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

(deftest fixup-connection-string-test
  (let [correct-uri "jdbc:postgresql://localhost:metabase?username=johndoe"]
    (doseq [[input expected-diags expected]
            [["postgres://localhost:metabase?username=johndoe"
              #{:env.info/prepend-jdbc :env.info/change-to-postgresql}
              correct-uri]
             ["jdbc:postgres://localhost:metabase?username=johndoe"
              #{:env.info/change-to-postgresql}
              correct-uri]
             [correct-uri #{} correct-uri]
             [nil nil nil]]]
      (let [{:keys [connection diags]} (#'mdb.env/fixup-connection-string input)]
        (is (= expected connection) input)
        (is (= expected-diags diags) input)))))

(deftest old-credential-style?-test
  (are [old? conn-uri] (is (= old? (#'mdb.env/old-credential-style? conn-uri)) conn-uri)
    false "jdbc:mysql://172.17.0.2:3306/metabase?password=password&user=user"
    false "mysql://172.17.0.2:3306/metabase?password=password&user=user"
    ;; prefixed with jdbc makes an "opaque" URI which doesn't parse
    true  "jdbc:mysql://foo@172.17.0.2:3306/metabase?password=password"
    true  "mysql://foo@172.17.0.2:3306/metabase?password=password"
    true  "mysql://foo:password@172.17.0.2:3306/metabase"))

(deftest connection-from-jdbc-string-test
  (let [parsed {:classname   "org.mariadb.jdbc.Driver"
                :subprotocol "mysql"
                :subname     "//172.17.0.2:3306/metabase"
                :type        :mysql
                :user        "foo"
                :password    "password"
                :dbname      "metabase"}]
    (testing "handles mixed (just password in query params) old style just fine"
      (let [conn-uri "mysql://foo@172.17.0.2:3306/metabase?password=password"]
        (is (= {:connection parsed
                :diags #{:env.warning/inline-credentials}}
               (#'mdb.env/connection-from-jdbc-string conn-uri)))))
    (testing "When using old-style passwords parses and returns jdbc specs"
      (let [conn-uri "mysql://foo:password@172.17.0.2:3306/metabase"]
        (is (= {:connection parsed
                :diags #{:env.warning/inline-credentials}}
               (#'mdb.env/connection-from-jdbc-string conn-uri))))))
  (testing "handles credentials in query params"
    (let [conn-uri "mysql://172.17.0.2:3306/metabase?user=user&password=password"]
      (is (= {:connection (str "jdbc:" conn-uri)
              :diags #{:env.info/prepend-jdbc}}
             (#'mdb.env/connection-from-jdbc-string conn-uri)))))
  (testing "warns about postgres ssl issue #8908"
    (testing "when it parses due to inline credentials"
      (let [conn-uri "postgresql://mb@172.17.0.2:5432/metabase?ssl=true"]
        (is (= {:connection
                {:ssl "true",
                 :OpenSourceSubProtocolOverride true,
                 :password nil,
                 :type :postgres,
                 :classname "org.postgresql.Driver",
                 :subprotocol "postgresql",
                 :dbname "metabase",
                 :user "mb",
                 :subname "//172.17.0.2:5432/metabase"},
                :diags #{:env.warning/postgres-ssl :env.warning/inline-credentials}}
               (#'mdb.env/connection-from-jdbc-string conn-uri)))))
    (testing "when it doesn't parse as well"
      (doseq [conn-uri ["jdbc:postgresql://172.17.0.2:5432/metabase?user=mb&password=pw&ssl=true"
                        "postgresql://172.17.0.2:5432/metabase?user=mb&password=pw&ssl=true"
                        "postgres://172.17.0.2:5432/metabase?user=mb&password=pw&ssl=true"]]
        (let [{:keys [connection diags]} (#'mdb.env/connection-from-jdbc-string conn-uri)]
          (is (= "jdbc:postgresql://172.17.0.2:5432/metabase?user=mb&password=pw&ssl=true" connection))
          (is (contains? diags :env.warning/postgres-ssl))))))
  (testing "handles nil"
    (is (nil? (#'mdb.env/connection-from-jdbc-string nil)))))
