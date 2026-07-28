(ns metabase.channel.temp-file-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.temp-file :as temp-file])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defn- new-temp-file! ^File []
  (doto (File/createTempFile "metabase_temp_file_test_" ".tmp")
    ;; the fallback path already calls .deleteOnExit, but callers of track-temp-file! shouldn't have to rely on
    ;; that in tests -- we clean up explicitly below regardless of what track-temp-file! does.
    (.deleteOnExit)))

(deftest track-temp-file-without-binding-test
  (testing "without *tracked-temp-files* bound, track-temp-file! doesn't track and returns the file"
    (let [f (new-temp-file!)]
      (is (nil? temp-file/*tracked-temp-files*))
      (is (identical? f (temp-file/track-temp-file! f)))
      (.delete f))))

(deftest track-temp-file-with-binding-test
  (testing "with *tracked-temp-files* bound, track-temp-file! adds the file to the tracker atom"
    (let [f (new-temp-file!)]
      (binding [temp-file/*tracked-temp-files* (atom [])]
        (is (identical? f (temp-file/track-temp-file! f)))
        (is (= [f] @temp-file/*tracked-temp-files*)))
      (.delete f))))

(deftest with-temp-file-cleanup-deletes-on-normal-completion-test
  (testing "with-temp-file-cleanup deletes tracked files after body completes normally"
    (let [f (new-temp-file!)]
      (is (.exists f))
      (temp-file/with-temp-file-cleanup
        (temp-file/track-temp-file! f)
        (is (.exists f) "file should still exist while the cleanup scope is open"))
      (is (not (.exists f)) "file should be deleted once the cleanup scope exits"))))

(deftest with-temp-file-cleanup-deletes-on-exception-test
  (testing "with-temp-file-cleanup deletes tracked files even when the body throws"
    (let [f (new-temp-file!)]
      (is (.exists f))
      (is (thrown-with-msg?
           Exception #"boom"
           (temp-file/with-temp-file-cleanup
             (temp-file/track-temp-file! f)
             (throw (ex-info "boom" {})))))
      (is (not (.exists f)) "file should be deleted even though the body threw"))))

(deftest with-temp-file-cleanup-handles-already-deleted-file-test
  (testing "with-temp-file-cleanup doesn't throw when a tracked file was already deleted before cleanup runs"
    (let [f (new-temp-file!)]
      (is (nil? (temp-file/with-temp-file-cleanup
                  (temp-file/track-temp-file! f)
                  (.delete f)
                  nil))))))

(deftest with-temp-file-cleanup-returns-body-value-test
  (testing "with-temp-file-cleanup returns the value of body"
    (is (= :the-result
           (temp-file/with-temp-file-cleanup
             :the-result)))))

(deftest with-temp-file-cleanup-nested-scopes-test
  (testing "nested with-temp-file-cleanup scopes clean up independently"
    (let [outer-file (new-temp-file!)
          inner-file (new-temp-file!)]
      (temp-file/with-temp-file-cleanup
        (temp-file/track-temp-file! outer-file)
        (is (.exists outer-file))
        (temp-file/with-temp-file-cleanup
          (temp-file/track-temp-file! inner-file)
          (is (.exists inner-file)))
        (testing "inner file is gone once the inner scope exits"
          (is (not (.exists inner-file))))
        (testing "outer file still exists while the outer scope is open"
          (is (.exists outer-file))))
      (testing "outer file is gone once the outer scope exits"
        (is (not (.exists outer-file)))))))
