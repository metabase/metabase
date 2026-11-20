(ns metabase-enterprise.remote-sync.protocol.folder-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase-enterprise.remote-sync.protocol.folder :as folder]
   [metabase.test :as mt]))

(deftest folder-source-test
  (mt/with-temp-dir [dir nil]
    (doseq [[path content] {"README.md"                         "# A folder\n"
                            "collections/main/a.yaml"           "name: A\n"
                            "collections/main/a/nested/b.yaml"  "name: B\n"}]
      (io/make-parents (io/file dir path))
      (spit (io/file dir path) content))
    (let [source (folder/source dir)]
      (testing "a folder has one version, what is on disk"
        (is (protocol/has-version? source folder/version))
        (is (not (protocol/has-version? source "0123abc"))))
      (testing "its files are listed by their path relative to the folder"
        (is (= #{"README.md" "collections/main/a.yaml" "collections/main/a/nested/b.yaml"}
               (set (protocol/list-files source folder/version)))))
      (testing "a file is read by that path, and a missing one is nil"
        (is (= "name: B\n" (protocol/read-file source folder/version "collections/main/a/nested/b.yaml")))
        (is (nil? (protocol/read-file source folder/version "collections/main/missing.yaml")))
        (is (nil? (protocol/read-file source folder/version "collections/main/a"))))
      (testing "another version has no files"
        (is (empty? (protocol/list-files source "0123abc")))
        (is (nil? (protocol/read-file source "0123abc" "README.md")))))
    (testing "a path that is not a directory is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not a directory"
                            (folder/source (io/file dir "README.md")))))))
