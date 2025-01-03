(ns metabase.notification.storage.disk-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.storage.disk :as disk]
   [metabase.notification.storage.protocols :as storage])
  (:import
   (java.io File)))

(deftest disk-storage-test
  (testing "basic store and retrieve operations"
    (let [storage (disk/to-disk-storage!)]
      (is (nil? (storage/retrieve storage))
          "should return nil for empty storage")

      (let [test-data {:foo "bar" :number 42}]
        (storage/store! storage test-data)
        (is (= test-data (storage/retrieve storage))
            "should correctly store and retrieve data")

        (storage/cleanup! storage)
        (is (nil? (storage/retrieve storage))
            "should return nil after cleanup"))))

  (testing "automatic file deletion"
    (let [storage (disk/to-disk-storage! {:test "data"} 1)
          file (-> storage .file)]
      (is (.exists ^File file)
          "file should exist initially")

      (Thread/sleep 1500)
      (is (not (.exists ^File file))
          "file should be deleted after expiration")))

  (testing "multiple storage instances"
    (let [storage1 (disk/to-disk-storage! {:id 1})
          storage2 (disk/to-disk-storage! {:id 2})]
      (is (not= (storage/retrieve storage1)
                (storage/retrieve storage2))
          "different storage instances should be independent"))))
