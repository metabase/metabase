(ns metabase.sql-parsing.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.sql-parsing.common :as common]))

(set! *warn-on-reflection* true)

(deftest expected-sqlglot-version-test
  (testing "Sqlglot version is properly parsed from pyproject.toml"
    (let [version (common/expected-sqlglot-version)]
      (is (string? version))
      (is (re-matches #"\d+\.\d+\.\d+" version)))))
