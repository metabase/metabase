(ns metabase.util.version-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.version :as version]))

(deftest ^:parallel semantic-version-gte-test
  (testing "semantic-version-gte works as expected"
    (are [x y] (version/semantic-version-gte x y)
      [5 0]   [4 0]
      [5 0 1] [4 0]
      [5 0]   [4 0 1]
      [5 0]   [4 1]
      [4 1]   [4 1]
      [4 1]   [4]
      [4]     [4]
      [4]     [4 0 0])
    (are [x y] (not (version/semantic-version-gte x y))
      [3]     [4]
      [4]     [4 1]
      [4 0]   [4 0 1]
      [4 0 1] [4 1]
      [3 9]   [4 0]
      [3 1]   [4])))
