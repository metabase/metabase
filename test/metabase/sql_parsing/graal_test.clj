(ns metabase.sql-parsing.graal-test
  (:require
   [clojure.test :refer :all]
   [metabase.sql-parsing.graal :as graal]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------- Version Parsing --------------------------------------------------------

(deftest expected-sqlglot-version-test
  (testing "Sqlglot version is properly parsed from pyproject.toml"
    (let [version (#'graal/expected-sqlglot-version)]
      (is (string? version))
      (is (re-matches #"\d+\.\d+\.\d+" version)))))
