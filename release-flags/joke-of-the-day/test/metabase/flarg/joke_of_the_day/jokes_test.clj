(ns metabase.flarg.joke-of-the-day.jokes-test
  (:require
   [clojure.test :refer :all]
   [metabase.flarg.joke-of-the-day.jokes :as jokes]))

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
