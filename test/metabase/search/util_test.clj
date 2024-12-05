(ns metabase.search.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.util :as search.util]))

(def ^:private impossible? search.util/impossible-condition?)

(deftest impossible-condition?-test
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

(deftest cycle-recent-indexes-test
  (is (= (search.util/cycle-recent-versions nil "a") ["a"]))
  (is (= (search.util/cycle-recent-versions ["a"] "a") ["a"]))
  (is (= (search.util/cycle-recent-versions ["b"] "a") ["a" "b"]))
  (is (= (search.util/cycle-recent-versions '("b" "a") "a") ["a" "b"]))
  (is (= (search.util/cycle-recent-versions '("a" "b") "a") ["a" "b"]))
  (is (= (search.util/cycle-recent-versions '("b" "c") "a") ["a" "b"]))
  (is (= (search.util/cycle-recent-versions '("b" "c" "d") "a") ["a" "b"])))
