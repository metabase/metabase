(ns metabase-enterprise.library.source.git-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.library.source :as source]
   [metabase-enterprise.library.source.git :as git]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import (java.io File)
           (org.eclipse.jgit.api Git)
           (org.eclipse.jgit.lib PersonIdent)
           (org.eclipse.jgit.revwalk RevCommit)
           (org.eclipse.jgit.transport URIish)))

(set! *warn-on-reflection* true)

(defn- current-branch [^Git git]
  (-> (.getRepository git)
      (.getBranch)))

(defn- git-checkout! [^Git git ^String branch ^Boolean create]
  #p (-> (.checkout git)
         (.setName branch)
         (.setCreateBranch create)
         (.setForced true)
         (.call)))

(defn- git-log [^Git git]
  (map (fn [^RevCommit commit] {:message      (.getFullMessage commit)
                                :author-name  (.getName (.getAuthorIdent commit))
                                :author-email (.getEmailAddress (.getAuthorIdent commit))
                                :id           (.name (.abbreviate commit 8))
                                :parent       (when (< 0 (.getParentCount commit)) (.name (.abbreviate (.getParent commit 0) 8)))}) (-> (.log git)
                                                                                                                                        (.call))))

(defn- git-read-file! [^Git git ^String branch ^String path]
  (let [original-branch (current-branch git)]
    (try
      (git-checkout! git branch false)
      (let [repo (.getRepository git)
            work-tree (.getWorkTree repo)
            full-path (io/file work-tree path)]
        (when (.exists full-path)
          (slurp full-path)))
      (finally
        (git-checkout! git original-branch false)))))

(defn- git-commit! [^Git git message]
  (-> (.commit git)
      (.setMessage message)
      (.setAuthor (PersonIdent. "Test Setup" "test@metabase.com"))
      (.setCommitter (PersonIdent. "Test Setup" "test@metabase.com"))
      (.call)))

(defn- git-add! [^Git git ^String path ^String content]
  (let [repo (.getRepository git)
        work-tree (.getWorkTree repo)
        full-path (io/file work-tree path)]
    (io/make-parents full-path)
    (spit full-path content)

    (-> (.add git)
        (.addFilepattern path)
        (.call))))

(defn- git-create-branch! [^Git git ^String branch]
  (let [initial-branch (current-branch git)]
    (git-checkout! git branch true)
    (git-add! git (str "file-in-" branch ".txt") (str "File in " branch))
    (git-commit! git (str "Init branch " branch))

    (git-checkout! git initial-branch false)))

(defn- git-init! [^String dir & {:keys [files branches]}]
  (let [^Git git (-> (Git/init)
                     (.setDirectory (File. dir))
                     (.call))]
    (doseq [[path content] files]
      (git-add! git path content))

    (git-commit! git "Initial commit")

    (doseq [branch branches]
      (git-create-branch! git branch))

    git))

(defn- init-source! [dir & config]
  (let [^Git git (apply git-init! dir config)
        source (git/->GitSource git (.getDirectory (.getRepository git)) nil)]
    (-> (.remoteAdd git)
        (.setName "origin")
        (.setUri (-> (.getRepository git)
                     (.getDirectory)
                     (.toURI)
                     (.toURL)
                     (URIish.)))
        (.call))
    [source git]))

(deftest qualify-branch-test
  (is (= "refs/heads/main" (#'git/qualify-branch "main")))
  (is (= "refs/heads/main" (#'git/qualify-branch "refs/heads/main"))))

(deftest branches
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! remote-dir :branches ["branch-1" "branch-2"])]
      (is (= ["branch-1" "branch-2" "master"] (source/branches source))))))

(deftest list-files
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! remote-dir
                                         :files {"master.txt"      "File in master"
                                                 "subdir/path.txt" "File in subdir"}
                                         :branches ["branch-1" "branch-2"])]
      (is (= ["master.txt" "subdir/path.txt"] (source/list-files source "master")))
      (is (= ["file-in-branch-1.txt" "master.txt" "subdir/path.txt"] (source/list-files source "branch-1")))
      (is (= ["file-in-branch-2.txt" "master.txt" "subdir/path.txt"] (source/list-files source "branch-2"))))))

(deftest read-file
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! remote-dir
                                         :files {"master.txt"      "File in master"
                                                 "subdir/path.txt" "File in subdir"}
                                         :branches ["branch-1" "branch-2"])]
      (testing "Reading master"
        (is (= "File in master" (source/read-file source "master" "master.txt")))
        (is (= "File in subdir" (source/read-file source "master" "subdir/path.txt")))
        (is (nil? (source/read-file source "master" "file-in-branch-1.txt"))))

      (testing "Reading branch-1"
        (is (= "File in master" (source/read-file source "branch-1" "master.txt")))
        (is (= "File in branch-1" (source/read-file source "branch-1" "file-in-branch-1.txt")))
        (is (nil? (source/read-file source "master" "file-in-branch-2.txt"))))

      (testing "Reading invalid branch"
        (is (nil? (source/read-file source "invalid-branch" "master.txt")))))))

(deftest write-file
  (mt/with-temp-dir [remote-dir nil]
    (let [[source remote] (init-source! remote-dir
                                        :files {"master.txt"      "File in master"
                                                "subdir/path.txt" "File in subdir"}
                                        :branches ["branch-1" "branch-2"])]
      (testing "Writing new file to master"
        (source/write-file! source "master" "Add new file" "new-file.txt" "New file content")
        (is (= "New file content" (source/read-file source "master" "new-file.txt")))
        (testing "Check remote repo directly"
          (is (= "New file content" (git-read-file! remote "master" "new-file.txt")))
          (is (= ["Add new file" "Initial commit"] (map :message (git-log remote)))))

        (testing "Existing files are unchanged"
          (is (= "File in master" (source/read-file source "master" "master.txt")))
          (is (= "File in subdir" (source/read-file source "master" "subdir/path.txt")))))

      (testing "Updating existing file on master"
        (source/write-file! source "master" "Update existing file 1" "master.txt" "Updated master content")
        (is (= "Updated master content" (source/read-file source "master" "master.txt")))
        (is (= ["master.txt" "new-file.txt" "subdir/path.txt"] (source/list-files source "master")))
        (testing "Check remote repo directly"
          (is (= "Updated master content" (git-read-file! remote "master" "master.txt")))
          (is (= ["Update existing file 1" "Add new file" "Initial commit"] (map :message (git-log remote)))))

        (testing "Other files are still there"
          (is (= "New file content" (source/read-file source "master" "new-file.txt")))
          (is (= "File in subdir" (source/read-file source "master" "subdir/path.txt"))))))))
