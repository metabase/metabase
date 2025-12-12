(ns metabase-enterprise.remote-sync.test-helpers-test
  "Tests for the MockSource implementation in test-helpers."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as th]))

(deftest mock-source-write-files-removal-test
  (testing "MockSource handles removal entries correctly"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc/file1.yaml" "content1"
                                          "collections/abc/file2.yaml" "content2"
                                          "collections/def/file3.yaml" "content3"
                                          "other/file4.yaml" "content4"}})
          snapshot (source.p/snapshot source)]
      (source.p/write-files! snapshot "Remove abc collection"
                             [{:path "collections/abc" :remove? true}])
      (is (= #{"collections/def/file3.yaml" "other/file4.yaml"}
             (set (source.p/list-files snapshot)))
          "Should remove all files under collections/abc recursively"))))

(deftest mock-source-write-files-removal-exact-path-test
  (testing "MockSource removal matches exact path"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc.yaml" "content1"
                                          "collections/abcdef/file.yaml" "content2"}})
          snapshot (source.p/snapshot source)]
      (source.p/write-files! snapshot "Remove abc.yaml"
                             [{:path "collections/abc.yaml" :remove? true}])
      (is (= #{"collections/abcdef/file.yaml"}
             (set (source.p/list-files snapshot)))
          "Should only remove exact path match, not prefix match without slash"))))

(deftest mock-source-write-files-mixed-write-and-removal-test
  (testing "MockSource handles both write and removal entries"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/old/file1.yaml" "old-content"
                                          "collections/keep/file2.yaml" "keep-content"}})
          snapshot (source.p/snapshot source)]
      (source.p/write-files! snapshot "Mixed operations"
                             [{:path "collections/old" :remove? true}
                              {:path "collections/new/file3.yaml" :content "new-content"}])
      (is (= #{"collections/keep/file2.yaml" "collections/new/file3.yaml"}
             (set (source.p/list-files snapshot)))
          "Should remove old files and add new files"))))

(deftest mock-source-write-files-empty-removal-path-test
  (testing "MockSource ignores removal entries with empty paths"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc/file1.yaml" "content1"}})
          snapshot (source.p/snapshot source)]
      (source.p/write-files! snapshot "Empty removal"
                             [{:path "" :remove? true}
                              {:path "   " :remove? true}])
      (is (= #{"collections/abc/file1.yaml"}
             (set (source.p/list-files snapshot)))
          "Should not remove anything when removal path is empty or blank"))))

(deftest mock-source-write-files-nonexistent-removal-path-test
  (testing "MockSource handles removal of non-existent paths (no-op)"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc/file1.yaml" "content1"}})
          snapshot (source.p/snapshot source)]
      (source.p/write-files! snapshot "Remove nonexistent"
                             [{:path "collections/xyz" :remove? true}])
      (is (= #{"collections/abc/file1.yaml"}
             (set (source.p/list-files snapshot)))
          "Should be a no-op when removing non-existent path"))))
