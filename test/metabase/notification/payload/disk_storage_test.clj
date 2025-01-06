(ns metabase.notification.payload.disk-storage-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.disk-storage :as notification.disk-storage])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(deftest disk-storage-test
  (testing "basic store and retrieve operations"
    (let [storage (notification.disk-storage/to-disk-storage!)]
      (is (nil? (notification.disk-storage/retrieve storage))
          "should return nil for empty storage")

      (let [test-data {:foo "bar" :number 42}]
        (notification.disk-storage/store! storage test-data)
        (is (= test-data (notification.disk-storage/retrieve storage))
            "should correctly store and retrieve data")

        (notification.disk-storage/cleanup! storage)
        (is (nil? (notification.disk-storage/retrieve storage))
            "should return nil after cleanup"))))

  (testing "automatic file deletion"
    (let [storage (notification.disk-storage/to-disk-storage! {:test "data"} 1)
          file (-> storage .file)]
      (is (.exists ^File file)
          "file should exist initially")

      (Thread/sleep 1500)
      (is (not (.exists ^File file))
          "file should be deleted after expiration")))

  (testing "multiple storage instances"
    (let [storage1 (notification.disk-storage/to-disk-storage! {:id 1})
          storage2 (notification.disk-storage/to-disk-storage! {:id 2})]
      (is (not= (notification.disk-storage/retrieve storage1)
                (notification.disk-storage/retrieve storage2))
          "different storage instances should be independent"))))
