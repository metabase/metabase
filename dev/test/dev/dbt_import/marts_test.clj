(ns dev.dbt-import.marts-test
  "What the marts generator does before it reaches for dbt or Postgres."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.marts :as marts]
   [metabase.test.data.interface :as tx]
   [metabase.util.secret :as u.secret]
   [next.jdbc :as jdbc]
   [next.jdbc.connection :as jdbc.conn]))

(deftest password-stays-out-of-errors-test
  (testing "a mistake in the options fails before anything runs, and the password is not in what the failure reports"
    (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid input.*:prot"
                                  (marts/regenerate! {:connection {:prot 15432}} "hunter2")))]
      (is (not (str/includes? (ex-message e) "hunter2")))
      (is (not (str/includes? (pr-str (ex-data e)) "hunter2"))))))

(deftest ^:parallel with-defaults-test
  (let [connection (#'marts/with-defaults {:host "db", :port 15432, :dbname "x", :user "u"} "hunter2")]
    (is (= {:host "db", :port 15432, :dbname "x", :user "u"} (dissoc connection :password)))
    (testing "the password is wrapped, so the connection prints without it"
      (is (= "hunter2" (u.secret/expose (:password connection))))
      (is (not (str/includes? (pr-str connection) "hunter2"))))))

(defn- with-postgres-test-env-vars!
  "Run `thunk` with the test suite's Postgres settings set to `values` (`env-var` -> value), then put them back."
  [values thunk]
  (let [before (into {} (map (fn [k] [k (tx/db-test-env-var :postgresql k)])) (keys values))]
    (try
      (doseq [[k v] values]
        (tx/db-test-env-var! :postgresql k v))
      (thunk)
      (finally
        (doseq [[k v] before]
          (tx/db-test-env-var! :postgresql k v))))))

(deftest with-defaults-env-test
  (testing "the test suite's MB_POSTGRESQL_TEST_* settings fill in what the overrides do not say"
    (with-postgres-test-env-vars! {:host "env-host", :port 15433, :user "env-user", :password "env-password"}
      (fn []
        (let [connection (#'marts/with-defaults {} nil)]
          (is (= {:host "env-host", :port 15433, :dbname "dbt_bi", :user "env-user"} (dissoc connection :password)))
          (is (= "env-password" (u.secret/expose (:password connection)))))
        (testing "an override, and a password argument, win"
          (let [connection (#'marts/with-defaults {:port 1} "arg-password")]
            (is (= 1 (:port connection)))
            (is (= "arg-password" (u.secret/expose (:password connection)))))))))
  (testing "without any, localhost and the postgres user, and no password"
    (with-postgres-test-env-vars! {:host nil, :port nil, :user nil, :password nil}
      (fn []
        (is (= {:host "localhost", :port 5432, :dbname "dbt_bi", :user "postgres", :password nil}
               (#'marts/with-defaults {} nil)))))))

(deftest ^:parallel jdbc-spec-test
  (let [connection (#'marts/with-defaults {:host "db", :port 15432, :dbname "x", :user "u"} "hunter2")
        spec       (#'marts/jdbc-spec connection)]
    (testing "the password reaches the JDBC spec as the string Postgres has to see, not as its redaction"
      (is (= {:dbtype "postgresql", :host "db", :port 15432, :dbname "x", :user "u", :password "hunter2"} spec))
      (let [url (jdbc.conn/jdbc-url spec)]
        (is (str/includes? url "password=hunter2"))
        (is (not (str/includes? url "REDACTED")))))
    (testing "a connection without a password makes a spec without one"
      (is (= {:dbtype "postgresql", :host "db", :port 15432, :dbname "x", :user "u"}
             (#'marts/jdbc-spec (assoc connection :password nil)))))
    (testing "and a data source, without connecting"
      (is (instance? javax.sql.DataSource (jdbc/get-datasource spec))))))
