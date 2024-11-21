(ns metabase.search.postgres.ingestion-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.postgres.ingestion :as search.ingestion]))

(def ^:private impossible-condition? #'search.ingestion/impossible-condition?)

(deftest impossible-condition?-test
  (is (not (impossible-condition? [:= "card" :this.type])))
  (is (not (impossible-condition? [:= :that.type :this.type])))
  (is (impossible-condition? [:= "card" "dashboard"]))
  (is (not (impossible-condition? [:= "card" "card"])))
  (is (not (impossible-condition? [:!= "card" "dashboard"])))
  (is (impossible-condition? [:!= "card" "card"]))
  (is (not (impossible-condition? [:and [:= 1 :this.id] [:= "card" :this.type]])))
  (is (impossible-condition? [:and [:= 1 :this.id] [:!= "card" "card"]]))
  (is (not (impossible-condition? [:and [:= 1 :this.id] [:!= "card" "dashboard"]])))
  (is (not (impossible-condition? [:or [:= 1 :this.id] [:!= "card" "dashboard"]])))
  (is (impossible-condition? [:or [:= "oh" "no"] [:= "card" "dashboard"]])))
