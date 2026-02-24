(ns metabase.joke-of-the-day.jokes-test
  (:require
   [clojure.test :refer :all]
   [metabase.joke-of-the-day.jokes :as jokes]
   [metabase.release-flags.guard :as guard]))

(use-fixtures :once (guard/bypass-guard-fixture :joke-of-the-day))

(deftest jokes-test
  (testing "jokes returns a non-empty collection"
    (let [result (jokes/jokes)]
      (is (seq result))
      (is (sequential? result))))
  (testing "each joke has the expected keys"
    (doseq [joke (jokes/jokes)]
      (is (contains? joke "id"))
      (is (contains? joke "type"))
      (is (contains? joke "setup"))
      (is (contains? joke "punchline")))))
