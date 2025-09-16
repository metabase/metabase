(ns metabase-enterprise.remote-sync.source.git-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.test :as mt])
  (:import (java.io File)
           (org.eclipse.jgit.api Git)
           (org.eclipse.jgit.lib PersonIdent)))

(set! *warn-on-reflection* true)

(defn- git-working-branch
  "The working branch in the given repo"
  [{:keys [^Git git]}]
  (-> (.getRepository git)
      (.getBranch)))

(defn- git-working-checkout!
  "Checks out the given branch in the working directory"
  [{:keys [^Git git]} ^String branch ^Boolean create]
  (-> (.checkout git)
      (.setName branch)
      (.setCreateBranch create)
      (.setForced true)
      (.call)))

(defn- git-working-commit!
  "Commits the current working directory"
  [{:keys [^Git git]} message]
  (-> (.commit git)
      (.setMessage message)
      (.setAuthor (PersonIdent. "Test Setup" "test@metabase.com"))
      (.setCommitter (PersonIdent. "Test Setup" "test@metabase.com"))
      (.call)))

(defn- git-working-add!
  "Writes the given file in the working path and stages it for commit"
  [{:keys [^Git git]} ^String path ^String content]
  (let [repo (.getRepository git)
        work-tree (.getWorkTree repo)
        full-path (io/file work-tree path)]
    (io/make-parents full-path)
    (spit full-path content)

    (-> (.add git)
        (.addFilepattern path)
        (.call))))

(defn- git-working-create-branch!
  "Creates a branch with an initial commit and file using the working directory"
  [source ^String branch]
  (let [initial-branch (git-working-branch source)]
    (git-working-checkout! source branch true)
    (git-working-add! source (str "file-in-" branch ".txt") (str "File in " branch))
    (git-working-commit! source (str "Init branch " branch))

    (git-working-checkout! source initial-branch false)))

(defn- git-working-init!
  "Initializes a git repo in the given directory"
  [^String dir & {:keys [files branches]}]
  (let [git (-> (Git/init)
                (.setDirectory (File. dir))
                (.call))]
    (doseq [[path content] files]
      (git-working-add! {:git git} path content))

    (git-working-commit! {:git git} "Initial commit")

    (doseq [branch branches]
      (git-working-create-branch! {:git git} branch))

    git))

(defn- init-source!
  "Creates a (local) 'remote' repo and initializes a git source that uses it"
  [dir & config]
  (let [^Git remote-repo (apply git-working-init! dir config)
        remote-url (-> (.getRepository remote-repo)
                       (.getDirectory)
                       (.toURI)
                       (.toURL)
                       (.toExternalForm))
        local-repo (git/clone-repository! {:url remote-url})
        source (git/->GitSource local-repo remote-url nil)]
    [source {:git remote-repo}]))

(deftest qualify-branch-test
  (is (= "refs/heads/main" (#'git/qualify-branch "main")))
  (is (= "refs/heads/main" (#'git/qualify-branch "refs/heads/main"))))

(deftest log
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! remote-dir :branches ["branch-1" "branch-2"])]
      (is (= ["Initial commit"] (map :message (git/log source "master"))))
      (is (= ["Init branch branch-1" "Initial commit"] (map :message (git/log source "branch-1"))))
      (is (nil? (git/log source "invalid"))))))

(deftest branches
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! remote-dir :branches ["branch-1" "branch-2"])]
      (is (= ["branch-1" "branch-2" "master"] (source.p/branches source))))))

(deftest list-files
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! remote-dir
                                         :files {"master.txt"      "File in master"
                                                 "subdir/path.txt" "File in subdir"}
                                         :branches ["branch-1" "branch-2"])]
      (is (= ["master.txt" "subdir/path.txt"] (source.p/list-files source "master")))
      (is (= ["file-in-branch-1.txt" "master.txt" "subdir/path.txt"] (source.p/list-files source "branch-1")))
      (is (= ["file-in-branch-2.txt" "master.txt" "subdir/path.txt"] (source.p/list-files source "branch-2"))))))

(deftest read-file
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! remote-dir
                                         :files {"master.txt"      "File in master"
                                                 "subdir/path.txt" "File in subdir"}
                                         :branches ["branch-1" "branch-2"])]
      (testing "Reading master"
        (is (= "File in master" (source.p/read-file source "master" "master.txt")))
        (is (= "File in subdir" (source.p/read-file source "master" "subdir/path.txt")))
        (is (nil? (source.p/read-file source "master" "file-in-branch-1.txt"))))

      (testing "Reading branch-1"
        (is (= "File in master" (source.p/read-file source "branch-1" "master.txt")))
        (is (= "File in branch-1" (source.p/read-file source "branch-1" "file-in-branch-1.txt")))
        (is (nil? (source.p/read-file source "master" "file-in-branch-2.txt"))))

      (testing "Reading invalid branch"
        (is (nil? (source.p/read-file source "invalid-branch" "master.txt")))))))

(deftest write-files
  (mt/with-temp-dir [remote-dir nil]
    (let [[source remote] (init-source! remote-dir
                                        :files {"master.txt"      "File in master"
                                                "subdir/path.txt" "File in subdir"}
                                        :branches ["branch-1" "branch-2"])]
      (testing "Updating existing file on master"
        (source.p/write-files! source "master" "Update existing file" [{:path "master.txt" :content "Updated master content"}])
        (is (= "Updated master content" (source.p/read-file source "master" "master.txt")))
        (is (= ["master.txt"] (source.p/list-files source "master")))
        (is (= ["Update existing file" "Initial commit"] (map :message (git/log source "master"))))

        (testing "Check remote repo directly"
          (is (= "Updated master content" (git/read-file remote "master" "master.txt")))
          (is (= ["master.txt"] (git/list-files remote "master")))
          (is (= ["Update existing file" "Initial commit"] (map :message (git/log remote "master"))))))

      (testing "Writing a new file to master"
        (source.p/write-files! source "master" "Add new file" [{:path "new-file.txt" :content "New file content"}])
        (is (= "New file content" (source.p/read-file source "master" "new-file.txt")))
        (is (= ["new-file.txt"] (source.p/list-files source "master")))
        (is (nil? (source.p/read-file source "master" "master.txt")))
        (is (= ["Add new file" "Update existing file" "Initial commit"] (map :message (git/log source "master"))))

        (testing "Check remote repo directly"
          (is (= "New file content" (git/read-file remote "master" "new-file.txt")))
          (is (= ["new-file.txt"] (git/list-files remote "master")))
          (is (= ["Add new file" "Update existing file" "Initial commit"] (map :message (git/log remote "master"))))))

      (testing "Writing multiple files"
        (source.p/write-files! source "master" "Multi-file" [{:path "subdir/sub-file.txt" :content "File newly added"}
                                                             {:path "new-file.txt" :content "Updated new file"}])

        (is (= "File newly added" (source.p/read-file source "master" "subdir/sub-file.txt")))
        (is (= "Updated new file" (source.p/read-file source "master" "new-file.txt")))
        (is (= ["new-file.txt" "subdir/sub-file.txt"] (source.p/list-files source "master")))
        (is (= ["Multi-file" "Add new file" "Update existing file" "Initial commit"] (map :message (git/log remote "master")))))

      (testing "Writing to a new branch"
        (source.p/write-files! source "new-branch" "New Branch" [{:path "branched/branched-file.txt" :content "File added to branch"}
                                                                 {:path "new-file.txt" :content "Updated file in branch"}])

        (is (= "File added to branch" (source.p/read-file source "new-branch" "branched/branched-file.txt")))
        (is (= "Updated file in branch" (source.p/read-file source "new-branch" "new-file.txt")))
        (is (= ["branched/branched-file.txt" "new-file.txt"] (source.p/list-files source "new-branch")))
        (is (= ["New Branch" "Multi-file" "Add new file" "Update existing file" "Initial commit"] (map :message (git/log source "new-branch"))))

        (testing "Check remote repo"
          (is (= ["New Branch" "Multi-file" "Add new file" "Update existing file" "Initial commit"] (map :message (git/log remote "new-branch"))))))

      (testing "Updating a branch"
        (source.p/write-files! source "new-branch" "Updating Branch" [{:path "branched/branched-file.txt" :content "File updated in branch"}
                                                                      {:path "another-file.txt" :content "Added in 2nd commit"}])

        (is (= "File updated in branch" (source.p/read-file source "new-branch" "branched/branched-file.txt")))
        (is (= "Added in 2nd commit" (source.p/read-file source "new-branch" "another-file.txt")))
        (is (= ["another-file.txt" "branched/branched-file.txt"] (source.p/list-files source "new-branch")))
        (is (= ["Updating Branch" "New Branch" "Multi-file" "Add new file" "Update existing file" "Initial commit"] (map :message (git/log source "new-branch"))))

        (testing "Check remote repo"
          (is (= ["Updating Branch" "New Branch" "Multi-file" "Add new file" "Update existing file" "Initial commit"] (map :message (git/log remote "new-branch")))))))))

(deftest concurrent-access
  (mt/with-temp-dir [remote-dir nil]
    (let [[source remote] (init-source! remote-dir
                                        :files {"master.txt"      "File in master"
                                                "subdir/path.txt" "File in subdir"}
                                        :branches ["branch-1" "branch-2"])]

      (testing "Initial clone is the same"
        (is (= ["Initial commit"] (map :message (git/log source "master"))))
        (is (= ["Initial commit"] (map :message (git/log remote "master")))))

      ;; Add an extra commit to remote
      (git-working-add! remote "additional-file.txt" "Additional file content")
      (git-working-commit! remote "Added additional file")

      (testing "Source is behind remote"
        (is (= ["Initial commit"] (map :message (git/log source "master"))))
        (is (= ["Added additional file" "Initial commit"] (map :message (git/log remote "master"))))

        (is (= "File in master" (source.p/read-file source "master" "master.txt")))
        (is (nil? (source.p/read-file source "master" "additional-file.txt"))))

      (testing "After fetch, source is up to date"
        (git/fetch! source)
        (is (= "Additional file content" (source.p/read-file source "master" "additional-file.txt")))
        (is (= ["Added additional file" "Initial commit"] (map :message (git/log source "master")))))

      (testing "Writing a file to source and pushing back to remote when there is new content on remote"
        ;; Make source be behind again
        (git-working-add! remote "only-on-remote.txt" "Initially on remote")
        (git-working-commit! remote "Only on remote")

        (source.p/write-files! source "master" "Added to source" [{:path "initially-source.txt" :content "Initially on source"}])

        (testing "Remote has the new commit with just the files committed, but only version is in history"
          (is (= ["Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log remote "master"))))
          (is (= ["initially-source.txt"] (git/list-files remote "master")))
          (is (= "Initially on source" (git/read-file remote "master" "initially-source.txt"))))

        (testing "Source has the same history"
          (is (= (map :message (git/log remote "master")) (map :message (git/log source "master"))))))

      (testing "Writing to a branch local has not seen (but remote has) adds it to the history on remote"
        (git-working-checkout! remote "new-branch" true)
        (git-working-add! remote "new-branch-file.txt" "Initially on remote")
        (git-working-add! remote "new-branch-remote.txt" "Initially on remote")
        (git-working-commit! remote "New-branch on remote")

        (is (= ["New-branch on remote" "Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log remote "new-branch"))))
        (is (nil? (git/log source "new-branch")))

        (source.p/write-files! source "new-branch" "New-branch on source" [{:path "new-branch-source.txt" :content "Initially on source"}
                                                                           {:path "new-branch-file.txt" :content "Updated on source"}])

        (is (= ["New-branch on source" "New-branch on remote" "Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log remote "new-branch"))))))))
