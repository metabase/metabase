(ns metabase.search.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.util :as search.util]))

(def ^:private impossible? search.util/impossible-condition?)

(deftest ^:parallel impossible-condition?-test
  (is (not (impossible? [:= "card" :this.type])))
  (is (not (impossible? [:= :that.type :this.type])))
  (is (impossible? [:= "card" "dashboard"]))
  (is (not (impossible? [:= "card" "card"])))
  (is (not (impossible? [:!= "card" "dashboard"])))
  (is (impossible? [:!= "card" "card"]))
  (is (not (impossible? [:and [:= 1 :this.id] [:= "card" :this.type]])))
  (is (impossible? [:and [:= 1 :this.id] [:!= "card" "card"]]))
  (is (not (impossible? [:and [:= 1 :this.id] [:!= "card" "dashboard"]])))
  (is (not (impossible? [:or [:= 1 :this.id] [:!= "card" "dashboard"]])))
  (is (impossible? [:or [:= "oh" "no"] [:= "card" "dashboard"]])))

(deftest ^:parallel cycle-recent-indexes-test
  (are [previous-id active-id expected] (= expected
                                           (search.util/cycle-recent-versions previous-id active-id))
    nil            "a" ["a"]
    ["a"]          "a" ["a"]
    ["b"]          "a" ["a" "b"]
    '("b" "a")     "a" ["a" "b"]
    '("a" "b")     "a" ["a" "b"]
    '("b" "c")     "a" ["a" "b"]
    '("b" "c" "d") "a" ["a" "b"]))
