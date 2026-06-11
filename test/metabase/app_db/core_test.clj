(ns metabase.app-db.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]))

(deftest ^:parallel memoize-for-application-db-test
  (let [calls (atom 0)
        f     (mdb/memoize-for-application-db
               (fn [x]
                 (swap! calls inc)
                 (inc x)))]
    (testing "caches per args"
      (is (= 2 (f 1)))
      (is (= 2 (f 1)))
      (is (= 1 @calls)))
    (testing "cache is keyed by application DB"
      (mdb/with-application-db (assoc mdb.connection/*application-db* :id Integer/MAX_VALUE)
        (is (= 2 (f 1))))
      (is (= 2 @calls)))))

(deftest ^:parallel memoize-for-application-db-bounded-test
  (let [calls (atom 0)
        f     (mdb/memoize-for-application-db
               (fn [x]
                 (swap! calls inc)
                 (inc x))
               :bounded/threshold 3)]
    (testing "caches per args"
      (is (= 2 (f 1)))
      (is (= 2 (f 1)))
      (is (= 1 @calls)))
    (testing "reaching the threshold discards the cache, so earlier entries get recomputed"
      (f 2)
      (f 3)
      (f 4)
      (is (= 2 (f 1)))
      (is (= 5 @calls)))))
