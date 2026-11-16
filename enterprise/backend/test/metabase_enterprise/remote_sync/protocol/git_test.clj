(ns metabase-enterprise.remote-sync.protocol.git-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase-enterprise.remote-sync.protocol.git :as git]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu])
  (:import
   (java.io File)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.lib StoredConfig)))

(set! *warn-on-reflection* true)

(deftest branches-and-versions-test
  (remote-sync.tu/with-repository [url]
    (let [repo (doto (git/repository url nil) protocol/fetch!)]
      (testing "the repository has one branch, which is its default branch"
        (is (= ["main"] (protocol/branches repo)))
        (is (= "main" (protocol/default-branch repo))))
      (testing "the version of a branch is known, and a missing branch has none"
        (is (protocol/has-version? repo (protocol/version repo "main")))
        (is (nil? (protocol/version repo "missing"))))
      (testing "an unknown version is not known"
        (is (not (protocol/has-version? repo "0123456789abcdef0123456789abcdef01234567")))))))

(deftest commit-test
  (remote-sync.tu/with-repository [url]
    (let [repo     (doto (git/repository url nil) protocol/fetch!)
          parent   (protocol/version repo "main")
          version  (protocol/commit! repo "main" parent {"a/b.yaml" "b: 1\n" "c.yaml" "c: 2\n"} "Add files")]
      (testing "a commit adds files on top of its parent and pushes them"
        (is (= version (remote-sync.tu/tip! url "main")))
        (is (= #{"README.md" "a/b.yaml" "c.yaml"} (set (protocol/list-files repo version))))
        (is (= "b: 1\n" (protocol/read-file repo version "a/b.yaml")))
        (is (nil? (protocol/read-file repo version "missing.yaml"))))
      (testing "a nil content deletes a file"
        (let [next-version (protocol/commit! repo "main" version {"c.yaml" nil} "Delete a file")]
          (is (= #{"README.md" "a/b.yaml"} (set (protocol/list-files repo next-version))))))
      (testing "a commit on top of a version that is no longer the tip of the branch is refused"
        (is (thrown? Exception (protocol/commit! repo "main" version {"d.yaml" "d: 3\n"} "Stale commit")))))))

(deftest create-branch-test
  (remote-sync.tu/with-repository [url]
    (let [repo    (doto (git/repository url nil) protocol/fetch!)
          version (protocol/version repo "main")]
      (protocol/create-branch! repo "feature" version)
      (testing "a new branch starts at the version it was created at"
        (is (= ["feature" "main"] (protocol/branches repo)))
        (is (= version (remote-sync.tu/tip! url "feature")))))))

(defn- clone-dir
  "The directory the clone of the repository at `url` lives in."
  ^File [url]
  (.getDirectory (.getRepository ^Git (:git (git/repository url nil)))))

(deftest open-damaged-clone-test
  (remote-sync.tu/with-repository [url]
    (testing "a healthy clone reads the branches"
      (is (= ["main"] (protocol/branches (doto (git/repository url nil) protocol/fetch!)))))
    (testing "a clone without an origin remote is cloned again"
      (let [config (.getConfig (.getRepository ^Git (:git (git/repository url nil))))]
        (.unsetSection config "remote" "origin")
        (.save ^StoredConfig config))
      (is (= ["main"] (protocol/branches (doto (git/repository url nil) protocol/fetch!)))))
    (testing "an empty clone directory is cloned again"
      (let [dir (clone-dir url)]
        (run! io/delete-file (reverse (rest (file-seq dir)))))
      (is (= ["main"] (protocol/branches (doto (git/repository url nil) protocol/fetch!)))))))
