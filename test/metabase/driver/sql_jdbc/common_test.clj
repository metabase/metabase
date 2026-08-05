(ns metabase.driver.sql-jdbc.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]))

(deftest ^:parallel conn-str-with-additional-opts-testc
  (testing "conn-str-with-additional-opts combined with additional-opts->string works as expected"
    (doseq [[exp-str sep-style conn-str opts] [["localhost:4321" :comma "localhost:4321" nil]
                                               ["localhost:4321" :comma "localhost:4321" {}]
                                               ["localhost:4321,a=1" :comma "localhost:4321" {:a 1}]
                                               ["localhost:4321,a=1,b=2" :comma "localhost:4321" {:a 1 :b 2}]
                                               ["localhost:4321" :semicolon "localhost:4321" nil]
                                               ["localhost:4321" :semicolon "localhost:4321" {}]
                                               ["localhost:4321;a=1" :semicolon "localhost:4321" {:a 1}]
                                               ["localhost:4321;a=1;b=2" :semicolon "localhost:4321" {:a 1 :b 2}]
                                               ["localhost:4321" :url "localhost:4321" nil]
                                               ["localhost:4321" :url "localhost:4321" {}]
                                               ["localhost:4321?a=1" :url "localhost:4321" {:a 1}]
                                               ["localhost:4321?a=1&b=2" :url "localhost:4321" {:a 1 :b 2}]]]
      (let [opts-str (sql-jdbc.common/additional-opts->string sep-style opts)]
        (is (= exp-str (sql-jdbc.common/conn-str-with-additional-opts conn-str sep-style opts-str)))))))

(deftest ^:parallel additional-options->map-test
  (testing "additional-options->map function works as expected"
    (doseq [[exp addl-opts sep-style nv-sep] [[{"bar" "two"} "bar=two" :url]
                                              [{"bar" "two", "baz" "three"} "bar=two&baz=three" :url]
                                              [{"foo" "one", "bar" "two", "baz" "three"}
                                               "foo=one&bar=two&baz=three"
                                               :url]
                                              [{"foo" "one", "bar" "Two"} "foo=one&BAR=Two" :url]
                                              [{"foo" "one", "bar" nil, "baz" "three"} "foo=one&bar=&baz=three" :url]
                                              [{"foo" "one", "bar" "two", "baz" "three"}
                                               "foo=one,bar=two,baz=three"
                                               :comma]
                                              [{"foo" "one", "bar" "two", "baz" "three"}
                                               "foo=one;BaR=two;baz=three"
                                               :semicolon]]]
      (testing (format "can parse value for %s separator style from %s" sep-style addl-opts)
        (is (= exp (sql-jdbc.common/additional-options->map addl-opts sep-style nv-sep)))))))

(deftest ^:parallel connection-parameter-hosts-test
  (testing "a declared parameter is read, whichever separator style the driver that built the string uses"
    (are [conn-str declared expected]
         (= expected (sql-jdbc.common/connection-parameter-hosts conn-str nil declared))
      "jdbc:postgresql://real.example.com:5432/db?host=internal.corp"            ["host"]          ["internal.corp"]
      "jdbc:postgresql://real.example.com:5432/db?ssl=true&PGHOST=db.corp"       ["PGHOST"]        ["db.corp"]
      "jdbc:sqlserver://real.example.com:1433;database=x;failoverPartner=db.corp" ["failoverPartner"] ["db.corp"]
      "jdbc:athena://Region=us-east-1;S3Endpoint=https://s3.corp:8443"           ["s3endpoint"]    ["s3.corp"]))
  (testing "the authority is left to `connection-hosts` -- only the parameters are read here"
    (are [conn-str] (= [] (sql-jdbc.common/connection-parameter-hosts conn-str nil ["host"]))
      "jdbc:postgresql://127.0.0.1:5432/db"
      "jdbc:postgresql://real.example.com:5432/db"))
  (testing "an undeclared parameter is read only when its value is already an address"
    ;; no lookup for a value that may not be a host at all: nothing is handed to the resolver, and a name that
    ;; happens to resolve inside the cluster cannot refuse a database over its username
    (is (= [] (sql-jdbc.common/connection-parameter-hosts
               "jdbc:postgresql://h:5432/db?user=metabase_ro&sslmode=verify-full&ApplicationName=analytics" nil nil)))
    (is (= ["169.254.169.254"]
           (sql-jdbc.common/connection-parameter-hosts
            "jdbc:postgresql://h:5432/db?ApplicationName=169.254.169.254" nil nil)))
    (testing "including inside a URL, and in bracketed IPv6 form"
      (is (= ["10.0.0.1"] (sql-jdbc.common/connection-parameter-hosts
                           "jdbc:x://h:1/db?whatever=https://10.0.0.1:8443/path" nil nil)))
      (is (= ["::1"] (sql-jdbc.common/connection-parameter-hosts "jdbc:x://h:1/db?whatever=[::1]" nil nil)))))
  (testing "parameters passed alongside the connection string rather than inside it are read the same way"
    (is (= ["backup.corp"]
           (sql-jdbc.common/connection-parameter-hosts "jdbc:vertica://real.example.com:5433/db"
                                                       {:backupservernode "backup.corp" :loginTimeout 10}
                                                       ["backupservernode"])))))

(deftest ^:parallel connection-string-hosts-test
  (testing "the authority is read whichever shape the driver built it in"
    (are [conn-str expected] (= expected (sql-jdbc.common/connection-string-hosts conn-str))
      "//localhost:5432/db"                        ["localhost"]
      "//db.example.com"                           ["db.example.com"]  ; SQL Server leaves the port out of the URL
      "@db.example.com:1521:orcl"                  ["db.example.com"]  ; Oracle's SID form
      "@db.example.com:1521/svc"                   ["db.example.com"]  ; Oracle's service-name form
      "//[::1]:5432/db"                            ["::1"]
      "//user:pw@10.0.0.1:5432/db"                 ["10.0.0.1"]
      "//localhost;serverName=db.corp"             ["localhost"]
      "jdbc:hive2://localhost:10000/db"            ["localhost"]
      "url=http://h.example.com:8082/druid/v2/"    ["h.example.com"])) ; Druid buries a whole URL in a parameter
  (testing "every entry of a replica-set style authority is read, not just the first"
    (is (= ["a.example.com" "b.example.com"]
           (sql-jdbc.common/connection-string-hosts "//a.example.com:5432,b.example.com:5432/db"))))
  (testing "a connection string with no authority names no host -- a file-backed database is not a network connection"
    (are [conn-str] (empty? (sql-jdbc.common/connection-string-hosts conn-str))
      "/tmp/sparrow.db"
      "file:./sparrow"
      "mem:sparrow"
      nil))
  (testing "an authority with no host in it throws, because that is a default the client fills in where we cannot see"
    ;; pgjdbc handed `//:5439/db` connects to localhost, exactly as it does for a URL with no authority at all
    (are [conn-str] (thrown? clojure.lang.ExceptionInfo (sql-jdbc.common/connection-string-hosts conn-str))
      "//:5439/db"
      "//:443/;ConnCatalog=c"
      "//a.example.com:5432,:5432/db")))
