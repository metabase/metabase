(ns metabase-enterprise.remote-sync.source.git-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import (java.io File)
           (org.apache.commons.io FileUtils)
           (org.eclipse.jgit.api Git TransportCommand)
           (org.eclipse.jgit.lib PersonIdent)
           (org.eclipse.jgit.transport UsernamePasswordCredentialsProvider)))

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
    (git/->GitSource local-repo remote-url branch nil ingest/legal-top-level-paths)))

(defn- init-source!
  [branch dir & config]
  (FileUtils/deleteDirectory (io/file dir))
  (let [remote-repo (apply init-remote! dir config)]
    [(->source! branch remote-repo) remote-repo]))

(defn- command-timeout
  "Reads the protected `timeout` field (in seconds) that JGit applies to a TransportCommand's
   network operations. 0 means no timeout (JGit's default), i.e. the operation can hang forever."
  [^TransportCommand cmd]
  (let [f (.getDeclaredField TransportCommand "timeout")]
    (.setAccessible f true)
    (.getInt f cmd)))

(deftest qualify-branch-test
  (is (= "refs/heads/main" (#'git/qualify-branch "main")))
  (is (= "refs/heads/main" (#'git/qualify-branch "refs/heads/main"))))

(deftest call-remote-command-applies-network-timeout-test
  (testing "Remote git operations get a positive network timeout so a stalled connection can't hang
            the sync thread forever (GHY-3727: pull/push gets stuck at progress 0 and 0.3)"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source _remote] (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            ^Git git (:git source)
            cmd (.lsRemote git)]
        (#'git/call-remote-command cmd source)
        (is (pos? (command-timeout cmd))
            "TransportCommand should have a positive (non-zero) timeout configured before .call")))))

(deftest call-remote-command-respects-timeout-setting-test
  (testing "The network timeout applied to remote git operations is driven by remote-sync-git-timeout-seconds"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source _remote] (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            ^Git git (:git source)
            cmd (.lsRemote git)]
        (mt/with-temporary-setting-values [remote-sync-git-timeout-seconds 17]
          (#'git/call-remote-command cmd source)
          (is (= 17 (command-timeout cmd))))))))

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

(deftest commit-sha-missing-object-is-nil-test
  (testing "GHY-3917: a full SHA whose object isn't in the clone resolves to nil, not a phantom id"
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"master.txt" "File in master"})
            ;; JGit parses any complete 40-hex string into an ObjectId without a presence check; the
            ;; existence guard is what turns a base commit orphaned by an upstream force-push/rebase into
            ;; nil here instead of a later MissingObjectException when its tree is read.
            absent-sha "0000000000000000000000000000000000000000"]
        (is (some? (git/commit-sha master "master"))
            "a real ref still resolves")
        (is (nil? (git/commit-sha master absent-sha))
            "a syntactically valid but absent full SHA resolves to nil")
        (is (nil? (source.p/snapshot-at master absent-sha))
            "snapshot-at returns nil for the orphaned base, so callers take the history-rewritten path")))))

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
        thirddir-path (str "collections/" "s" (subs (u/generate-nano-id "c") 1) "_thirddir/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master remote] (init-source! "master" remote-dir
                                          :files {"master.txt" "File in master"
                                                  "master2.txt" "File 2 in master"
                                                  (str subdir-path "path.txt") "File in subdir"
                                                  (str subdir-path "path2.txt") "File 2 in subdir"
                                                  (str thirddir-path "path.txt") "File in third dir"
                                                  (str thirddir-path "path2.txt") "File 2 in third dir"}
                                          :branches ["branch-1" "branch-2"])]
        (testing "All files in managed dirs not in write set are removed; root files outside managed dirs are preserved"
          (source.p/write-files! (source.p/snapshot master) "Update 1" [{:path "master.txt" :content "Updated master content"}
                                                                        {:path (str subdir-path "path.txt") :content "Updated subdir content"}
                                                                        {:path (str subdir-path "path3.txt") :content "Updated subdir content 3"}
                                                                        {:path (str thirddir-path "path.txt") :content "Updated third dir content"}
                                                                        {:path (str thirddir-path "path3.txt") :content "Updated third dir content 3"}])
          (is (= ["Update 1" "Initial commit"] (map :message (git/log master))))
          (let [master-snap (source.p/snapshot master)]
            ;; otherdir files are removed because collections/ is a managed dir and those files weren't in the write set
            (is (= [(str subdir-path "path.txt")
                    (str subdir-path "path3.txt")
                    (str thirddir-path "path.txt")
                    (str thirddir-path "path3.txt")
                    "master.txt"
                    "master2.txt"]
                   (source.p/list-files master-snap)))
            (is (= "Updated master content" (source.p/read-file master-snap "master.txt")))
            (is (= "File 2 in master" (source.p/read-file master-snap "master2.txt")))
            (is (= "Updated subdir content" (source.p/read-file master-snap (str subdir-path "path.txt"))))
            (is (= "Updated subdir content 3" (source.p/read-file master-snap (str subdir-path "path3.txt")))))
          (testing "Check remote repo directly"
            (is (= "Updated master content" (git/read-file (assoc remote :version "master") "master.txt")))
            (is (= [(str subdir-path "path.txt")
                    (str subdir-path "path3.txt")
                    (str thirddir-path "path.txt")
                    (str thirddir-path "path3.txt")
                    "master.txt"
                    "master2.txt"]
                   (git/list-files (assoc remote :version "master"))))
            (is (= ["Update 1" "Initial commit"] (map :message (git/log (assoc remote :branch "master")))))))
        (testing "Writing only to collections/ removes all other collection files"
          (source.p/write-files! (source.p/snapshot master) "Update 2" [{:path (str thirddir-path "path.txt") :content "Only third dir content"}])
          (is (= [(str thirddir-path "path.txt")
                  "master.txt"
                  "master2.txt"]
                 (git/list-files (assoc remote :version "master")))))))))

(deftest apply-changes
  (let [subdir (str "collections/" "r" (subs (u/generate-nano-id "a") 1) "_subdir/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master remote] (init-source! "master" remote-dir
                                          :files {"master.txt" "root file"
                                                  (str subdir "keep.yaml") "keep me"
                                                  (str subdir "edit.yaml") "old content"
                                                  (str subdir "remove.yaml") "delete me"})]
        (testing "apply-changes! overwrites/adds upserts, removes delete-paths, and PRESERVES every other file"
          (source.p/apply-changes! (source.p/snapshot master) "Incremental"
                                   [{:path (str subdir "edit.yaml") :content "new content"}
                                    {:path (str subdir "new.yaml") :content "brand new"}]
                                   [(str subdir "remove.yaml")])
          (is (= ["Incremental" "Initial commit"] (map :message (git/log master))))
          (let [snap (source.p/snapshot master)]
            (is (= [(str subdir "edit.yaml")
                    (str subdir "keep.yaml")
                    (str subdir "new.yaml")
                    "master.txt"]
                   (source.p/list-files snap))
                "edit overwritten + new added, remove deleted; keep.yaml (managed, untouched) and master.txt preserved")
            (is (= "new content" (source.p/read-file snap (str subdir "edit.yaml"))))
            (is (= "brand new"   (source.p/read-file snap (str subdir "new.yaml"))))
            (is (= "keep me"     (source.p/read-file snap (str subdir "keep.yaml")))
                "a managed-dir file not in the write set is preserved (unlike write-files!)")
            (is (= "root file"   (source.p/read-file snap "master.txt")))
            (is (nil? (source.p/read-file snap (str subdir "remove.yaml")))))
          (testing "the commit was pushed to the remote"
            (is (= ["Incremental" "Initial commit"]
                   (map :message (git/log (assoc remote :branch "master")))))))))))

(deftest apply-changes-preserves-deep-unchanged-subtree-test
  (testing "an incremental upsert leaves deeply-nested, unrelated subtrees untouched (carried forward by id)"
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"collections/a/deep/nested/keep.yaml" "deep keep"
                                                   "collections/a/deep/sibling.yaml"     "deep sibling"
                                                   "collections/b/edit.yaml"             "old"
                                                   "notes.txt"                           "root note"})]
        (source.p/apply-changes! (source.p/snapshot master) "Incremental deep"
                                 [{:path "collections/b/edit.yaml" :content "new"}]
                                 [])
        (let [snap (source.p/snapshot master)]
          (is (= "new" (source.p/read-file snap "collections/b/edit.yaml")))
          (is (= "deep keep" (source.p/read-file snap "collections/a/deep/nested/keep.yaml"))
              "a deeply-nested file in an unrelated subtree is carried forward unchanged")
          (is (= "deep sibling" (source.p/read-file snap "collections/a/deep/sibling.yaml")))
          (is (= "root note" (source.p/read-file snap "notes.txt"))))))))

(deftest write-files-reconciles-every-managed-dir-test
  (testing "a full export wipes every managed dir not covered by the write set, keeps non-managed files, and re-adds an upsert inside a managed dir"
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"collections/old/old.yaml" "old collection"
                                                   "transforms/t1/t.yaml"     "a transform"
                                                   "transforms/t2/t.yaml"     "another transform"
                                                   "notes.txt"                "root note"})]
        (source.p/write-files! (source.p/snapshot master) "Full"
                               [{:path "collections/new/new.yaml" :content "new collection"}])
        (let [snap (source.p/snapshot master)]
          (is (= ["collections/new/new.yaml" "notes.txt"] (source.p/list-files snap))
              "transforms/ (managed, no upserts) fully removed; collections/ reconciled to the write set; non-managed notes.txt preserved")
          (is (= "new collection" (source.p/read-file snap "collections/new/new.yaml")))
          (is (nil? (source.p/read-file snap "collections/old/old.yaml")))
          (is (nil? (source.p/read-file snap "transforms/t1/t.yaml")))
          (is (= "root note" (source.p/read-file snap "notes.txt"))))))))

(deftest apply-changes-tolerates-missing-delete-path-test
  (testing "apply-changes! tolerates a delete-path that doesn't exist — the upsert still applies, no error"
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"collections/a/keep.yaml" "keep"})]
        (source.p/apply-changes! (source.p/snapshot master) "Delete missing + add"
                                 [{:path "collections/a/new.yaml" :content "new"}]
                                 ["collections/a/gone.yaml"])
        (let [snap (source.p/snapshot master)]
          (is (= ["collections/a/keep.yaml" "collections/a/new.yaml"] (source.p/list-files snap)))
          (is (= "new" (source.p/read-file snap "collections/a/new.yaml")))
          (is (= "keep" (source.p/read-file snap "collections/a/keep.yaml"))))))))

(deftest changed-files-test
  (testing "changed-files classifies the paths whose blob differs between two commits"
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"keep.txt"             "unchanged"
                                                   "edit.txt"             "old content"
                                                   "remove.txt"           "delete me"
                                                   "deep/nested/keep.txt" "deep unchanged"})
            from-version (:version (source.p/snapshot master))]
        (source.p/apply-changes! (source.p/snapshot master) "Change set"
                                 [{:path "edit.txt" :content "new content"}
                                  {:path "add.txt"  :content "brand new"}]
                                 ["remove.txt"])
        (let [snap (source.p/snapshot master)]
          (testing "added / modified / deleted are reported in their own buckets"
            (is (= {:added    #{"add.txt"}
                    :modified #{"edit.txt"}
                    :deleted  #{"remove.txt"}}
                   (git/changed-files snap from-version))))
          (testing "unchanged files — including deep untouched subtrees — are not reported"
            (let [{:keys [added modified deleted]} (git/changed-files snap from-version)
                  touched (reduce into #{} [added modified deleted])]
              (is (not (contains? touched "keep.txt")))
              (is (not (contains? touched "deep/nested/keep.txt")))))
          (testing "comparing a version against itself reports no changes"
            (is (= {:added #{} :modified #{} :deleted #{}}
                   (git/changed-files snap (:version snap)))))
          (testing "an unresolvable from-version returns nil, signalling a full import"
            (is (nil? (git/changed-files snap "no-such-ref-or-sha")))))))))

(deftest write-special-collections
  (let [subdir-path (str "collections/" "r" (subs (u/generate-nano-id "a") 1) "_subdir/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[_master _remote] (init-source! "master" remote-dir
                                            :files {"master.txt" "File in master"
                                                    (str subdir-path "path.txt") "File in subdir"})]))))

(deftest concurrent-access
  (mt/with-temp-dir [remote-dir nil]
    (let [[master remote] (init-source! "master" remote-dir
                                        :files {"master.txt" "File in master"
                                                "subdir/path.txt" "File in subdir"}
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
            (is (= ["additional-file.txt" "initially-source.txt" "master.txt" "only-on-remote.txt" "subdir/path.txt"] (git/list-files (assoc remote :version "master"))))
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
          (is (= ["New-branch on source" "New-branch on remote" "Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log (assoc remote :branch "new-branch"))))))))))

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

(deftest write-files-top-level-exports-replaced-test
  (let [old-col-path  (str "collections/" "r" (subs (u/generate-nano-id "a") 1) "_mycol/")
        new-col-path  (str "collections/" "s" (subs (u/generate-nano-id "b") 1) "_othercol/")
        kept-col-path (str "collections/" "t" (subs (u/generate-nano-id "c") 1) "_keptcol/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"databases/old_db/old_db.yaml" "Old database"
                                                   "databases/old_db/schemas/public.yaml" "Old schema"
                                                   "snippets/old_snippet.yaml" "Old snippet"
                                                   "unmanaged/keep_me.txt" "Unmanaged file"
                                                   (str old-col-path "cards/card1.yaml") "Card in old col"
                                                   (str old-col-path "cards/card2.yaml") "Card 2 in old col"
                                                   (str kept-col-path "dashboards/dash1.yaml") "Dashboard in kept col"})]
        (testing "Writing to a managed dir removes all stale files in ALL managed dirs"
          (source.p/write-files! (source.p/snapshot master) "Rename database"
                                 [{:path "databases/new_db/new_db.yaml" :content "Renamed database"}
                                  {:path "databases/new_db/schemas/public.yaml" :content "Same schema"}
                                  {:path (str old-col-path "cards/card1.yaml") :content "Card in old col"}
                                  {:path (str old-col-path "cards/card2.yaml") :content "Card 2 in old col"}
                                  {:path (str kept-col-path "dashboards/dash1.yaml") :content "Dashboard in kept col"}
                                  {:path "snippets/old_snippet.yaml" :content "Old snippet"}])
          (let [files (set (source.p/list-files (source.p/snapshot master)))]
            (is (contains? files "databases/new_db/new_db.yaml") "New database file should exist")
            (is (contains? files "databases/new_db/schemas/public.yaml") "New schema file should exist")
            (is (not (contains? files "databases/old_db/old_db.yaml")) "Old database file should be removed")
            (is (not (contains? files "databases/old_db/schemas/public.yaml")) "Old schema file should be removed")
            (is (contains? files (str old-col-path "cards/card1.yaml")) "Written collection files should remain")
            (is (contains? files "snippets/old_snippet.yaml") "Written snippet file should remain")
            (is (contains? files "unmanaged/keep_me.txt") "Unmanaged files should be untouched")))
        (testing "Entity moved between collections removes files from old collection"
          (source.p/write-files! (source.p/snapshot master) "Move card to new collection"
                                 [{:path (str new-col-path "cards/card1.yaml") :content "Card moved to new col"}
                                  {:path (str kept-col-path "dashboards/dash1.yaml") :content "Dashboard still here"}
                                  {:path "databases/new_db/new_db.yaml" :content "Renamed database"}
                                  {:path "databases/new_db/schemas/public.yaml" :content "Same schema"}])
          (let [files (set (source.p/list-files (source.p/snapshot master)))]
            (is (contains? files (str new-col-path "cards/card1.yaml")) "Moved card should exist in new collection")
            (is (contains? files (str kept-col-path "dashboards/dash1.yaml")) "Kept collection files should remain")
            (is (not (contains? files (str old-col-path "cards/card1.yaml"))) "Old collection card should be removed")
            (is (not (contains? files (str old-col-path "cards/card2.yaml"))) "Other files in old collection should also be removed")
            (is (not (contains? files "snippets/old_snippet.yaml")) "Snippets cleaned up when not in write set")
            (is (contains? files "unmanaged/keep_me.txt") "Unmanaged files still untouched")))))))

(deftest write-files-entity-rename-within-collection-test
  (let [col-path (str "collections/" "u" (subs (u/generate-nano-id "d") 1) "_col/")]
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {(str col-path "cards/eid123_OldCardName.yaml") "Card with old name"
                                                   (str col-path "cards/eid456_OtherCard.yaml") "Other card"})]
        (testing "Entity renamed within a collection removes the old-named file"
          (source.p/write-files! (source.p/snapshot master) "Rename card"
                                 [{:path (str col-path "cards/eid123_NewCardName.yaml") :content "Card with new name"}
                                  {:path (str col-path "cards/eid456_OtherCard.yaml") :content "Other card"}])
          (let [files (set (source.p/list-files (source.p/snapshot master)))]
            (is (contains? files (str col-path "cards/eid123_NewCardName.yaml")) "Renamed card should exist")
            (is (contains? files (str col-path "cards/eid456_OtherCard.yaml")) "Other card should still exist")
            (is (not (contains? files (str col-path "cards/eid123_OldCardName.yaml"))) "Old card name file should be removed")))))))

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

(deftest get-jgit-reclones-after-local-repo-deleted-test
  (testing "GHY-3815: if the cached local clone dir is deleted out from under us, the next
            operation re-clones instead of returning a stale cached Git instance (which fails
            permanently with 'origin: not found' until an instance restart)"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source remote] (init-source! "master" remote-dir :branches ["branch-1"])
            remote-url (:remote-url source)
            ^File local-path (#'git/repo-path {:remote-url remote-url})
            ^Git cached-git (:git source)]
        (is (.exists local-path) "Precondition: local clone dir exists after the initial clone")
        (is (= ["branch-1" "master"] (source.p/branches source))
            "Precondition: branches works before the dir is deleted")
        (FileUtils/deleteDirectory local-path)
        (is (not (.exists local-path)) "Local clone dir is gone")
        (let [fresh-source (->source! "master" remote)]
          (is (.exists local-path) "Local clone dir was re-created (re-cloned)")
          (is (not (identical? cached-git (:git fresh-source)))
              "A fresh Git instance is returned, not the stale cached one")
          (is (= ["branch-1" "master"] (source.p/branches fresh-source))
              "branches works again after the dir was deleted, without an instance restart"))))))

(deftest ^:parallel credentials-provider-test
  (testing "GitHub URL uses x-access-token"
    (let [provider (git/credentials-provider "https://github.com/org/repo.git" "my-token")]
      (is (instance? UsernamePasswordCredentialsProvider provider))))
  (testing "Bitbucket URL uses x-token-auth"
    (let [provider (#'git/credentials-provider "https://bitbucket.org/org/repo" "my-token")]
      (is (instance? UsernamePasswordCredentialsProvider provider)))))

;; ---------------------------------------------------------------------------
;; Missing remote branch tests (issue #72778)
;; ---------------------------------------------------------------------------

(defn- delete-remote-branch!
  "Deletes a branch on the 'remote' repo used by a test."
  [{:keys [^Git git]} ^String branch]
  (-> (.branchDelete git)
      (.setBranchNames ^"[Ljava.lang.String;" (into-array String [branch]))
      (.setForce true)
      (.call)))

(deftest fetch!-prunes-deleted-remote-branches-test
  (mt/with-temp-dir [remote-dir nil]
    (let [[source remote] (init-source! "master" remote-dir :branches ["branch-1"])]
      (is (some? (git/commit-sha source "branch-1"))
          "Precondition: branch-1 is resolvable locally after initial clone")
      (delete-remote-branch! remote "branch-1")
      (git/fetch! source)
      (is (nil? (git/commit-sha source "branch-1"))
          "branch-1 ref is pruned locally after the remote branch is deleted")
      (is (some? (git/commit-sha source "master"))
          "other refs are unaffected"))))

(deftest snapshot-throws-missing-branch-ex-data-test
  (mt/with-temp-dir [remote-dir nil]
    (let [[_master remote] (init-source! "master" remote-dir
                                         :files {"master.txt" "x"})
          bad-source (->source! "does-not-exist" remote)]
      (try
        (source.p/snapshot bad-source)
        (is false "snapshot should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= "Invalid branch: does-not-exist" (ex-message e)))
          (is (= :missing-branch (:error-type (ex-data e))))
          (is (= "does-not-exist" (:branch (ex-data e)))))))))

(deftest snapshot-throws-missing-branch-after-remote-delete-test
  (mt/with-temp-dir [remote-dir nil]
    (let [[_master remote] (init-source! "master" remote-dir :branches ["branch-1"])
          source-on-branch-1 (->source! "branch-1" remote)]
      (is (some? (source.p/snapshot source-on-branch-1))
          "Precondition: snapshot works before the branch is deleted")
      (delete-remote-branch! remote "branch-1")
      (try
        (source.p/snapshot source-on-branch-1)
        (is false "snapshot should have thrown after the remote branch was deleted")
        (catch clojure.lang.ExceptionInfo e
          (is (= :missing-branch (:error-type (ex-data e))))
          (is (= "branch-1" (:branch (ex-data e)))))))))
