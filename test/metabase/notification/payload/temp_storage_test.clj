(ns metabase.notification.payload.temp-storage-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.temp-storage :as temp-storage]))

(set! *warn-on-reflection* true)

(deftest basic-write-read-test
  (testing "basic write and read operations"
    (let [test-data {:a 1 :b "test" :c [1 2 3]}
          storage (temp-storage/to-temp-file! test-data)]
      (try
        (is (= test-data @storage))
        (finally
          (temp-storage/cleanup! storage))))))

(deftest cleanup-test
  (testing "file is actually deleted after cleanup"
    (let [storage (temp-storage/to-temp-file! "test-data")
          file (.file storage)]
      (is (.exists file))
      (temp-storage/cleanup! storage)
      (is (not (.exists file)))
      (is (thrown-with-msg?
           Exception
           #"File no longer exists"
           @storage)))))

(deftest nil-handling-test
  (testing "can handle nil values"
    (let [storage (temp-storage/to-temp-file! nil)]
      (try
        (is (nil? @storage))
        (finally
          (temp-storage/cleanup! storage))))))

(deftest equality-test
  (testing "equality behavior"
    (let [data {:test "data"}
          storage1 (temp-storage/to-temp-file! data)
          storage2 (temp-storage/to-temp-file! data)]
      (try
        (is (= storage1 storage1))
        (is (not= storage1 storage2))
        (finally
          (temp-storage/cleanup! storage1)
          (temp-storage/cleanup! storage2))))))
