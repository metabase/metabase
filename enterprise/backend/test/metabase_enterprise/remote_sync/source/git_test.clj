(ns metabase-enterprise.remote-sync.source.git-test
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import (java.io File)
           (java.net SocketTimeoutException)
           (java.nio.file Files FileSystems LinkOption Paths)
           (java.nio.file.attribute FileAttribute PosixFilePermissions)
           (java.util.concurrent CyclicBarrier TimeUnit)
           (org.apache.commons.io FileUtils)
           (org.eclipse.jgit.api Git TransportCommand)
           (org.eclipse.jgit.dircache DirCacheEditor DirCacheEditor$PathEdit DirCacheEntry)
           (org.eclipse.jgit.lib AnyObjectId FileMode PersonIdent)
           (org.eclipse.jgit.transport UsernamePasswordCredentialsProvider)))

(set! *warn-on-reflection* true)

(defn- write-files!
  "Test seeding helper: wholesale-write `files` ({:path :content}) to `snapshot` via the commit builder
  (clear the managed dirs, stage every file, push). Returns the new version."
  [snapshot message files]
  (let [c (source.p/open-commit snapshot)]
    (source.p/replace-all! c)
    (doseq [f files] (source.p/stage-upsert! c f))
    (source.p/finish-commit! c message)))

(defn- apply-changes!
  "Test helper: incremental patch via the commit builder — stage `upserts`, remove `delete-paths`, push.
  Returns the new version."
  [snapshot message upserts delete-paths]
  (let [c (source.p/open-commit snapshot)]
    (doseq [u upserts] (source.p/stage-upsert! c u))
    (doseq [p delete-paths] (source.p/stage-delete! c p))
    (source.p/finish-commit! c message)))

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

(defn- git-working-link!
  "Writes a symlink in the working path and stages it, so a test can cover the mode-120000 entries a real
  repo can hold. Git stores the link's *target text* as the blob, and never follows it."
  [{:keys [^Git git]} ^String path ^String target]
  (let [full-path (io/file (.getWorkTree (.getRepository git)) path)]
    (io/make-parents full-path)
    (Files/createSymbolicLink (.toPath full-path)
                              (Paths/get target (into-array String []))
                              (into-array FileAttribute []))
    (-> (.add git)
        (.addFilepattern path)
        (.call))))

(defn- git-working-gitlink!
  "Stages a submodule entry (mode 160000) pointing at `commit-id`. A gitlink has no working-tree file to
  add, so this edits the index directly, as `git update-index --cacheinfo 160000,<sha>,<path>` does."
  [{:keys [^Git git]} ^String path ^AnyObjectId commit-id]
  (let [^DirCacheEditor editor (.editor (.lockDirCache (.getRepository git)))]
    (.add editor (proxy [DirCacheEditor$PathEdit] [path]
                   (apply [^DirCacheEntry entry]
                     (.setFileMode entry FileMode/GITLINK)
                     (.setObjectId entry commit-id))))
    (.commit editor)))

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

(deftest list-dir
  (mt/with-temp-dir [remote-dir nil]
    (let [[master _remote] (init-source! "master" remote-dir
                                         :files {"root.txt"                 "at the root"
                                                 "dir/readme.md"            "a file, not a directory"
                                                 "dir/alpha/one.txt"        "ONE"
                                                 "dir/alpha/two.txt"        "TWO"
                                                 "dir/alpha/deep/leaf.txt"  "LEAF"
                                                 "dir/beta/three.txt"       "THREE"
                                                 ;; \- sorts before \/, so git's own tree order here is
                                                 ;; ("d/a-b" "d/a") — the case the sort normalizes
                                                 "d/a-b"                    "a sibling"
                                                 "d/a/x"                    "inside a directory"
                                                 "zzz/other.txt"            "elsewhere"})
          snap (source.p/snapshot master)]
      (testing "immediate children only — no descendants, no siblings of the directory itself"
        (is (= ["dir/alpha" "dir/beta" "dir/readme.md"] (source.p/list-dir snap "dir"))))
      (testing "children are full repo-root relative paths, so they feed straight back into read-file"
        (let [child (some #{"dir/alpha/one.txt"} (source.p/list-dir snap "dir/alpha"))]
          (is (= "ONE" (source.p/read-file snap child)))))
      (testing "files and directories are both listed, sorted — `deep` is a directory"
        (is (= ["dir/alpha/deep" "dir/alpha/one.txt" "dir/alpha/two.txt"]
               (source.p/list-dir snap "dir/alpha"))))
      (testing "the repo root"
        (is (= ["d" "dir" "root.txt" "zzz"] (source.p/list-dir snap ""))))
      (testing "ordering is plain lexicographic, not git's own tree order"
        ;; git compares a directory as if it ended in "/", so its tree order here is ("d/a-b" "d/a").
        ;; We normalize to lexicographic — the one order a flat path list can produce too, so every
        ;; snapshot implementation agrees.
        (is (= ["d/a" "d/a-b"] (source.p/list-dir snap "d"))))
      (testing "nesting: each call steps down exactly one level, and paths stay rooted at the repo"
        (is (= ["dir/alpha/deep/leaf.txt"] (source.p/list-dir snap "dir/alpha/deep"))))
      (testing "a path that is a file, or absent, has no children rather than throwing"
        (is (= [] (source.p/list-dir snap "dir/readme.md")))
        (is (= [] (source.p/list-dir snap "nope")))
        (is (= [] (source.p/list-dir snap "dir/alpha/nope")))))))

(deftest list-dir-dotfiles-and-symlinks
  (testing "the entry kinds a real repo can hold, beyond plain files and directories"
    (mt/with-temp-dir [remote-dir nil]
      (let [remote (init-remote! remote-dir
                                 :files {"dir/plain.txt"        "a file"
                                         "dir/.dotfile"         "a dotfile"
                                         "dir/.hidden/file.txt" "inside a dot-directory"
                                         "outside/target.txt"   "outside dir"})
            _      (git-working-link! remote "dir/linkdir" "../outside")
            _      (git-working-link! remote "dir/linkfile" "plain.txt")
            head   (git-working-commit! remote "add symlinks")
            _      (git-working-gitlink! remote "dir/sub" head)
            _      (git-working-commit! remote "add submodule")
            snap   (source.p/snapshot (->source! "master" remote))]
        (testing "git has no notion of a hidden file, so neither do we — dotted names are listed as-is"
          (is (= ["dir/.dotfile" "dir/.hidden" "dir/linkdir" "dir/linkfile" "dir/plain.txt" "dir/sub"]
                 (source.p/list-dir snap "dir")))
          (is (= ["dir/.hidden/file.txt"] (source.p/list-dir snap "dir/.hidden"))
              "a dot-directory is an ordinary tree we descend into"))
        (testing "only a tree has children: everything else lists nothing, whatever it points at"
          (is (= [] (source.p/list-dir snap "dir/linkdir")) "a symlink to a directory")
          (is (= [] (source.p/list-dir snap "dir/linkfile")) "a symlink to a file")
          (is (= [] (source.p/list-dir snap "dir/sub")) "a submodule (gitlink) — its tree isn't in this repo")
          (is (= [] (source.p/list-dir snap "dir/plain.txt")) "a plain file"))
        (testing "reading a symlink yields its target text, never the target's content: git does not follow
                  links, so a link can neither escape the repo nor pull in a file from outside the directory"
          (is (= "../outside" (source.p/read-file snap "dir/linkdir")))
          (is (= "plain.txt" (source.p/read-file snap "dir/linkfile"))))))))

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
          (write-files! (source.p/snapshot master) "Update 1" [{:path "master.txt" :content "Updated master content"}
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
          (write-files! (source.p/snapshot master) "Update 2" [{:path (str thirddir-path "path.txt") :content "Only third dir content"}])
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
          (apply-changes! (source.p/snapshot master) "Incremental"
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

(deftest empty-commit?-detects-no-op-tree-test
  (testing "empty-commit? is true exactly when the staged tree matches the parent commit's tree"
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"collections/a.yaml" "content A"
                                                   "collections/b.yaml" "content B"})]
        (testing "re-staging identical content is empty"
          (let [c (source.p/open-commit (source.p/snapshot master))]
            (source.p/stage-upsert! c {:path "collections/a.yaml" :content "content A"})
            (is (true? (source.p/empty-commit? c)))
            (source.p/abort-commit! c)))
        (testing "staging a real content change is not empty"
          (let [c (source.p/open-commit (source.p/snapshot master))]
            (source.p/stage-upsert! c {:path "collections/a.yaml" :content "changed A"})
            (is (false? (source.p/empty-commit? c)))
            (source.p/abort-commit! c)))
        (testing "adding a new file is not empty"
          (let [c (source.p/open-commit (source.p/snapshot master))]
            (source.p/stage-upsert! c {:path "collections/c.yaml" :content "content C"})
            (is (false? (source.p/empty-commit? c)))
            (source.p/abort-commit! c)))
        (testing "deleting a path that isn't in the tree is empty"
          (let [c (source.p/open-commit (source.p/snapshot master))]
            (source.p/stage-delete! c "collections/does-not-exist.yaml")
            (is (true? (source.p/empty-commit? c)))
            (source.p/abort-commit! c)))
        (testing "none of the aborted no-op checks moved the branch"
          (is (= ["Initial commit"] (map :message (git/log master)))))
        (testing "empty-commit? then finish-commit! still commits a real change (tree written once, memoized)"
          (let [c (source.p/open-commit (source.p/snapshot master))]
            (source.p/stage-upsert! c {:path "collections/a.yaml" :content "changed A"})
            (is (false? (source.p/empty-commit? c)))
            (source.p/finish-commit! c "Edit A"))
          (is (= ["Edit A" "Initial commit"] (map :message (git/log master))))
          (is (= "changed A" (source.p/read-file (source.p/snapshot master) "collections/a.yaml"))))))))

(deftest apply-changes-preserves-deep-unchanged-subtree-test
  (testing "an incremental upsert leaves deeply-nested, unrelated subtrees untouched (carried forward by id)"
    (mt/with-temp-dir [remote-dir nil]
      (let [[master _remote] (init-source! "master" remote-dir
                                           :files {"collections/a/deep/nested/keep.yaml" "deep keep"
                                                   "collections/a/deep/sibling.yaml"     "deep sibling"
                                                   "collections/b/edit.yaml"             "old"
                                                   "notes.txt"                           "root note"})]
        (apply-changes! (source.p/snapshot master) "Incremental deep"
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
        (write-files! (source.p/snapshot master) "Full"
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
        (apply-changes! (source.p/snapshot master) "Delete missing + add"
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
        (apply-changes! (source.p/snapshot master) "Change set"
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
          (write-files! (source.p/snapshot master) "Added to source" [{:path "initially-source.txt" :content "Initially on source"}])
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
          (write-files! (source.p/snapshot new-branch) "New-branch on source" [{:path "new-branch-source.txt" :content "Initially on source"}
                                                                               {:path "new-branch-file.txt" :content "Updated on source"}])
          (is (= ["New-branch on source" "New-branch on remote" "Added to source" "Only on remote" "Added additional file" "Initial commit"] (map :message (git/log (assoc remote :branch "new-branch"))))))))))

(deftest git-source-using-commit-ref
  (mt/with-temp-dir [remote-dir nil]
    (let [[master _remote] (init-source! "master" remote-dir
                                         :files {"master.txt" "File in master"
                                                 "subdir/path.txt" "File in subdir"})
          old-master (source.p/snapshot master)]
      (write-files! (source.p/snapshot master) "Update file" [{:path "master.txt" :content "Updated file in master"}
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
          (write-files! (source.p/snapshot master) "Update file" [{:path "master.txt" :content "Updated content"}])
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

(deftest source-and-remote-answer-the-same-test
  (testing "a GitSource (with a clone) and a GitRemote (with none) for the same URL give the same answers"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source _remote] (init-source! "master" remote-dir :branches ["branch-1" "branch-2"])
            remote           (git/git-remote (:remote-url source) nil)]
        (is (= ["branch-1" "branch-2" "master"] (source.p/branches remote)))
        (is (= (source.p/branches source) (source.p/branches remote)))
        (is (= "master" (source.p/default-branch remote)))
        (is (= (source.p/default-branch source) (source.p/default-branch remote)))))))

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
          (write-files! (source.p/snapshot master) "Rename database"
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
          (write-files! (source.p/snapshot master) "Move card to new collection"
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
          (write-files! (source.p/snapshot master) "Rename card"
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

(deftest stale-cache-recovery-keeps-in-flight-clone-usable-test
  (testing "recovering from a stale cache (a \"Missing commit\" error, e.g. after an upstream force-push) re-clones
            without deleting the clone another operation is still using: a snapshot and a source taken before the
            recovery keep reading and fetching"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source remote] (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            in-flight       (source.p/snapshot source)
            real-snapshot*  (mt/original-fn #'git/snapshot*)
            real-clone!     (mt/original-fn #'git/clone-repository!)
            thrown?         (atom false)
            ;; What another operation holding the pre-recovery source and snapshot sees while the recovery re-clones.
            during-reclone  (atom nil)
            attempt         (fn [thunk] (try (thunk) (catch Exception e (str "threw: " (ex-message e)))))]
        (mt/with-dynamic-fn-redefs [git/snapshot*         (fn [s]
                                                            (if (compare-and-set! thrown? false true)
                                                              (throw (ex-info "Missing commit 0123456789abcdef" {}))
                                                              (real-snapshot* s)))
                                    git/clone-repository! (fn [path args]
                                                            (reset! during-reclone
                                                                    {:read     (attempt #(source.p/read-file in-flight "master.txt"))
                                                                     :branches (attempt #(source.p/branches source))})
                                                            (real-clone! path args))]
          (let [recovered (source.p/snapshot source)]
            (is @thrown? "precondition: the stale-cache recovery ran")
            (is (= "File in master" (source.p/read-file recovered "master.txt"))
                "the recovered snapshot reads from its fresh clone")))
        (is (= {:read "File in master" :branches ["master"]} @during-reclone)
            "while the recovery re-clones, the clone in use by earlier operations is still there to read")
        (is (= "File in master" (source.p/read-file in-flight "master.txt"))
            "a snapshot taken before the recovery still reads")
        (git-working-add! remote "after.txt" "Added after recovery")
        (git-working-commit! remote "Add after.txt")
        (is (= "Added after recovery" (source.p/read-file (source.p/snapshot source) "after.txt"))
            "a source created before the recovery still fetches and reads new commits")
        (is (= "Added after recovery"
               (source.p/read-file (source.p/snapshot (->source! "master" remote)) "after.txt"))
            "a source created after the recovery uses the fresh clone")))))

(deftest stale-cache-recovery-with-token-test
  (testing "after a stale-cache recovery of a source with a token, a new source for the same URL and token gets the
            clone that the recovery made, and the recovery clones with that token"
    (mt/with-temp-dir [remote-dir nil]
      (let [[_ remote]   (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            remote-url   (-> ^Git (:git remote) .getRepository .getDirectory .toURI .toURL .toExternalForm)
            token        "a-token"
            source       (git/git-source remote-url "master" token ingest/legal-top-level-paths)
            real-snapshot* (mt/original-fn #'git/snapshot*)
            real-clone!  (mt/original-fn #'git/clone-repository!)
            thrown?      (atom false)
            clone-tokens (atom [])]
        (is (= "File in master" (source.p/read-file (source.p/snapshot source) "master.txt"))
            "precondition: a file:// remote accepts a source with a token")
        (mt/with-dynamic-fn-redefs [git/snapshot*         (fn [s]
                                                            (if (compare-and-set! thrown? false true)
                                                              (throw (ex-info "Missing commit 0123456789abcdef" {}))
                                                              (real-snapshot* s)))
                                    git/clone-repository! (fn [path args]
                                                            (swap! clone-tokens conj (:token args))
                                                            (real-clone! path args))]
          (let [recovered (source.p/snapshot source)
                ^Git recovered-git (:git recovered)
                later     (git/git-source remote-url "master" token ingest/legal-top-level-paths)]
            (is @thrown? "precondition: the stale-cache recovery ran")
            (is (= [token] @clone-tokens) "the recovery clones once, with the source's token")
            (is (identical? recovered-git (:git later))
                "a new source for the same URL and token uses the clone that the recovery made")
            (is (= "File in master" (source.p/read-file (source.p/snapshot later) "master.txt")))
            (testing "the shutdown hook deletes the stale clone and the fresh clone"
              (let [deleted (atom [])]
                (mt/with-dynamic-fn-redefs [git/delete-clone-dir! (fn [^File dir] (swap! deleted conj dir))]
                  (#'git/delete-clones-at-exit!))
                (let [deleted-at-exit (into #{} (map #(.getCanonicalPath ^File %)) @deleted)]
                  ;; This assertion fails when the recovery does not retire the stale clone, in any test order.
                  (is (contains? deleted-at-exit (.getCanonicalPath (#'git/git-dir (:git source))))
                      "the stale clone is deleted at exit")
                  (is (contains? deleted-at-exit (.getCanonicalPath (#'git/git-dir recovered-git)))
                      "the fresh clone is deleted at exit")))
              ;; The hook is installed once for each JVM, so an earlier test can make this assertion pass.
              (is (realized? @#'git/retired-clones-reaper)
                  "the shutdown hook is installed"))))))))

(defn- remote-url
  "The file:// URL of a test 'remote' repo."
  [{:keys [^Git git]}]
  (-> (.getRepository git) .getDirectory .toURI .toURL .toExternalForm))

(defn- clone-siblings
  "The fresh sibling directories (`<repo-path>-<uuid>`) on disk that stale-cache recoveries made for `url`."
  [url]
  (let [^File path (#'git/repo-path {:remote-url url})
        prefix     (str (.getName path) "-")]
    (filter #(str/starts-with? (.getName ^File %) prefix) (.listFiles (.getParentFile path)))))

(defn- forget-clones!
  "Drops `url`'s cached Git instance and retired-clone entries, as a stop that runs no shutdown hook does. Unless
  `keep-dirs?`, also deletes its clone directory and fresh siblings."
  [url & {:keys [keep-dirs?]}]
  (let [^File path (#'git/repo-path {:remote-url url})]
    (swap! @#'git/jgit dissoc (.getPath path))
    (swap! @#'git/retired-clones (fn [dirs] (into #{} (remove #(str/starts-with? (str %) (str path))) dirs)))
    (when-not keep-dirs?
      (run! #(FileUtils/deleteQuietly ^File %) (cons path (clone-siblings url))))))

(defn- recover-stale-clone!
  "Takes a snapshot of `source` with one injected \"Missing commit\" error, so that a stale-cache recovery runs.
  Returns the recovered snapshot."
  [source]
  (let [real-snapshot* (mt/original-fn #'git/snapshot*)
        thrown?        (atom false)]
    (mt/with-dynamic-fn-redefs [git/snapshot* (fn [s]
                                                (if (compare-and-set! thrown? false true)
                                                  (throw (ex-info "Missing commit 0123456789abcdef" {}))
                                                  (real-snapshot* s)))]
      (u/prog1 (source.p/snapshot source)
        (is @thrown? "precondition: the stale-cache recovery ran")))))

(defn- clone-dir
  "The directory of the clone that `source` reads."
  ^File [{:keys [^Git git]}]
  (.getDirectory (.getRepository git)))

(defn- metabase-git-dir
  "The directory under the system temp dir that holds the clones of every process."
  ^File []
  (io/file (System/getProperty "java.io.tmpdir") "metabase-git"))

(defn- posix-permissions
  "The POSIX permissions of `f` as a string such as \"rwx------\", or nil when the file system has no POSIX permissions."
  [^File f]
  (when (contains? (.supportedFileAttributeViews (FileSystems/getDefault)) "posix")
    (PosixFilePermissions/toString (Files/getPosixFilePermissions (.toPath f) (make-array LinkOption 0)))))

(defn- count-remote-commands
  "Calls `thunk`, and returns the simple class names of the remote commands that it ran, with their counts."
  [thunk]
  (let [commands            (atom [])
        call-remote-command (mt/original-fn #'git/call-remote-command)]
    (mt/with-dynamic-fn-redefs [git/call-remote-command (fn [command args]
                                                          (swap! commands conj (.getSimpleName (class command)))
                                                          (call-remote-command command args))]
      (thunk))
    (frequencies @commands)))

(deftest clone-is-under-an-owner-only-process-root-test
  (testing "the clone of a source is in a process root directly under metabase-git, and only the owner can use the root"
    (mt/with-temp-dir [remote-dir nil]
      (let [url (remote-url (init-remote! remote-dir))]
        (try
          (let [root (.getParentFile (clone-dir (git/git-source url "master" nil ingest/legal-top-level-paths)))]
            (is (= (.getCanonicalPath (metabase-git-dir)) (.getCanonicalPath (.getParentFile root)))
                "the root is directly under metabase-git")
            (is (str/starts-with? (.getName root) "p-") "the root is a process root")
            (when-let [permissions (posix-permissions root)]
              (is (= "rwx------" permissions) "only the owner can use the root")))
          (finally (forget-clones! url)))))))

(deftest repository-planted-at-the-old-clone-path-is-not-opened-test
  (testing "a repository at metabase-git/<sha1 of the URL> before the first use is not opened: the source clones anew"
    (mt/with-temp-dir [remote-dir nil]
      (mt/with-temp-dir [other-dir nil]
        (let [url     (remote-url (init-remote! remote-dir :files {"master.txt" "File in master"}))
              other   (remote-url (init-remote! other-dir :files {"master.txt" "Planted"}))
              planted (io/file (metabase-git-dir) (-> url buddy-hash/sha1 codecs/bytes->hex))]
          (try
            (FileUtils/deleteQuietly planted)
            (.close (-> (Git/cloneRepository) (.setURI other) (.setDirectory planted) (.setBare true) (.call)))
            (let [source (git/git-source url "master" nil ingest/legal-top-level-paths)]
              (is (not= (.getCanonicalPath planted) (.getCanonicalPath (clone-dir source)))
                  "the source does not use the planted repository")
              (is (= "File in master" (source.p/read-file (source.p/snapshot source) "master.txt"))))
            (finally
              (forget-clones! url)
              (FileUtils/deleteQuietly planted))))))))

(deftest first-use-asks-the-remote-once-and-clones-once-test
  (testing "the first use of a URL makes one lsRemote and one clone"
    (mt/with-temp-dir [remote-dir nil]
      (let [url (remote-url (init-remote! remote-dir :branches ["branch-1"]))]
        (try
          (is (= {"LsRemoteCommand" 1 "CloneCommand" 1}
                 (count-remote-commands #(git/git-source url "master" nil ingest/legal-top-level-paths))))
          (finally (forget-clones! url)))))))

(deftest first-use-of-a-remote-with-no-branch-does-not-clone-test
  (testing "the first use of a remote with no branch fails with the uninitialized-repository error after one lsRemote,
            and makes no clone"
    (mt/with-temp-dir [remote-dir nil]
      (let [url    (remote-url {:git (-> (Git/init) (.setDirectory (io/file remote-dir)) (.setInitialBranch "master") (.call))})
            result (atom nil)]
        (try
          (is (= {"LsRemoteCommand" 1}
                 (count-remote-commands #(reset! result (try (git/git-source url "master" nil ingest/legal-top-level-paths)
                                                             (catch Exception e (ex-message e)))))))
          (is (str/includes? (str @result) "Cannot connect to uninitialized repository"))
          (finally (forget-clones! url)))))))

(deftest concurrent-first-use-clones-once-test
  (testing "two concurrent first uses of a URL share one clone, and both get a source"
    (mt/with-temp-dir [remote-dir nil]
      (let [url          (remote-url (init-remote! remote-dir))
            real-clone!  (mt/original-fn #'git/clone-repository!)
            clones       (atom 0)
            second-clone (promise)
            first-done   (promise)
            start        (promise)]
        (try
          (mt/with-dynamic-fn-redefs [git/clone-repository!
                                      (fn [path args]
                                        (if (= 1 (swap! clones inc))
                                          ;; Holds the first clone until a second one starts, or for 2 s if none does.
                                          (try (deref second-clone 2000 nil)
                                               (real-clone! path args)
                                               (finally (deliver first-done true)))
                                          (do (deliver second-clone true)
                                              (deref first-done 10000 nil)
                                              (real-clone! path args))))]
            (let [uses (mapv (fn [_] (future
                                       (deref start 10000 nil)
                                       (try (git/git-source url "master" nil ingest/legal-top-level-paths)
                                            (catch Exception e (str "threw: " (ex-message e))))))
                             (range 2))
                  _    (deliver start true)
                  results (mapv #(deref % 30000 ::timeout) uses)]
              (is (= [] (remove #(instance? Git (:git %)) results))
                  "both first uses get a source")
              (is (= 1 @clones) "the first uses clone once")))
          (finally (forget-clones! url)))))))

(deftest concurrent-failing-first-uses-clone-once-test
  (testing (str "concurrent first uses of a URL whose clone fails make one clone attempt and all fail together, "
                "so that a slow failure does not make each waiting request wait for its own attempt")
    (mt/with-temp-dir [remote-dir nil]
      (let [url    (remote-url (init-remote! remote-dir))
            clones (atom 0)
            start  (promise)]
        (try
          (mt/with-dynamic-fn-redefs [git/clone-repository! (fn [_path _args]
                                                              (swap! clones inc)
                                                              (Thread/sleep 1000)
                                                              (throw (ex-info "Connection timed out" {})))]
            (let [t0      (System/nanoTime)
                  uses    (mapv (fn [_] (future
                                          (deref start 10000 nil)
                                          (try (git/git-source url "master" nil ingest/legal-top-level-paths)
                                               (catch Exception e (str "threw: " (ex-message e))))))
                                (range 4))
                  _       (deliver start true)
                  results (mapv #(deref % 30000 ::timeout) uses)
                  ms      (quot (- (System/nanoTime) t0) 1000000)]
              (is (every? #(and (string? %) (str/includes? % "Connection timed out")) results)
                  "each first use fails with the error of the clone")
              (is (= 1 @clones) "the first uses make one clone attempt")
              (is (< ms 2500) (str "the four first uses took " ms " ms"))))
          (finally (forget-clones! url)))))))

(deftest interrupted-first-use-does-not-fail-waiters-test
  (testing "when the thread of a shared first use is interrupted, a waiter that nobody interrupted makes its own attempt"
    (mt/with-temp-dir [remote-dir nil]
      (let [url      (remote-url (init-remote! remote-dir))
            real     (mt/original-fn #'git/clone-repository!)
            in-clone (promise)
            attempts (atom 0)]
        (try
          (mt/with-dynamic-fn-redefs [git/clone-repository! (fn [path args]
                                                              (when (= 1 (swap! attempts inc))
                                                                (deliver in-clone true)
                                                                (Thread/sleep 5000))
                                                              (real path args))]
            (let [use!   #(try (git/git-source url "master" nil ingest/legal-top-level-paths)
                               (catch Throwable e (str "threw: " (.getName (class e)) " " (ex-message e))))
                  owner  (future (use!))
                  _      (is (true? (deref in-clone 5000 false)) "precondition: the first use is in its clone")
                  waiter (future (use!))]
              (Thread/sleep 200)
              (future-cancel owner)
              (let [result (deref waiter 15000 ::timeout)]
                (is (instance? Git (:git result)) (str "the waiter gets a source, not: " (pr-str result))))
              (is (= 2 @attempts) "the waiter makes its own clone attempt")
              (is (not (contains? @@#'git/first-uses (.getPath ^File (#'git/repo-path {:remote-url url}))))
                  "no first-use entry stays")))
          (finally (forget-clones! url)))))))

(deftest concurrent-first-uses-share-a-network-timeout-test
  (testing (str "concurrent first uses share a clone attempt that fails on a network timeout: no thread was interrupted, "
                "so the waiters do not clone again")
    (mt/with-temp-dir [remote-dir nil]
      (let [url      (remote-url (init-remote! remote-dir))
            attempts (atom 0)
            start    (promise)]
        (try
          (mt/with-dynamic-fn-redefs [git/clone-repository! (fn [_path _args]
                                                              (swap! attempts inc)
                                                              (Thread/sleep 1000)
                                                              (throw (ex-info "Failed to clone git repository: connect timed out"
                                                                              {}
                                                                              (SocketTimeoutException. "connect timed out"))))]
            (let [t0      (System/nanoTime)
                  uses    (mapv (fn [_] (future
                                          (deref start 10000 nil)
                                          (try (git/git-source url "master" nil ingest/legal-top-level-paths)
                                               (catch Exception e (str "threw: " (ex-message e))))))
                                (range 4))
                  _       (deliver start true)
                  results (mapv #(deref % 30000 ::timeout) uses)
                  ms      (quot (- (System/nanoTime) t0) 1000000)]
              (is (every? #(and (string? %) (str/includes? % "connect timed out")) results)
                  "each first use fails with the timeout")
              (is (= 1 @attempts) "a network timeout is shared like any other clone failure")
              (is (< ms 2500) (str "the four first uses took " ms " ms"))))
          (finally (forget-clones! url)))))))

(deftest concurrent-stale-cache-recoveries-clone-once-test
  (testing "two concurrent stale-cache recoveries of one clone share one fresh clone"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source _]     (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            url            (:remote-url source)
            real-snapshot* (mt/original-fn #'git/snapshot*)
            real-clone!    (mt/original-fn #'git/clone-repository!)
            threw-in       (atom #{})
            both-stale     (CyclicBarrier. 2)
            clones         (atom 0)]
        (try
          (mt/with-dynamic-fn-redefs [git/snapshot*         (fn [s]
                                                              (let [t (Thread/currentThread)]
                                                                (if (contains? @threw-in t)
                                                                  (real-snapshot* s)
                                                                  (do (swap! threw-in conj t)
                                                                      (.await both-stale 10 TimeUnit/SECONDS)
                                                                      (throw (ex-info "Missing commit 0123456789abcdef" {}))))))
                                      git/clone-repository! (fn [path args]
                                                              (swap! clones inc)
                                                              (real-clone! path args))]
            (let [reads (mapv (fn [_] (future (source.p/read-file (source.p/snapshot source) "master.txt")))
                              (range 2))]
              (is (= ["File in master" "File in master"] (mapv #(deref % 30000 ::timeout) reads))
                  "both snapshots recover and read")))
          (is (= 2 (count @threw-in)) "precondition: each thread ran a stale-cache recovery")
          (is (= 1 @clones) "the recoveries clone once")
          (is (= 1 (count (clone-siblings url))) "one fresh sibling exists on disk")
          (finally (forget-clones! url)))))))

(deftest first-use-after-hard-stop-following-recovery-test
  (testing "after a recovery and a stop that runs no shutdown hook, the next first use of the URL removes the fresh
            sibling and does not open the clone that the recovery found stale"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source _]  (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            url         (:remote-url source)
            ^File path  (#'git/repo-path {:remote-url url})
            stale-mark  "stale-clone-marker"]
        (try
          (recover-stale-clone! source)
          (spit (io/file path stale-mark) "")
          (forget-clones! url :keep-dirs? true)
          (let [later (git/git-source url "master" nil ingest/legal-top-level-paths)]
            (is (= [] (map #(.getName ^File %) (clone-siblings url)))
                "no fresh sibling stays on disk")
            (is (not (.exists (io/file (#'git/git-dir (:git later)) stale-mark)))
                "the source does not open the stale clone")
            (is (= "File in master" (source.p/read-file (source.p/snapshot later) "master.txt"))))
          (finally (forget-clones! url)))))))

(deftest first-use-after-fresh-clone-deleted-test
  (testing "if the fresh clone of a recovery is deleted, the next first use does not open a clone that the recovery
            retired"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source _] (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            url        (:remote-url source)
            ^File path (#'git/repo-path {:remote-url url})]
        (try
          (recover-stale-clone! source)
          (let [^File fresh (#'git/git-dir (get @@#'git/jgit (.getPath path)))]
            (is (not= (str path) (str fresh)) "precondition: the recovery cached a fresh sibling")
            ;; Not FileUtils/deleteDirectory: a JGit gc that the recovery's fetch started can remove gc.log.lock while
            ;; that delete runs, and the delete then throws.
            (#'git/delete-clone-dir! fresh)
            (is (not (.exists fresh)) "precondition: the fresh clone is deleted"))
          (let [later (git/git-source url "master" nil ingest/legal-top-level-paths)]
            (is (not (contains? (set (map str @@#'git/retired-clones)) (str (#'git/git-dir (:git later)))))
                "the source does not use a retired clone")
            (is (= "File in master" (source.p/read-file (source.p/snapshot later) "master.txt"))))
          (finally (forget-clones! url)))))))

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

(deftest repo-path-ignores-token-test
  (testing "rotating the token reuses the existing clone instead of cloning into a new directory"
    ;; Credentials are passed per remote command, so the clone does not depend on the token.
    (is (= (#'git/repo-path {:remote-url "https://example.com/org/repo.git" :token "token-a"})
           (#'git/repo-path {:remote-url "https://example.com/org/repo.git" :token "token-b"})
           (#'git/repo-path {:remote-url "https://example.com/org/repo.git" :token nil})))
    (is (not= (#'git/repo-path {:remote-url "https://example.com/org/repo.git"})
              (#'git/repo-path {:remote-url "https://example.com/org/other.git"})))))

(deftest uninitialized-clone-is-deleted-with-a-tolerant-delete-test
  (testing "when a clone has no data, it is deleted with delete-clone-dir!, and the error is the uninitialized-repository
            error"
    ;; A fetch can start a JGit gc in the background, which creates and removes gc.log.lock in the clone. A delete that
    ;; lists the directory first then fails on the file that disappeared. delete-clone-dir! ignores that failure.
    (mt/with-temp-dir [remote-dir nil]
      (let [[source _] (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            path       (io/file (System/getProperty "java.io.tmpdir") (str "metabase-git-test-" (random-uuid)))
            deleted    (atom [])
            delete!    (mt/original-fn #'git/delete-clone-dir!)]
        (try
          (mt/with-dynamic-fn-redefs [git/has-data?        (constantly false)
                                      git/delete-clone-dir! (fn [^File dir] (swap! deleted conj dir) (delete! dir))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot connect to uninitialized repository"
                                  (#'git/open-checked! path {:remote-url (:remote-url source)}))))
          (is (= [path] @deleted))
          (is (not (.exists path)) "the clone directory is gone")
          (finally (FileUtils/deleteQuietly path)))))))

(defn- chflags!
  "Runs `chflags` with `flag` on `file` and returns its exit code, or nil when this system has no `chflags` command."
  [flag ^File file]
  (try
    (.waitFor (.start (ProcessBuilder. ^java.util.List ["chflags" flag (str file)])))
    (catch java.io.IOException _
      nil)))

(defn- immutable-flag-skip-reason!
  "Returns nil when `chflags uchg` makes a file in the system temp dir immutable; otherwise the reason it does not."
  []
  (let [probe-dir (io/file (System/getProperty "java.io.tmpdir") (str "metabase-git-test-chflags-" (random-uuid)))
        probe     (io/file probe-dir "probe")]
    (try
      (io/make-parents probe)
      (spit probe "x")
      (let [exit (chflags! "uchg" probe)]
        (cond
          (nil? exit)  "this system has no chflags command"
          (zero? exit) nil
          :else        "the file system of the temp dir does not support the uchg flag"))
      (finally
        (chflags! "nouchg" probe)
        (FileUtils/deleteQuietly probe-dir)))))

(deftest uninitialized-clone-with-an-undeletable-file-test
  (testing "when a clone has no data and the delete cannot remove one of its files, the error is still the
            uninitialized-repository error"
    ;; Only an immutable flag stops the delete of commons-io: it makes a read-only directory writable first. The flag
    ;; needs chflags (macOS and BSD); chattr +i on Linux needs root. So the test runs only where chflags exists and
    ;; the file system supports the flag.
    (if-let [skip-reason (immutable-flag-skip-reason!)]
      (log/infof "Skipping uninitialized-clone-with-an-undeletable-file-test: %s" skip-reason)
      (mt/with-temp-dir [remote-dir nil]
        (let [[source _] (init-source! "master" remote-dir :files {"master.txt" "File in master"})
              path       (io/file (System/getProperty "java.io.tmpdir") (str "metabase-git-test-" (random-uuid)))
              locked     (io/file path "locked" "f")]
          (try
            (mt/with-dynamic-fn-redefs [git/has-data? (fn [_]
                                                        (io/make-parents locked)
                                                        (spit locked "x")
                                                        (is (zero? (chflags! "uchg" locked)) "precondition: the file is immutable")
                                                        false)]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot connect to uninitialized repository"
                                    (#'git/open-checked! path {:remote-url (:remote-url source)}))))
            (finally
              (chflags! "nouchg" locked)
              (FileUtils/deleteQuietly path))))))))

(deftest shutdown-hook-keeps-clones-in-place-test
  (testing "the shutdown hook does not delete a clone that lives at its repo-path"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source _remote] (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            clone-dir        (.getCanonicalPath (#'git/git-dir (:git source)))
            deleted          (atom [])]
        (is (contains? @@#'git/jgit (.getPath ^File (#'git/repo-path source)))
            "precondition: the clone is cached at its repo-path")
        (mt/with-dynamic-fn-redefs [git/delete-clone-dir! (fn [^File dir] (swap! deleted conj dir))]
          (#'git/delete-clones-at-exit!))
        (is (not (contains? (into #{} (map #(.getCanonicalPath ^File %)) @deleted) clone-dir)))))))

(deftest stale-clone-and-leftover-siblings-are-deleted-with-a-tolerant-delete-test
  (testing "a first use deletes a leftover sibling and the stale clone at the repo path with delete-clone-dir!"
    (mt/with-temp-dir [remote-dir nil]
      (let [[source _] (init-source! "master" remote-dir :files {"master.txt" "File in master"})
            url        (:remote-url source)
            ^File path (#'git/repo-path {:remote-url url})
            leftover   (io/file (.getParentFile path) (str (.getName path) "-leftover"))
            deleted    (atom [])
            delete!    (mt/original-fn #'git/delete-clone-dir!)]
        (try
          ;; As after a process that stopped with no shutdown hook: a clone at the path, a fresh sibling, no cache.
          (forget-clones! url :keep-dirs? true)
          (.mkdirs leftover)
          (mt/with-dynamic-fn-redefs [git/delete-clone-dir! (fn [^File dir] (swap! deleted conj (str dir)) (delete! dir))]
            (#'git/first-use! path {:remote-url url}))
          (is (= #{(str leftover) (str path)} (set @deleted)))
          (finally (forget-clones! url)))))))
