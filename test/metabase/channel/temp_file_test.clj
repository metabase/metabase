(ns metabase.channel.temp-file-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.temp-file :as temp-file])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defn- create-real-temp-file!
  "Create a real temp file on disk for testing."
  ^File []
  (File/createTempFile "temp-file-test" ".tmp"))

(deftest track-temp-file!-without-binding-test
  (testing "when *tracked-temp-files* is not bound, falls back to .deleteOnExit and returns the file"
    (let [f (create-real-temp-file!)]
      (try
        (is (= f (temp-file/track-temp-file! f)))
        (is (.exists f) "file still exists after tracking")
        (finally
          (.delete f))))))

(deftest track-temp-file!-with-binding-test
  (testing "when *tracked-temp-files* is bound, adds the file to the tracker"
    (let [f (create-real-temp-file!)]
      (try
        (binding [temp-file/*tracked-temp-files* (atom [])]
          (temp-file/track-temp-file! f)
          (is (= [f] @temp-file/*tracked-temp-files*)))
        (finally
          (.delete f))))))

(deftest with-temp-file-cleanup-deletes-files-test
  (testing "files tracked inside with-temp-file-cleanup are deleted after body completes"
    (let [f1 (create-real-temp-file!)
          f2 (create-real-temp-file!)]
      (is (.exists f1))
      (is (.exists f2))
      (temp-file/with-temp-file-cleanup
        (temp-file/track-temp-file! f1)
        (temp-file/track-temp-file! f2)
        (is (.exists f1) "files exist during body")
        (is (.exists f2) "files exist during body"))
      (is (not (.exists f1)) "f1 deleted after cleanup")
      (is (not (.exists f2)) "f2 deleted after cleanup"))))

(deftest with-temp-file-cleanup-deletes-on-exception-test
  (testing "files are cleaned up even when body throws an exception"
    (let [f (create-real-temp-file!)]
      (is (.exists f))
      (is (thrown? Exception
                   (temp-file/with-temp-file-cleanup
                     (temp-file/track-temp-file! f)
                     (throw (Exception. "boom")))))
      (is (not (.exists f)) "file deleted despite exception"))))

(deftest with-temp-file-cleanup-handles-already-deleted-test
  (testing "cleanup handles files that were already deleted"
    (let [f (create-real-temp-file!)]
      (.delete f)
      (is (not (.exists f)))
      (temp-file/with-temp-file-cleanup
        (temp-file/track-temp-file! f)))))

(deftest with-temp-file-cleanup-returns-body-value-test
  (testing "with-temp-file-cleanup returns the value of body"
    (is (= 42
           (temp-file/with-temp-file-cleanup
             (temp-file/track-temp-file! (create-real-temp-file!))
             42)))))

(deftest nested-cleanup-scopes-test
  (testing "nested with-temp-file-cleanup scopes clean up independently"
    (let [outer-file (create-real-temp-file!)
          inner-file (create-real-temp-file!)]
      (temp-file/with-temp-file-cleanup
        (temp-file/track-temp-file! outer-file)
        (temp-file/with-temp-file-cleanup
          (temp-file/track-temp-file! inner-file)
          (is (.exists inner-file)))
        (is (not (.exists inner-file)) "inner file deleted when inner scope exits")
        (is (.exists outer-file) "outer file still exists"))
      (is (not (.exists outer-file)) "outer file deleted when outer scope exits"))))
