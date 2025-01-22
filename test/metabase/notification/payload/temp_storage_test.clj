(ns metabase.notification.payload.temp-storage-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.temp-storage :as temp-storage]))

(set! *warn-on-reflection* true)

(deftest to-temp-file!-test
  (testing "basic storage and retrieval works"
    (let [data {:test "data"}
          stored (temp-storage/to-temp-file! data)]
      (is (= data @stored))))

  (testing "can store and retrieve complex data structures"
    (let [data {:a [1 2 3]
                :b #{"set" "of" "strings"}
                :c {:nested "map"}}
          stored (temp-storage/to-temp-file! data)]
      (is (= data @stored))))

  (testing "file is deleted after specified timeout"
    (let [data {:test "temporary"}
          stored (temp-storage/to-temp-file! data 1)]
      (is (= data @stored))
      (Thread/sleep 1500)
      (is (nil? @stored))))

  (testing "can handle nil values"
    (let [stored (temp-storage/to-temp-file! nil)]
      (is (nil? @stored)))))
