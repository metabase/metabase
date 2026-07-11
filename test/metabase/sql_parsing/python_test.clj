(ns metabase.sql-parsing.python-test
  "Tests for the `:python` sqlglot parser: the same assertions the graal parser is trusted for, through
  the external-process path. Requires a `python3` binary on the PATH (sqlglot itself is installed into
  `resources/python-sources` on first use, like the graal tests)."
  (:require
   [clojure.test :refer :all]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.sql-parsing.python :as python]))

(set! *warn-on-reflection* true)

(deftest referenced-tables-test
  (testing "extracts table references through the external CPython process"
    (is (= [[nil nil "transactions"] [nil "public" "orders"]]
           (protocol/referenced-tables
            (python/parser)
            "postgres"
            "SELECT * FROM transactions t JOIN public.orders o ON t.id = o.tid")))))

(deftest validate-query-test
  (testing "validates syntax through the external CPython process"
    (is (= "ok"
           (:status (protocol/validate-query (python/parser) "postgres" "SELECT 1" nil nil))))
    (is (= "error"
           (:status (protocol/validate-query (python/parser) "postgres" "SELECT FROM WHERE" nil nil))))))

(deftest call-error-keeps-process-healthy-test
  (testing "a failed call surfaces the Python error and the process still answers the next call"
    (is (thrown-with-msg? Exception #"sqlglot call failed"
                          (protocol/add-into-clause (python/parser) nil nil "t")))
    (is (= [[nil nil "users"]]
           (protocol/referenced-tables (python/parser) "postgres" "SELECT * FROM users")))))

(deftest parse-error-test
  (testing "unparseable SQL surfaces as the same transport-agnostic parse error the graal parser throws"
    (let [e (try
              (protocol/referenced-tables (python/parser) "postgres" "SELECT !!!")
              (catch Exception e e))]
      (is (sql-parsing/parse-error? e))))
  (testing "other Python-side failures are not parse errors"
    (let [e (try
              (protocol/add-into-clause (python/parser) nil nil "t")
              (catch Exception e e))]
      (is (not (sql-parsing/parse-error? e))))))
