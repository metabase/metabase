(ns metabase.db.env-test
  (:require [clojure.test :refer :all]
            [metabase.db.env :as mdb.env]))

(deftest parse-connection-string-test
  (testing "parse minimal connection string"
    (is (= {:type :postgres, :user nil, :password nil, :host "localhost", :port nil, :dbname "toms_cool_db" }
           (#'mdb.env/parse-connection-string "postgres://localhost/toms_cool_db"))))

  (testing "parse connection string using alternate `postgreql` URI schema"
    (is (= {:type :postgres, :user nil, :password nil, :host "localhost", :port nil, :dbname "toms_cool_db" }
           (#'mdb.env/parse-connection-string "postgresql://localhost/toms_cool_db"))))

  (testing "parse all fields and query string arguments"
    (is (= {:type :postgres, :user       "tom", :password "1234", :host "localhost", :port "5432",
            :dbname "toms_cool_db", :ssl  "true",    :sslfactory "org.postgresql.ssl.NonValidatingFactory"}
           (#'mdb.env/parse-connection-string (str "postgres://tom:1234@localhost:5432/toms_cool_db"
                                                   "?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory")))))

  (testing "the leading \"jdbc\" found in driver JDBC docs should be ignored"
    (is (= {:type   :postgres,      :user "tom",  :password   "1234", :host "localhost", :port "5432",
            :dbname "toms_cool_db", :ssl  "true", :sslfactory "org.postgresql.ssl.NonValidatingFactory"}
           (#'mdb.env/parse-connection-string (str "jdbc:postgres://tom:1234@localhost:5432/toms_cool_db"
                                                   "?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory"))))))
