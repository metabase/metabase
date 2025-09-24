(ns metabase-enterprise.remote-sync.source.git-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.test :as mt]
   [metabase.util :as u])
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

(defn- init-remote!
  "Initializes a 'remote' git repo in the given directory"
  [^String dir & {:keys [files branches]}]
  (let [git (-> (Git/init)
                (.setDirectory (File. dir))
                (.call))
        remote {:git git}]
    (doseq [[path content] files]
      (git-working-add! remote path content))

    (git-working-commit! remote "Initial commit")

    (doseq [branch branches]
      (git-working-create-branch! remote branch))

    remote))

(defn- ->source!
  "Creates a (local) 'remote' repo and initializes a git source that uses it"
  [branch {:keys [^Git git] :as _remote-repo}]
  (let [remote-url (-> (.getRepository git)
                       (.getDirectory)
                       (.toURI)
                       (.toURL)
                       (.toExternalForm))
        local-repo (git/clone-repository! {:url remote-url})]
    (git/->GitSource local-repo remote-url branch nil)))

(defn- init-source!
  [branch dir & config]
  (let [remote-repo (apply init-remote! dir config)]
    [(->source! branch remote-repo) remote-repo]))

(deftest path-prefix
  (let [id (u/generate-nano-id "a")]
    (testing "Not in a collection"
      (doseq [path ["asdf"
                    "asdf.txt"
                    "dir/asdf.txt"
                    "collections/asdf.txt"
                    "collections/asdf/a.txt"
                    "invalid/collections/asdf/a.txt"
                    (str "collections/" id)
                    (str "collections/" id "/but_no_name")]]
        (testing path
          (is (= path (#'git/path-prefix path)))
          (is (true? (#'git/matches-prefix path #{(str "collections/" (u/generate-nano-id)) path}))))))
    (testing "In a collection"
      (doseq [path [(str "collections/" id "_my_name/asdf")
                    (str "collections/" id "_other_name/subdir/asdf.txt")]]
        (testing path
          (is (= (str "collections/" id) (#'git/path-prefix path)))
          (is (true? (#'git/matches-prefix path #{(str "collections/" id) (str "collections/" (u/generate-nano-id))}))))))
    (testing "Special collections"
      (is (= "collections/transformtags" (#'git/path-prefix "collections/transformtags/somefile.txt")))
      (is (true? (#'git/matches-prefix "collections/transformtags/somefile.txt" #{"collections/transformtags"})))
      (is (= "collections/transformjobs" (#'git/path-prefix "collections/transformjobs/somefile.txt"))))))

(deftest qualify-branch-test
  (is (= "refs/heads/main" (#'git/qualify-branch "main")))
  (is (= "refs/heads/main" (#'git/qualify-branch "refs/heads/main"))))

(deftest get-commit-ref
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! "master" remote-dir :branches ["branch-1" "branch-2"])
          master-ref (git/->commit-id source "master")]
      (is (string? master-ref))
      (is (= master-ref (git/->commit-id source (#'git/->commit-id source "master"))))
      (is (not= master-ref (git/->commit-id source (#'git/->commit-id source "branch-1"))))
      (is (not= master-ref (git/->commit-id source (#'git/->commit-id source "branch-2"))))

      (is (nil? (git/->commit-id source "invalid"))))))

(deftest log
  (mt/with-temp-dir [remote-dir nil]
    (let [[master remote] (init-source! "master" remote-dir :branches ["branch-1" "branch-2"])
          branch-1 (->source! "branch-1" remote)
          invalid (->source! "invalid" remote)]
      (is (= ["Initial commit"] (map :message (git/log master))))
      (is (= ["Init branch branch-1" "Initial commit"] (map :message (git/log branch-1))))
      (is (nil? (git/log invalid))))))
;
(deftest branches
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! "master" remote-dir :branches ["branch-1" "branch-2"])]
      ;; add extra branch to remote to check it is picked up
      (git-working-create-branch! _remote "branch-3")
      (is (= ["branch-1" "branch-2" "branch-3" "master"] (source.p/branches source))))))
;
(deftest list-files
  (mt/with-temp-dir [remote-dir nil]
    (let [[master remote] (init-source! "master" remote-dir
                                        :files {"master.txt"      "File in master"
                                                "subdir/path.txt" "File in subdir"}
                                        :branches ["branch-1" "branch-2"])
          branch-1 (->source! "branch-1" remote)
          branch-2 (->source! "branch-2" remote)]
      (is (= ["master.txt" "subdir/path.txt"] (source.p/list-files master)))
      (is (= ["file-in-branch-1.txt" "master.txt" "subdir/path.txt"] (source.p/list-files branch-1)))
      (is (= ["file-in-branch-2.txt" "master.txt" "subdir/path.txt"] (source.p/list-files branch-2))))))

(deftest read-file
  (mt/with-temp-dir [remote-dir nil]
    (let [[master _remote] (init-source! "master" remote-dir
                                         :files {"master.txt"      "File in master"
                                                 "subdir/path.txt" "File in subdir"}
                                         :branches ["branch-1" "branch-2"])
          branch-1 (->source! "branch-1" _remote)
          invalid-branch (->source! "invalid-branch" _remote)]
      (testing "Reading master"
        (is (= "File in master" (source.p/read-file master "master.txt")))
        (is (= "File in subdir" (source.p/read-file master "subdir/path.txt")))
        (is (nil? (source.p/read-file master "file-in-branch-1.txt"))))

      (testing "Reading branch-1"
        (is (= "File in master" (source.p/read-file branch-1 "master.txt")))
        (is (= "File in branch-1" (source.p/read-file branch-1 "file-in-branch-1.txt")))
        (is (nil? (source.p/read-file branch-1 "file-in-branch-2.txt"))))

      (testing "Reading invalid branch"
        (is (nil? (source.p/read-file invalid-branch "master.txt")))))))

(deftest write-files
  (let [subdir-path (str "collections/" "r" (subs (u/generate-nano-id "a") 1) "_subdir/")
        otherdir-path (str "collections/" "o" (subs (u/generate-nano-id "b") 1) "_otherdir/")
        thirddir-path (str "collections/" "s" (subs (u/generate-nano-id "c") 1) "_thirddir/")
        branched-path (str "collections/" "b" (subs (u/generate-nano-id "d") 1) "_branched/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master remote] (init-source! "master" remote-dir
                                          :files {"master.txt"                    "File in master"
                                                  "master2.txt"                   "File 2 in master"
                                                  (str subdir-path "path.txt")    "File in subdir"
                                                  (str subdir-path "path2.txt")   "File 2 in subdir"
                                                  (str otherdir-path "path.txt")  "File in otherdir"
                                                  (str otherdir-path "path2.txt") "File 2 in otherdir"
                                                  (str thirddir-path "path.txt")  "File in third dir"
                                                  (str thirddir-path "path2.txt") "File 2 in third dir"}
                                          :branches ["branch-1" "branch-2"])
            new-branch (->source! "new-branch" remote)]
        (testing "Files in a subdir are replaced, other subdirs and root are unchanged"
          (source.p/write-files! master "Update 1" [{:path "master.txt" :content "Updated master content"}
                                                    {:path (str subdir-path "path.txt") :content "Updated subdir content"}
                                                    {:path (str subdir-path "path3.txt") :content "Updated subdir content 3"}
                                                    {:path (str thirddir-path "path.txt") :content "Updated third dir content"}
                                                    {:path (str thirddir-path "path3.txt") :content "Updated third dir content 3"}])
          (is (= ["Update 1" "Initial commit"] (map :message (git/log master))))
          (is (= [(str otherdir-path "path.txt")
                  (str otherdir-path "path2.txt")
                  (str subdir-path "path.txt")
                  (str subdir-path "path3.txt")
                  (str thirddir-path "path.txt")
                  (str thirddir-path "path3.txt")
                  "master.txt"
                  "master2.txt"]
                 (source.p/list-files master)))

          (is (= "Updated master content" (source.p/read-file master "master.txt")))
          (is (= "File 2 in master" (source.p/read-file master "master2.txt")))
          (is (= "File 2 in otherdir" (source.p/read-file master (str otherdir-path "path2.txt"))))
          (is (= "Updated subdir content" (source.p/read-file master (str subdir-path "path.txt"))))
          (is (= "Updated subdir content 3" (source.p/read-file master (str subdir-path "path3.txt"))))

          (testing "Check remote repo directly"
            (is (= "Updated master content" (git/read-file (assoc remote :commit-ish "master") "master.txt")))
            (is (= [(str otherdir-path "path.txt")
                    (str otherdir-path "path2.txt")
                    (str subdir-path "path.txt")
                    (str subdir-path "path3.txt")
                    (str thirddir-path "path.txt")
                    (str thirddir-path "path3.txt")
                    "master.txt"
                    "master2.txt"]
                   (git/list-files (assoc remote :commit-ish "master"))))
            (is (= ["Update 1" "Initial commit"] (map :message (git/log (assoc remote :commit-ish "master")))))))

        (testing "If no root fils are touched, they all stay as-is"
          (source.p/write-files! master "Update 2" [{:path (str thirddir-path "path.txt") :content "Only third dir content"}])
          (is (= [(str otherdir-path "path.txt")
                  (str otherdir-path "path2.txt")
                  (str subdir-path "path.txt")
                  (str subdir-path "path3.txt")
                  (str thirddir-path "path.txt")
                  "master.txt"
                  "master2.txt"]
                 (git/list-files (assoc remote :commit-ish "master")))))

        (testing "Writing a a new branch"
          (source.p/write-files! new-branch "New Branch" [{:path (str branched-path "branched-file.txt") :content "File added to branch"}
                                                          {:path (str branched-path "branched-file2.txt") :content "File 2 added to branch"}
                                                          {:path (str otherdir-path "path.txt") :content "Updated collections/otherdir/path in branch"}
                                                          {:path (str otherdir-path "path3.txt") :content "Updated collections/otherdir/path in branch"}
                                                          {:path "new-file.txt" :content "Updated file in branch"}])

          (is (= "File added to branch" (source.p/read-file new-branch (str branched-path "branched-file.txt"))))
          (is (= "Updated file in branch" (source.p/read-file new-branch "new-file.txt")))
          (is (= [(str branched-path "branched-file.txt")
                  (str branched-path "branched-file2.txt")
                  (str otherdir-path "path.txt")
                  (str otherdir-path "path3.txt")
                  (str subdir-path "path.txt")
                  (str subdir-path "path3.txt")
                  (str thirddir-path "path.txt")
                  "master.txt"
                  "master2.txt"
                  "new-file.txt"]
                 (source.p/list-files new-branch)))
          (is (= ["New Branch" "Update 2" "Update 1" "Initial commit"] (map :message (git/log new-branch))))

          (testing "Check remote repo"
            (is (= ["New Branch" "Update 2" "Update 1" "Initial commit"] (map :message (git/log (assoc remote :commit-ish "new-branch")))))))

        (testing "Updating a branch"
          (source.p/write-files! new-branch "Updating Branch" [{:path (str branched-path "branched-file.txt") :content "File updated in branch"}
                                                               {:path (str branched-path "branched-file3.txt") :content "File 3 updated in branch"}
                                                               {:path "another-file.txt" :content "Added in 2nd commit"}])

          (is (= "File updated in branch" (source.p/read-file new-branch (str branched-path "branched-file.txt"))))
          (is (= "Added in 2nd commit" (source.p/read-file new-branch "another-file.txt")))
          (is (= ["another-file.txt"
                  (str branched-path "branched-file.txt")
                  (str branched-path "branched-file3.txt")
                  (str otherdir-path "path.txt")
                  (str otherdir-path "path3.txt")
                  (str subdir-path "path.txt")
                  (str subdir-path "path3.txt")
                  (str thirddir-path "path.txt")
                  "master.txt"
                  "master2.txt"
                  "new-file.txt"]
                 (source.p/list-files new-branch)))
          (is (= ["Updating Branch" "New Branch" "Update 2" "Update 1" "Initial commit"] (map :message (git/log new-branch))))

          (testing "Check remote repo"
            (is (= ["Updating Branch" "New Branch" "Update 2" "Update 1" "Initial commit"] (map :message (git/log (assoc remote :commit-ish "new-branch")))))))))))

(deftest write-special-collections
  (let [subdir-path (str "collections/" "r" (subs (u/generate-nano-id "a") 1) "_subdir/")
        transformtags-path "collections/transformtags/"
        transformjobs-path "collections/transformjobs/"]
    (mt/with-temp-dir [remote-dir nil]
      (let [[_master _remote] (init-source! "master" remote-dir
                                            :files {"master.txt"                 "File in master"
                                                    (str subdir-path "path.txt") "File in subdir"})
            transform-branch (->source! "transform-branch" _remote)]
        (testing "Special collections"
          (source.p/write-files! transform-branch "Add transforms" [{:path (str transformtags-path "tag1.yaml") :content "tag1"}
                                                                    {:path (str transformtags-path "tag2.yaml") :content "tag2"}
                                                                    {:path (str transformjobs-path "job1.yaml") :content "job1"}
                                                                    {:path (str transformjobs-path "job2.yaml") :content "job2"}])
          (is (= ["Add transforms" "Initial commit"] (map :message (git/log transform-branch))))
          (is (= [(str subdir-path "path.txt")
                  (str transformjobs-path "job1.yaml")
                  (str transformjobs-path "job2.yaml")
                  (str transformtags-path "tag1.yaml")
                  (str transformtags-path "tag2.yaml")
                  "master.txt"]
                 (source.p/list-files transform-branch)))

          (testing "Can update transforms"
            (source.p/write-files! transform-branch "Update transforms" [{:path (str transformtags-path "tag1.yaml") :content "updated tag1"}
                                                                         {:path (str transformtags-path "tag2.yaml") :content "updated tag2"}
                                                                         {:path (str transformtags-path "tag3.yaml") :content "updated tag3"}
                                                                         {:path (str transformjobs-path "job1.yaml") :content "updated job1"}
                                                                         {:path (str transformjobs-path "job2.yaml") :content "updated job2"}
                                                                         {:path (str transformjobs-path "job3.yaml") :content "updated job3"}
                                                                         {:path (str subdir-path "path.txt") :content "updated other-collection"}])
            (is (= ["Update transforms" "Add transforms" "Initial commit"] (map :message (git/log transform-branch))))

            (is (= [(str subdir-path "path.txt")
                    (str transformjobs-path "job1.yaml")
                    (str transformjobs-path "job2.yaml")
                    (str transformjobs-path "job3.yaml")
                    (str transformtags-path "tag1.yaml")
                    (str transformtags-path "tag2.yaml")
                    (str transformtags-path "tag3.yaml")
                    "master.txt"]
                   (source.p/list-files transform-branch)))))))))

(deftest concurrent-access
  (let [subdir-path (str "collections/" (u/generate-nano-id "a") "_subdir")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master remote] (init-source! "master" remote-dir
                                          :files {"master.txt"                 "File in master"
                                                  (str subdir-path "path.txt") "File in subdir"}
                                          :branches ["branch-1" "branch-2"])
            new-branch (->source! "new-branch" remote)]

        (testing "Initial clone is the same"
          (is (= ["Initial commit"] (map :message (git/log master))))
          (is (= ["Initial commit"] (map :message (git/log (assoc remote :commit-ish "master")))))

          ;; Add an extra commit to remote
          (git-working-add! remote "additional-file.txt" "Additional file content")
          (git-working-commit! remote "Added additional file")

          (testing "Source is behind remote"
            (is (= ["Initial commit"] (map :message (git/log master))))
            (is (= ["Added additional file" "Initial commit"] (map :message (git/log (assoc remote :commit-ish "master")))))

            (is (= "File in master" (source.p/read-file master "master.txt")))
            (is (nil? (source.p/read-file master "additional-file.txt"))))

          (testing "After fetch, source is up to date"
            (git/fetch! master)
            (is (= "Additional file content" (source.p/read-file master "additional-file.txt")))
            (is (= ["Added additional file" "Initial commit"] (map :message (git/log master)))))

          (testing "Writing a file to source and pushing back to remote when there is new content on remote"
            ;; Make source be behind again
            (git-working-add! remote "only-on-remote.txt" "Initially on remote")
            (git-working-commit! remote "Only on remote")

            (source.p/write-files! master "Added to source" [{:path "initially-source.txt" :content "Initially on source"}])

            (testing "Remote has the new commit with just the files committed, but only version is in history"
              (is (= ["Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log (assoc remote :commit-ish "master")))))
              (is (= ["additional-file.txt" (str subdir-path "path.txt") "initially-source.txt" "master.txt" "only-on-remote.txt"] (git/list-files (assoc remote :commit-ish "master"))))
              (is (= "Initially on source" (git/read-file (assoc remote :commit-ish "master") "initially-source.txt"))))

            (testing "Source has the same history"
              (is (= (map :message (git/log (assoc remote :commit-ish "master"))) (map :message (git/log master))))))

          (testing "Writing to a branch local has not seen (but remote has) adds it to the history on remote"
            (git-working-checkout! remote "new-branch" true)
            (git-working-add! remote "new-branch-file.txt" "Initially on remote")
            (git-working-add! remote "new-branch-remote.txt" "Initially on remote")
            (git-working-commit! remote "New-branch on remote")

            (is (= ["New-branch on remote" "Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log (assoc remote :commit-ish "new-branch")))))
            (is (nil? (git/log new-branch)))

            (source.p/write-files! new-branch "New-branch on source" [{:path "new-branch-source.txt" :content "Initially on source"}
                                                                      {:path "new-branch-file.txt" :content "Updated on source"}])

            (is (= ["New-branch on source" "New-branch on remote" "Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log (assoc remote :commit-ish "new-branch")))))))))))

(deftest git-source-using-commit-ref
  (mt/with-temp-dir [remote-dir nil]
    (let [[master remote] (init-source! "master" remote-dir
                                        :files {"master.txt"      "File in master"
                                                "subdir/path.txt" "File in subdir"})
          original-ref (git/->commit-id master "master")]

      (source.p/write-files! master "Update file" [{:path "master.txt" :content "Updated file in master"}
                                                   {:path "new-file.txt" :content "New file in master"}])
      (let [old-master (->source! original-ref remote)]
        (is (= "File in master" (source.p/read-file old-master "master.txt")))
        (is (= "Updated file in master" (source.p/read-file master "master.txt")))
        (is (= ["master.txt" "subdir/path.txt"] (source.p/list-files old-master)))))))
