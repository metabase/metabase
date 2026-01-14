(ns metabase-enterprise.remote-sync.source.git-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import (java.io File)
           (org.apache.commons.io FileUtils)
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
                (.setInitialBranch "master")
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
        local-repo (#'git/get-jgit (#'git/repo-path {:remote-url remote-url}) {:remote-url remote-url})]
    (git/->GitSource local-repo remote-url branch nil)))

(defn- init-source!
  [branch dir & config]
  (FileUtils/deleteDirectory (io/file dir))
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
          (is (true? (#'git/matches-prefix path #{(str "collections/" id) (str "collections/" (u/generate-nano-id))}))))))))

(deftest qualify-branch-test
  (is (= "refs/heads/main" (#'git/qualify-branch "main")))
  (is (= "refs/heads/main" (#'git/qualify-branch "refs/heads/main"))))

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

(deftest snapshot
  (mt/with-temp-dir [remote-dir nil]
    (let [[master _remote] (init-source! "master" remote-dir
                                         :files {"master.txt" "File in master"
                                                 "subdir/path.txt" "File in subdir"}
                                         :branches ["branch-1" "branch-2"])
          master-snapshot (source.p/snapshot master)]
      (is (= (git/commit-sha master "master") (:version master-snapshot))))))

(deftest list-files
  (mt/with-temp-dir [remote-dir nil]
    (let [[master remote] (init-source! "master" remote-dir
                                        :files {"master.txt" "File in master"
                                                "subdir/path.txt" "File in subdir"}
                                        :branches ["branch-1" "branch-2"])
          master-snap (source.p/snapshot master)
          branch-1 (source.p/snapshot (->source! "branch-1" remote))
          branch-2 (source.p/snapshot (->source! "branch-2" remote))]
      (is (= ["master.txt" "subdir/path.txt"] (source.p/list-files master-snap)))
      (is (= ["file-in-branch-1.txt" "master.txt" "subdir/path.txt"] (source.p/list-files branch-1)))
      (is (= ["file-in-branch-2.txt" "master.txt" "subdir/path.txt"] (source.p/list-files branch-2))))))

(deftest read-file
  (mt/with-temp-dir [remote-dir nil]
    (let [[master _remote] (init-source! "master" remote-dir
                                         :files {"master.txt" "File in master"
                                                 "subdir/path.txt" "File in subdir"}
                                         :branches ["branch-1" "branch-2"])
          master-snap (source.p/snapshot master)
          branch-1 (source.p/snapshot (->source! "branch-1" _remote))]
      (testing "Reading master"
        (is (= "File in master" (source.p/read-file master-snap "master.txt")))
        (is (= "File in subdir" (source.p/read-file master-snap "subdir/path.txt")))
        (is (nil? (source.p/read-file master-snap "file-in-branch-1.txt"))))

      (testing "Reading branch-1"
        (is (= "File in master" (source.p/read-file branch-1 "master.txt")))
        (is (= "File in branch-1" (source.p/read-file branch-1 "file-in-branch-1.txt")))
        (is (nil? (source.p/read-file branch-1 "file-in-branch-2.txt")))))))

(deftest write-files
  (let [subdir-path (str "collections/" "r" (subs (u/generate-nano-id "a") 1) "_subdir/")
        otherdir-path (str "collections/" "o" (subs (u/generate-nano-id "b") 1) "_otherdir/")
        thirddir-path (str "collections/" "s" (subs (u/generate-nano-id "c") 1) "_thirddir/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master remote] (init-source! "master" remote-dir
                                          :files {"master.txt" "File in master"
                                                  "master2.txt" "File 2 in master"
                                                  (str subdir-path "path.txt") "File in subdir"
                                                  (str subdir-path "path2.txt") "File 2 in subdir"
                                                  (str otherdir-path "path.txt") "File in otherdir"
                                                  (str otherdir-path "path2.txt") "File 2 in otherdir"
                                                  (str thirddir-path "path.txt") "File in third dir"
                                                  (str thirddir-path "path2.txt") "File 2 in third dir"}
                                          :branches ["branch-1" "branch-2"])]
        (testing "Files in a subdir are replaced, other subdirs and root are unchanged"
          (source.p/write-files! (source.p/snapshot master) "Update 1" [{:path "master.txt" :content "Updated master content"}
                                                                        {:path (str subdir-path "path.txt") :content "Updated subdir content"}
                                                                        {:path (str subdir-path "path3.txt") :content "Updated subdir content 3"}
                                                                        {:path (str thirddir-path "path.txt") :content "Updated third dir content"}
                                                                        {:path (str thirddir-path "path3.txt") :content "Updated third dir content 3"}])
          (is (= ["Update 1" "Initial commit"] (map :message (git/log master))))
          (let [master-snap (source.p/snapshot master)]
            (is (= [(str otherdir-path "path.txt")
                    (str otherdir-path "path2.txt")
                    (str subdir-path "path.txt")
                    (str subdir-path "path3.txt")
                    (str thirddir-path "path.txt")
                    (str thirddir-path "path3.txt")
                    "master.txt"
                    "master2.txt"]
                   (source.p/list-files master-snap)))

            (is (= "Updated master content" (source.p/read-file master-snap "master.txt")))
            (is (= "File 2 in master" (source.p/read-file master-snap "master2.txt")))
            (is (= "File 2 in otherdir" (source.p/read-file master-snap (str otherdir-path "path2.txt"))))
            (is (= "Updated subdir content" (source.p/read-file master-snap (str subdir-path "path.txt"))))
            (is (= "Updated subdir content 3" (source.p/read-file master-snap (str subdir-path "path3.txt")))))

          (testing "Check remote repo directly"
            (is (= "Updated master content" (git/read-file (assoc remote :version "master") "master.txt")))
            (is (= [(str otherdir-path "path.txt")
                    (str otherdir-path "path2.txt")
                    (str subdir-path "path.txt")
                    (str subdir-path "path3.txt")
                    (str thirddir-path "path.txt")
                    (str thirddir-path "path3.txt")
                    "master.txt"
                    "master2.txt"]
                   (git/list-files (assoc remote :version "master"))))
            (is (= ["Update 1" "Initial commit"] (map :message (git/log (assoc remote :branch "master")))))))

        (testing "If no root files are touched, they all stay as-is"
          (source.p/write-files! (source.p/snapshot master) "Update 2" [{:path (str thirddir-path "path.txt") :content "Only third dir content"}])
          (is (= [(str otherdir-path "path.txt")
                  (str otherdir-path "path2.txt")
                  (str subdir-path "path.txt")
                  (str subdir-path "path3.txt")
                  (str thirddir-path "path.txt")
                  "master.txt"
                  "master2.txt"]
                 (git/list-files (assoc remote :version "master")))))))))

(deftest write-special-collections
  (let [subdir-path (str "collections/" "r" (subs (u/generate-nano-id "a") 1) "_subdir/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[_master _remote] (init-source! "master" remote-dir
                                            :files {"master.txt" "File in master"
                                                    (str subdir-path "path.txt") "File in subdir"})]))))

(deftest concurrent-access
  (let [subdir-path (str "collections/" (u/generate-nano-id "a") "_subdir")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master remote] (init-source! "master" remote-dir
                                          :files {"master.txt" "File in master"
                                                  (str subdir-path "path.txt") "File in subdir"}
                                          :branches ["branch-1" "branch-2"])
            new-branch (->source! "new-branch" remote)]

        (testing "Initial clone is the same"
          (is (= ["Initial commit"] (map :message (git/log master))))
          (is (= ["Initial commit"] (map :message (git/log (assoc remote :branch "master")))))

          ;; Add an extra commit to remote
          (git-working-add! remote "additional-file.txt" "Additional file content")
          (git-working-commit! remote "Added additional file")

          (testing "Source is behind remote"
            (is (= ["Initial commit"] (map :message (git/log master))))
            (is (= ["Added additional file" "Initial commit"] (map :message (git/log (assoc remote :branch "master"))))))

          (testing "After fetch, source is up to date"
            (git/fetch! master)
            (is (= ["Added additional file" "Initial commit"] (map :message (git/log master)))))

          (testing "Writing a file to source and pushing back to remote when there is new content on remote"
            ;; Make source be behind again
            (git-working-add! remote "only-on-remote.txt" "Initially on remote")
            (git-working-commit! remote "Only on remote")

            (source.p/write-files! (source.p/snapshot master) "Added to source" [{:path "initially-source.txt" :content "Initially on source"}])

            (testing "Remote has the new commit with just the files committed, but only version is in history"
              (is (= ["Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log (assoc remote :branch "master")))))
              (is (= ["additional-file.txt" (str subdir-path "path.txt") "initially-source.txt" "master.txt" "only-on-remote.txt"] (git/list-files (assoc remote :version "master"))))
              (is (= "Initially on source" (git/read-file (assoc remote :version "master") "initially-source.txt"))))

            (testing "Source has the same history"
              (is (= (map :message (git/log (assoc remote :branch "master"))) (map :message (git/log master))))))

          (testing "Writing to a branch local has not seen (but remote has) adds it to the history on remote"
            (git-working-checkout! remote "new-branch" true)
            (git-working-add! remote "new-branch-file.txt" "Initially on remote")
            (git-working-add! remote "new-branch-remote.txt" "Initially on remote")
            (git-working-commit! remote "New-branch on remote")

            (is (= ["New-branch on remote" "Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log (assoc remote :branch "new-branch")))))
            (is (nil? (git/log new-branch)))

            (source.p/write-files! (source.p/snapshot new-branch) "New-branch on source" [{:path "new-branch-source.txt" :content "Initially on source"}
                                                                                          {:path "new-branch-file.txt" :content "Updated on source"}])

            (is (= ["New-branch on source" "New-branch on remote" "Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log (assoc remote :branch "new-branch")))))))))))

(deftest git-source-using-commit-ref
  (mt/with-temp-dir [remote-dir nil]
    (let [[master _remote] (init-source! "master" remote-dir
                                         :files {"master.txt" "File in master"
                                                 "subdir/path.txt" "File in subdir"})
          old-master (source.p/snapshot master)]

      (source.p/write-files! (source.p/snapshot master) "Update file" [{:path "master.txt" :content "Updated file in master"}
                                                                       {:path "new-file.txt" :content "New file in master"}])
      (is (= "File in master" (source.p/read-file old-master "master.txt")))
      (is (= "Updated file in master" (source.p/read-file (source.p/snapshot master) "master.txt")))
      (is (= ["master.txt" "subdir/path.txt"] (source.p/list-files old-master))))))

(deftest version-test
  (testing "version returns the commit id for the current state"
    (mt/with-temp-dir [remote-dir nil]
      (let [[master remote] (init-source! "master" remote-dir
                                          :files {"master.txt" "File in master"})
            initial-version (source.p/version (source.p/snapshot master))]
        (is (string? initial-version) "version should return a string")
        (is (= 40 (count initial-version)) "version should be a full SHA-1 hash (40 characters)")
        (is (= (git/commit-sha master "master") initial-version)
            "version should match the commit id for the branch")

        (testing "version changes after writing files"
          (source.p/write-files! (source.p/snapshot master) "Update file" [{:path "master.txt" :content "Updated content"}])
          (let [new-version (source.p/version (source.p/snapshot master))]
            (is (not= initial-version new-version) "version should change after commit")
            (is (= 40 (count new-version)) "new version should also be a full SHA-1 hash")
            (is (= (git/commit-sha master "master") new-version)
                "new version should match the new commit id")))

        (testing "version is consistent across multiple calls"
          (let [version-1 (source.p/version (source.p/snapshot master))
                version-2 (source.p/version (source.p/snapshot master))]
            (is (= version-1 version-2) "version should be consistent without changes")))

        (testing "version differs for different branches"
          (git-working-create-branch! remote "branch-1")
          (let [branch-1 (->source! "branch-1" remote)
                master-version (source.p/version (source.p/snapshot master))
                branch-version (source.p/version (source.p/snapshot branch-1))]
            (is (not= master-version branch-version)
                "different branches should have different versions")))

        (testing "version matches specific commit ref"
          (let [commit-ref (git/commit-sha master "master")
                source-with-ref (->source! commit-ref remote)]
            (is (= commit-ref (source.p/version (source.p/snapshot source-with-ref)))
                "version should work with explicit commit refs")))))))

(deftest default-branch
  (mt/with-temp-dir [remote-dir nil]
    (let [[master _remote] (init-source! "master" remote-dir)]
      (is (= "master" (git/default-branch master))))))

(deftest write-files-removal-test
  (let [subdir-path (str "collections/" "r" (subs (u/generate-nano-id "a") 1) "_subdir/")
        otherdir-path (str "collections/" "o" (subs (u/generate-nano-id "b") 1) "_otherdir/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"master.txt" "File in master"
                                                   (str subdir-path "file1.yaml") "File 1 in subdir"
                                                   (str subdir-path "file2.yaml") "File 2 in subdir"
                                                   (str otherdir-path "file1.yaml") "File 1 in otherdir"
                                                   (str otherdir-path "file2.yaml") "File 2 in otherdir"})]
        (testing "Removal entry deletes all files under that path recursively"
          (source.p/write-files! (source.p/snapshot master) "Remove subdir"
                                 [{:path (subs subdir-path 0 (dec (count subdir-path))) :remove? true}])
          (let [files (set (source.p/list-files (source.p/snapshot master)))]
            (is (contains? files "master.txt") "Root files should remain")
            (is (contains? files (str otherdir-path "file1.yaml")) "Other collection files should remain")
            (is (contains? files (str otherdir-path "file2.yaml")) "Other collection files should remain")
            (is (not (contains? files (str subdir-path "file1.yaml"))) "Subdir files should be removed")
            (is (not (contains? files (str subdir-path "file2.yaml"))) "Subdir files should be removed")))))))

(deftest write-files-mixed-write-and-removal-test
  (let [subdir-path (str "collections/" "r" (subs (u/generate-nano-id "a") 1) "_subdir/")
        newdir-path (str "collections/" "n" (subs (u/generate-nano-id "b") 1) "_newdir/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"master.txt" "File in master"
                                                   (str subdir-path "old-file.yaml") "Old file in subdir"})]
        (testing "Can combine write and removal entries in same call"
          (source.p/write-files! (source.p/snapshot master) "Mixed operations"
                                 [{:path (subs subdir-path 0 (dec (count subdir-path))) :remove? true}
                                  {:path (str newdir-path "new-file.yaml") :content "New file content"}])
          (let [snap (source.p/snapshot master)
                files (set (source.p/list-files snap))]
            (is (contains? files "master.txt") "Root files should remain")
            (is (contains? files (str newdir-path "new-file.yaml")) "New files should be added")
            (is (not (contains? files (str subdir-path "old-file.yaml"))) "Old files should be removed")
            (is (= "New file content" (source.p/read-file snap (str newdir-path "new-file.yaml"))))))))))

(deftest write-files-empty-removal-path-test
  (mt/with-temp-dir [remote-dir nil]
    (let [[master _remote] (init-source! "master" remote-dir
                                         :files {"master.txt" "File in master"
                                                 "subdir/file.yaml" "File in subdir"})]
      (testing "Empty removal paths are ignored (no-op)"
        (source.p/write-files! (source.p/snapshot master) "Empty removal"
                               [{:path "" :remove? true}
                                {:path "   " :remove? true}])
        (let [files (set (source.p/list-files (source.p/snapshot master)))]
          (is (= #{"master.txt" "subdir/file.yaml"} files)
              "All files should remain when removal path is empty"))))))

(deftest write-files-nonexistent-removal-path-test
  (mt/with-temp-dir [remote-dir nil]
    (let [[master _remote] (init-source! "master" remote-dir
                                         :files {"master.txt" "File in master"})]
      (testing "Removing non-existent path is a no-op"
        (source.p/write-files! (source.p/snapshot master) "Remove nonexistent"
                               [{:path "collections/nonexistent" :remove? true}])
        (let [files (set (source.p/list-files (source.p/snapshot master)))]
          (is (= #{"master.txt"} files)
              "Files should remain unchanged"))))))

(deftest ensure-origin-configured-sets-origin-after-clone-test
  (mt/with-temp-dir [remote-dir nil]
    (let [[source _remote] (init-source! "master" remote-dir
                                         :files {"master.txt" "File in master"})
          ^Git local-git (:git source)
          config (.getConfig (.getRepository local-git))
          origin-url (.getString config "remote" "origin" "url")]
      (is (some? origin-url) "Origin URL should be set after clone"))))

(deftest ensure-origin-configured-repairs-corrupted-url-test
  (mt/with-temp-dir [remote-dir nil]
    (let [[source remote] (init-source! "master" remote-dir
                                        :files {"master.txt" "File in master"})
          ^Git local-git (:git source)
          config (.getConfig (.getRepository local-git))
          corrupted-url "https://wrong-url.example.com/repo.git"]
      (.setString config "remote" "origin" "url" corrupted-url)
      (.save config)
      (is (= corrupted-url (.getString config "remote" "origin" "url"))
          "Origin URL should be corrupted")
      (reset! @#'git/jgit {})
      (let [repaired-source (->source! "master" remote)
            ^Git repaired-git (:git repaired-source)
            repaired-config (.getConfig (.getRepository repaired-git))
            repaired-url (.getString repaired-config "remote" "origin" "url")]
        (is (not= corrupted-url repaired-url)
            "Origin URL should no longer be the corrupted URL")
        (is (str/includes? repaired-url remote-dir)
            "Origin URL should point to the remote directory")))))

(deftest ensure-origin-configured-sets-fetch-refspec-test
  (mt/with-temp-dir [remote-dir nil]
    (let [[source remote] (init-source! "master" remote-dir
                                        :files {"master.txt" "File in master"})
          ^Git local-git (:git source)
          config (.getConfig (.getRepository local-git))]
      (.setString config "remote" "origin" "url" "https://wrong-url.example.com/repo.git")
      (.unset config "remote" "origin" "fetch")
      (.save config)
      (reset! @#'git/jgit {})
      (let [repaired-source (->source! "master" remote)
            ^Git repaired-git (:git repaired-source)
            repaired-config (.getConfig (.getRepository repaired-git))]
        (is (= "+refs/heads/*:refs/heads/*"
               (.getString repaired-config "remote" "origin" "fetch"))
            "Origin fetch refspec should be set after repair")))))

(deftest ensure-origin-configured-allows-fetch-after-repair-test
  (mt/with-temp-dir [remote-dir nil]
    (let [[source remote] (init-source! "master" remote-dir
                                        :files {"master.txt" "File in master"})
          ^Git local-git (:git source)
          config (.getConfig (.getRepository local-git))]
      (.setString config "remote" "origin" "url" "https://wrong-url.example.com/repo.git")
      (.save config)
      (reset! @#'git/jgit {})
      (let [repaired-source (->source! "master" remote)]
        (git-working-add! remote "new-file.txt" "New content")
        (git-working-commit! remote "Add new file")
        (git/fetch! repaired-source)
        (is (= ["Add new file" "Initial commit"]
               (map :message (git/log repaired-source)))
            "Should be able to fetch after origin repair")))))
