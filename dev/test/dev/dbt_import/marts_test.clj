(ns dev.dbt-import.marts-test
  "What the marts generator does before it reaches for dbt or Postgres."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.fixture :as fixture]
   [dev.dbt-import.marts :as marts]))

(deftest password-stays-out-of-errors-test
  (testing "a mistake in the options fails before anything runs, and the password is not in what the failure reports"
    (let [e (try
              (marts/regenerate! {:connection {:prot 15432}} "hunter2")
              nil
              (catch clojure.lang.ExceptionInfo e e))]
      (is (some? e))
      (is (re-find #"Invalid input" (ex-message e)))
      (is (re-find #":prot" (ex-message e)))
      (is (not (str/includes? (pr-str (ex-data e)) "hunter2"))))))

(deftest ^:parallel with-defaults-test
  (let [connection (#'marts/with-defaults {:host "db", :port 15432, :dbname "x", :user "u"} "hunter2")]
    (is (= {:host "db", :port 15432, :dbname "x", :user "u"} (dissoc connection :password)))
    (testing "the password is wrapped, so the connection prints without it"
      (is (= "hunter2" (fixture/reveal (:password connection))))
      (is (not (str/includes? (pr-str connection) "hunter2"))))))
