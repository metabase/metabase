(ns metabase.db.env-test
  (:require [clojure.test :refer :all]
            [metabase.db.env :as mdb.env]))

(deftest parse-connection-string-test
  (testing "can parse with/without jdbc, uri-encoded passwords, passwords in host, etc"
    (are [conn expected] (= expected (#'mdb.env/parse-connection-string conn))
      ;; password in host
      "postgres://dan:password@localhost:5432/metabase"
      {:type :postgres, :user "dan", :password "password",
       :host "localhost", :port "5432", :dbname "metabase"}

      ;; password in params
      "postgresql://localhost:5432/metabase?user=dan&password=password"
      {:type :postgres, :user "dan", :password "password",
       :host "localhost", :port "5432", :dbname "metabase"}

      ;; includes uri encoded password
      "mysql://localhost/metabase?user=newuser&password=metabase%21%40%2540%26amp%3B-%2F%3A"
      {:type :mysql, :user "newuser", :password "metabase!@%40&amp;-/:",
       :host "localhost", :port nil, :dbname "metabase"}

      ;; extra options ssl=true
      "jdbc:postgresql://localhost/test?user=fred&password=secret&ssl=true"
      {:type :postgres, :user "fred", :password "secret",
       :host "localhost", :port nil, :dbname "test", :ssl "true"}

      ;; copied from previous tests
      "postgres://localhost/toms_cool_db"
      {:type :postgres, :user nil, :password nil, :host "localhost", :port nil, :dbname "toms_cool_db" }

      "postgresql://localhost/toms_cool_db"
      {:type :postgres, :user nil, :password nil, :host "localhost", :port nil, :dbname "toms_cool_db"}

      (str "postgres://tom:1234@localhost:5432/toms_cool_db"
           "?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory")
      {:type :postgres, :user "tom", :password "1234", :host "localhost", :port "5432", :dbname "toms_cool_db",
       :ssl "true", :sslfactory "org.postgresql.ssl.NonValidatingFactory"}

      (str "jdbc:postgres://tom:1234@localhost:5432/toms_cool_db"
           "?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory")
      {:type :postgres, :user "tom", :password "1234", :host "localhost", :port "5432", :dbname "toms_cool_db",
       :ssl "true", :sslfactory "org.postgresql.ssl.NonValidatingFactory"}))
  (testing "throws if unsupported db type"
    (let [invalid-conn "oracle://dan:password@localhost:5432/metabase"]
      (is (thrown? Throwable (#'mdb.env/parse-connection-string invalid-conn))))))
