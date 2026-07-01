(ns metabase.util.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.memory :as memory]))

(deftest container-memory-limit-test
  (testing "returns a positive byte count (the cgroup limit or host physical memory), or nil when neither
            can be determined — never zero or negative"
    (let [v (memory/container-memory-limit)]
      (is (or (nil? v) (pos-int? v))))))
