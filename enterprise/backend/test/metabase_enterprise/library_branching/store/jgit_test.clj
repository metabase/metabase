(ns metabase-enterprise.library-branching.store.jgit-test
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.store.jgit-test/with-remote clojure.core/fn
                                 metabase-enterprise.library-branching.store.jgit-test/with-store  clojure.core/with-open}}}
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.remote-test-util :as remote.tu]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs])
  (:import
   (java.io File)
   (java.net UnknownHostException)
   (java.nio.file Files LinkOption)
   (java.nio.file.attribute FileAttribute PosixFilePermission)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.dircache DirCache DirCacheBuilder DirCacheEntry)
   (org.eclipse.jgit.errors NoRemoteRepositoryException TransportException)
   (org.eclipse.jgit.internal JGitText)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectId ObjectInserter PersonIdent Ref Repository)
   (org.eclipse.jgit.transport CredentialItem CredentialItem$Password CredentialItem$Username CredentialsProvider
                               Transport URIish)))

(set! *warn-on-reflection* true)

;;; A remote is a bare repository in a temporary directory, reached by a file:// URL. The helpers below write to
;;; it with JGit directly, so that a test does not depend on the store to set up the remote.

(defn- temp-dir ^File [prefix]
  (.toFile (Files/createTempDirectory prefix (make-array FileAttribute 0))))

(defn- remote-url [^File dir]
  (str "file://" (.getAbsolutePath dir)))

(defmacro ^:private with-remote
  "Binds `repo` to a new empty bare repository and `url` to its file:// URL, as the arguments of a `fn`."
  [[repo url] & body]
  `(remote.tu/do-with-bare-remote (fn [~(vary-meta repo assoc :tag `Repository) ~url] ~@body)))

(defn- do-with-store [url f]
  (let [s (store.jgit/open-store url)]
    (try
      (f s)
      (finally
        (store/close s)))))

(defmacro ^:private with-store
  "Binds `binding` to a new store on `url`, and closes it after `body`."
  [[binding url] & body]
  `(do-with-store ~url (fn [~binding] ~@body)))

(defn- remote-commit!
  "Writes a commit with `parents` and the one file a.txt = `content` into the remote `repo`, and moves `ref` to
  it. Returns its id."
  [^Repository repo ^String ref parents ^String content]
  (with-open [^ObjectInserter inserter (.newObjectInserter repo)]
    (let [index (DirCache/newInCore)
          ^DirCacheBuilder builder (.builder index)
          ident (PersonIdent. "Test" "test@example.com")]
      (.add builder (doto (DirCacheEntry. "a.txt")
                      (.setFileMode FileMode/REGULAR_FILE)
                      (.setObjectId (.insert inserter Constants/OBJ_BLOB (.getBytes content "UTF-8")))))
      (.finish builder)
      (let [commit (doto (CommitBuilder.)
                     (.setTreeId (.writeTree index inserter))
                     (.setAuthor ident)
                     (.setCommitter ident)
                     (.setMessage content))
            _      (doseq [^String p parents] (.addParentId commit (ObjectId/fromString p)))
            id     (.insert inserter commit)]
        (.flush inserter)
        (doto (.updateRef repo ref)
          (.setNewObjectId id)
          (.forceUpdate))
        (.name id)))))

(defn- remote-ref [^Repository repo ^String ref]
  (some-> (.exactRef repo ref) .getObjectId .name))

(defn- set-remote-ref!
  "Moves `ref` of the remote `repo` to `commit`, or deletes it when `commit` is nil: a push by someone else."
  [^Repository repo ^String ref commit]
  (let [update (doto (.updateRef repo ref) (.setForceUpdate true))]
    (if commit
      (doto update (.setNewObjectId (ObjectId/fromString ^String commit)) (.forceUpdate))
      (.delete update))))

(defn- refs
  "{ref-name commit-id} of every ref of `repo`."
  [^Repository repo]
  (into {} (map (fn [^Ref r] [(.getName r) (some-> (.getObjectId r) .name)]))
        (.getRefs (.getRefDatabase repo))))

(defn- set-remote-head!
  "Makes HEAD of the remote `repo` a symbolic ref to `ref`, as the default branch of a hosted repository is."
  [^Repository repo ^String ref]
  (.link (.updateRef repo Constants/HEAD) ref))

(defn- store-refs [s]
  (with-open [git (Git/open (store.jgit/directory s))]
    (refs (.getRepository git))))

(defn- utf8 ^bytes [^String s] (.getBytes s "UTF-8"))

(defn- tree= [a b]
  (= (update-vals a vec) (update-vals b vec)))

;;; cas-ref!

(deftest cas-ref-refuses-when-remote-moved-test
  (testing "cas-ref! refuses and moves nothing when the remote ref is not at the expected commit"
    (with-remote [remote url]
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")]
        (with-store [s url]
          (is (= c0 (store/head s "main")))
          ;; another writer moves main after this store read its head
          (let [c1 (remote-commit! remote "refs/heads/main" [c0] "one")
                _  (is (= c1 (store/head s "main")))
                ;; a fast-forward of the new head, so that only the expected id can stop the push
                c2 (store/write-commit s [c1] {"a.txt" (.getBytes "two" "UTF-8")} "two")]
            (is (= {:moved c1} (store/cas-ref! s "main" c0 c2)))
            (is (= c1 (remote-ref remote "refs/heads/main")))))))))

(deftest cas-ref-expected-nil-test
  (with-remote [remote url]
    (with-store [s url]
      (let [c0 (store/write-commit s [] {"a.txt" (utf8 "zero")} "zero")]
        (testing "expected nil creates a ref that does not exist"
          (is (nil? (store/head s "main")))
          (is (= :ok (store/cas-ref! s "main" nil c0)))
          (is (= c0 (remote-ref remote "refs/heads/main"))))
        (testing "expected nil refuses when the ref exists, also when it is at the new commit"
          (let [c1 (store/write-commit s [c0] {"a.txt" (utf8 "one")} "one")]
            (is (= {:moved c0} (store/cas-ref! s "main" nil c1)))
            (is (= {:moved c0} (store/cas-ref! s "main" nil c0)))
            (is (= c0 (remote-ref remote "refs/heads/main")))))
        (testing "a move from the current commit to itself"
          (is (= :ok (store/cas-ref! s "main" c0 c0))))))))

(deftest cas-ref-not-fast-forward-test
  (testing "cas-ref! moves the ref to a commit that does not descend from it, when the ref is at the expected commit"
    (with-remote [remote url]
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")
            c1 (remote-commit! remote "refs/heads/main" [c0] "one")]
        (with-store [s url]
          (is (= c1 (store/head s "main")))
          (let [c2 (store/write-commit s [c0] {"a.txt" (utf8 "two")} "two")]
            (is (= :ok (store/cas-ref! s "refs/heads/main" c1 c2)))
            (is (= c2 (remote-ref remote "refs/heads/main")))))))))

(deftest cas-ref-refused-by-remote-test
  (testing "cas-ref! throws when the remote refuses the update and the ref is still at the expected commit"
    (with-remote [remote url]
      (let [c0   (remote-commit! remote "refs/heads/main" [] "zero")
            lock (io/file (.getDirectory remote) "refs" "heads" "main.lock")]
        (with-store [s url]
          (is (= c0 (store/head s "main")))
          (let [c1 (store/write-commit s [c0] {"a.txt" (utf8 "one")} "one")]
            ;; another process holds the lock of the ref on the remote
            (spit lock "")
            (try
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Git push of refs/heads/main to .* failed"
                                    (store/cas-ref! s "main" c0 c1)))
              (finally
                (.delete lock)))
            (is (= c0 (remote-ref remote "refs/heads/main")))))))))

(defn- writer-op [writers w] (nth writers (mod w (count writers))))

(def ^:private gen-cas-ops
  "Operations of two writers and an outside party on one remote branch: a compare-and-swap from the head that the
  writer read last (it can be stale), a compare-and-swap from any commit that exists or from nil, a read of the
  head, and an outside reset of the branch to any commit, or its deletion. Each operation is a small vector, so a
  failure shrinks to fewer and simpler operations."
  (gen/vector (gen/one-of [(gen/tuple (gen/return :cas-last) (gen/choose 0 1))
                           (gen/tuple (gen/return :cas-any) (gen/choose 0 1) gen/nat)
                           (gen/tuple (gen/return :head) (gen/choose 0 1))
                           (gen/tuple (gen/return :reset) gen/nat)])
              1 12))

(defn- run-cas-ops!
  "Runs `ops` against the remote and returns the first operation that breaks the law of cas-ref! or of head,
  with what the model expected, or nil."
  [^Repository remote url ops]
  (let [ref     "refs/heads/main"
        writers [(store.jgit/open-store url) (store.jgit/open-store url)]]
    (try
      (loop [[[op w k :as step] & more] ops
             model   nil                   ; the value of the remote ref
             known   [nil]                 ; nil and every commit that the remote holds
             last    {}                    ; writer index -> the head it read last
             counter 0]
        (if-not step
          nil
          (case op
            :head
            (let [s (writer-op writers w)
                  h (store/head s "main")]
              (if (= model h)
                (recur more model known (assoc last (mod w 2) h) counter)
                {:step step :expected model :actual h}))

            (:cas-last :cas-any)
            (let [i        (mod w 2)
                  s        (writers i)
                  parent   (get last i)
                  expected (if (= op :cas-last) parent (nth known (mod k (count known))))
                  new      (store/write-commit s (if parent [parent] []) {"a.txt" (utf8 (str counter))}
                                               (str "commit " counter))
                  result   (store/cas-ref! s "main" expected new)
                  want     (if (= model expected) :ok {:moved model})
                  after    (remote-ref remote ref)
                  model'   (if (= want :ok) new model)]
              (if (and (= want result) (= model' after))
                (recur more model' (cond-> known (= want :ok) (conj new)) last (inc counter))
                {:step step :expected [want model'] :actual [result after]}))

            :reset
            (let [target (nth known (mod w (count known)))]
              (set-remote-ref! remote ref target)
              (recur more target known last counter)))))
      (finally
        (run! store/close writers)))))

(defspec cas-ref-law-test 50
  (prop/for-all [ops gen-cas-ops]
    (with-remote [remote url]
      (let [failure (run-cas-ops! remote url ops)]
        (is (nil? failure))
        (nil? failure)))))

;;; head

(deftest head-test
  (with-remote [remote url]
    (with-store [s url]
      (testing "a ref that does not exist"
        (is (nil? (store/head s "main"))))
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")]
        (testing "a branch name and a full ref name give the commit of the remote"
          (is (= c0 (store/head s "main")))
          (is (= c0 (store/head s "refs/heads/main"))))
        (testing "head fetches the commit, so the store can read it"
          (is (tree= {"a.txt" (utf8 "zero")} (store/read-tree s c0))))
        (testing "a deleted ref"
          (set-remote-ref! remote "refs/heads/main" nil)
          (is (nil? (store/head s "main"))))))))

(deftest head-of-missing-remote-test
  (with-store [s (remote-url (io/file (System/getProperty "java.io.tmpdir") (str "no-such-remote-" (random-uuid))))]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Git fetch of .* failed" (store/head s "main")))))

;;; write-commit and read-tree

(deftest write-commit-changes-no-ref-test
  (with-remote [remote url]
    (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")]
      (with-store [s url]
        (store/head s "main")
        (let [local-before  (store-refs s)
              remote-before (refs remote)
              c1            (store/write-commit s [c0] {"b.txt" (utf8 "b")} "one")]
          (is (string? c1))
          (is (= local-before (store-refs s)))
          (is (= remote-before (refs remote)))
          (is (store/ancestor? s c0 c1)))))))

(deftest write-commit-refuses-bad-trees-test
  (with-remote [_remote url]
    (with-store [s url]
      (testing "a path that is a file and a directory"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is a file and a directory"
                              (store/write-commit s [] {"a" (utf8 "x") "a/b" (utf8 "y")} "m"))))
      (doseq [path ["" "/a" "a//b" "../a" ".git/config" "a/"]]
        (testing (pr-str path)
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid path"
                                (store/write-commit s [] {path (utf8 "x")} "m")))))
      (testing "a parent that is not in the local object store"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not in the local object store"
                              (store/write-commit s ["0123456789012345678901234567890123456789"] {} "m")))))))

(def ^:private gen-segment
  "A path segment of 1 to 4 characters, with ASCII, non-ASCII and non-BMP characters, so that the order of UTF-16
  strings and the byte order of git trees differ."
  (gen/fmap str/join (gen/vector (gen/elements ["a" "b" "Z" "0" "_" "-" "é" "中" "ｚ" "😀"]) 1 4)))

(def ^:private gen-any-tree
  "A tree {path bytes} of 0 to 10 files, 1 to 3 segments deep, with any bytes. A file name ends in `.f` and a
  directory name has no `.`, so no path is a file and a directory of another."
  (gen/fmap #(into {} %)
            (gen/vector (gen/tuple (gen/fmap (fn [[dirs file]] (str/join "/" (conj dirs (str file ".f"))))
                                             (gen/tuple (gen/vector gen-segment 0 2) gen-segment))
                                   gen/bytes)
                        0 10)))

(defspec read-tree-of-write-commit-test 50
  (prop/for-all [tree gen-any-tree]
    (with-remote [_remote url]
      (with-store [s url]
        (tree= tree (store/read-tree s (store/write-commit s [] tree "m")))))))

;;; Commit graphs: ancestor?, merge-base, changed-paths

(def ^:private path-universe
  "Paths with no file that is a directory of another."
  ["r0.yaml" "r1.yaml" "d0/a.yaml" "d0/b.yaml" "d0/e/f.yaml" "d1/a.yaml"])

(def ^:private gen-tree
  "A tree over `path-universe`, with contents from three values, so that two trees often hold one path with equal
  or with different bytes. Shrinks toward the empty tree."
  (gen/fmap (fn [contents]
              (into {} (keep (fn [[path c]] (when c [path (utf8 c)]))) (map vector path-universe contents)))
            (gen/vector (gen/elements [nil "a" "b" "c"]) (count path-universe))))

(def ^:private gen-graph
  "A commit graph of 1 to 8 commits, as [[parent-choices tree] ...] in topological order. Commit i has 0 to 2
  parents: each choice c gives the parent (mod c i). So every graph is acyclic by construction, and a failure
  shrinks toward fewer commits, fewer parents and smaller trees."
  (gen/vector (gen/tuple (gen/vector gen/nat 0 2) gen-tree) 1 8))

(defn- graph-parents
  "The parent indices of each commit of `graph`."
  [graph]
  (vec (map-indexed (fn [i [choices _]] (if (zero? i) [] (vec (distinct (map #(mod % i) choices))))) graph)))

(defn- graph-ancestors
  "For each commit index, the set of indices of its ancestors, itself included."
  [parents]
  (reduce (fn [acc ps] (conj acc (into #{(count acc)} (mapcat acc) ps))) [] parents))

(defn- write-graph!
  "Writes the commits of `graph` to store `s`; returns their ids by index."
  [s graph parents]
  (reduce (fn [ids [i [_ tree]]]
            (conj ids (store/write-commit s (mapv ids (parents i)) tree (str "commit " i))))
          []
          (map-indexed vector graph)))

(defn- tree-diff [from to]
  (let [from-paths (set (keys from))
        to-paths   (set (keys to))]
    {:added    (set/difference to-paths from-paths)
     :deleted  (set/difference from-paths to-paths)
     :modified (set (filter #(not= (vec (from %)) (vec (to %))) (set/intersection from-paths to-paths)))}))

(defn- graph-law-failures!
  "Every pair of commits of `graph` for which ancestor?, merge-base or changed-paths of `s` disagrees with the
  model of the graph, and every commit whose read-tree is not its tree."
  [s graph]
  (let [parents   (graph-parents graph)
        ancestors (graph-ancestors parents)
        ids       (write-graph! s graph parents)
        index     (zipmap ids (range))
        trees     (mapv second graph)
        n         (count graph)]
    (concat
     (for [i (range n)
           :when (not (tree= (trees i) (store/read-tree s (ids i))))]
       {:law :read-tree :commit i})
     (for [i (range n)
           :let [want (tree-diff {} (trees i))
                 got  (store/changed-paths s nil (ids i))]
           :when (not= want got)]
       {:law :changed-paths :from nil :to i :expected want :actual got})
     (for [i (range n)
           j (range n)
           :let [failures
                 (concat
                  (let [want (contains? (ancestors j) i)
                        got  (store/ancestor? s (ids i) (ids j))]
                    (when (not= want got)
                      [{:law :ancestor? :a i :b j :expected want :actual got}]))
                  (let [common (set/intersection (ancestors i) (ancestors j))
                        mb     (some-> (store/merge-base s (ids i) (ids j)) index)
                        lowest (set (remove (fn [k] (some #(and (not= k %) (contains? (ancestors %) k)) common))
                                            common))]
                    (when-not (if (empty? common) (nil? mb) (contains? lowest mb))
                      [{:law :merge-base :a i :b j :lowest lowest :actual mb}]))
                  (let [want (tree-diff (trees i) (trees j))
                        got  (store/changed-paths s (ids i) (ids j))]
                    (when (not= want got)
                      [{:law :changed-paths :from i :to j :expected want :actual got}])))]
           failure failures]
       failure))))

(defspec commit-graph-law-test 50
  (prop/for-all [graph gen-graph]
    (with-remote [_remote url]
      (with-store [s url]
        (let [failures (vec (graph-law-failures! s graph))]
          (is (= [] failures))
          (empty? failures))))))

(deftest reset-branch-ancestry-test
  (testing "after a reset of the branch to another commit, the old head is not an ancestor of the new head"
    (with-remote [remote url]
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")
            c1 (remote-commit! remote "refs/heads/main" [c0] "one")]
        (with-store [s url]
          (is (= c1 (store/head s "main")))
          (let [c2 (remote-commit! remote "refs/heads/main" [c0] "two")]
            (is (= c2 (store/head s "main")))
            (is (not (store/ancestor? s c1 c2)))
            (is (store/ancestor? s c0 c2))
            (is (= c0 (store/merge-base s c1 c2)))))))))

;;; The local directory

(deftest local-directory-test
  (with-remote [_remote url]
    (let [s   (store.jgit/open-store url :token "secret-token-value")
          dir (store.jgit/directory s)]
      (try
        (testing "a new directory under java.io.tmpdir"
          (is (= (.getCanonicalFile (io/file (System/getProperty "java.io.tmpdir")))
                 (.getCanonicalFile (.getParentFile dir)))))
        (testing "only the owner can read, write and enter it"
          (is (= #{PosixFilePermission/OWNER_READ PosixFilePermission/OWNER_WRITE PosixFilePermission/OWNER_EXECUTE}
                 (set (Files/getPosixFilePermissions (.toPath dir) (make-array LinkOption 0))))))
        (testing "the printed store does not show the token"
          (is (not (str/includes? (pr-str s) "secret-token-value"))))
        (testing "two stores on one remote have two directories"
          (with-store [other url]
            (is (not= dir (store.jgit/directory other)))))
        (finally
          (store/close s)))
      (testing "close removes the directory"
        (is (not (.exists dir)))))))

(deftest parent-dir-test
  (testing "open-store makes its directory under :parent-dir, and close removes it"
    (with-remote [_remote url]
      (let [parent (temp-dir "library-branching-parent-")]
        (try
          (let [s (store.jgit/open-store url :parent-dir parent)]
            (try
              (is (= (.getCanonicalFile parent)
                     (.getCanonicalFile (.getParentFile (store.jgit/directory s)))))
              (finally
                (store/close s))))
          (is (empty? (.list parent)))
          (finally
            (FileUtils/deleteDirectory parent)))))))

(deftest no-hooks-test
  (testing "a push runs no hook, also with a refusing pre-push hook at the default place"
    (with-remote [remote url]
      (with-store [s url]
        (let [hooks (io/file (store.jgit/directory s) "hooks")
              hook  (io/file hooks "pre-push")]
          (.mkdirs hooks)
          (spit hook "#!/bin/sh\nexit 1\n")
          (.setExecutable hook true)
          (let [c0 (store/write-commit s [] {"a.txt" (utf8 "zero")} "zero")]
            (is (= :ok (store/cas-ref! s "main" nil c0)))
            (is (= c0 (remote-ref remote "refs/heads/main")))))))))

;;; branches and default-branch

(deftest branches-test
  (with-remote [remote url]
    (with-store [s url]
      (testing "an empty remote has no branch"
        (is (= #{} (store/branches s))))
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")]
        (set-remote-head! remote "refs/heads/main")
        (set-remote-ref! remote "refs/tags/v1" c0)
        (testing "the branch names, with no HEAD and no tag"
          (is (= #{"main"} (store/branches s))))
        (testing "a branch that another writer adds after the first call is listed: each call asks the remote"
          (set-remote-ref! remote "refs/heads/feature/x" c0)
          (is (= #{"main" "feature/x"} (store/branches s))))
        (testing "a deleted branch is not listed"
          (set-remote-ref! remote "refs/heads/feature/x" nil)
          (is (= #{"main"} (store/branches s))))
        (testing "branches fetches nothing"
          (is (= {} (store-refs s))))))))

(deftest default-branch-test
  (with-remote [remote url]
    (with-store [s url]
      (testing "an empty remote has no default branch"
        (is (nil? (store/default-branch s))))
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")]
        (set-remote-ref! remote "refs/heads/develop" c0)
        (testing "the branch that HEAD of the remote names"
          (set-remote-head! remote "refs/heads/main")
          (is (= "main" (store/default-branch s))))
        (testing "a change of the default branch on the remote shows in the next call"
          (set-remote-head! remote "refs/heads/develop")
          (is (= "develop" (store/default-branch s))))
        (testing "a HEAD that names a branch that does not exist"
          (set-remote-head! remote "refs/heads/gone")
          (is (nil? (store/default-branch s))))))))

(def ^:private gen-branch-name
  "A branch name: a leaf of 1 to 4 characters, alone or under one of two directories. No leaf can equal a directory
  name, so no branch is a directory of another."
  (gen/fmap (fn [[dir leaf]] (cond->> leaf dir (str dir "/")))
            (gen/tuple (gen/elements [nil "feature" "release"])
                       (gen/fmap str/join (gen/vector (gen/elements ["a" "b" "c" "0" "1" "_"]) 1 4)))))

(def ^:private gen-remote-refs
  "The branches of a remote, a choice of the branch that HEAD names (an index into the branches, or a name that is no
  branch), and tags with the names of branches."
  (gen/let [names (gen/set gen-branch-name {:max-elements 6})
            head  (gen/one-of [(gen/return nil) gen/nat (gen/return "gone")])
            tags  (gen/vector-distinct (gen/elements (if (seq names) (vec names) ["t"])) {:max-elements 2})]
    {:branches (sort names) :head head :tags tags}))

(defspec branches-and-default-branch-law-test 30
  (prop/for-all [{:keys [branches head tags]} gen-remote-refs]
    (with-remote [remote url]
      (when (seq branches)
        (let [c0 (remote-commit! remote (str "refs/heads/" (first branches)) [] "zero")]
          (doseq [b (rest branches)] (set-remote-ref! remote (str "refs/heads/" b) c0))
          (doseq [t tags] (set-remote-ref! remote (str "refs/tags/" t) c0))))
      (let [head-branch (cond
                          (nat-int? head) (when (seq branches) (nth branches (mod head (count branches))))
                          (string? head)  head)]
        (when head-branch
          (set-remote-head! remote (str "refs/heads/" head-branch)))
        (with-store [s url]
          (let [want {:branches (set branches)
                      :default  (when (contains? (set branches) head-branch) head-branch)}
                got  {:branches (store/branches s) :default (store/default-branch s)}]
            (is (= want got))
            (= want got)))))))

;;; Connection: the URL rule, the credentials, the timeout, the failure reasons

(deftest url-error-test
  (testing "git://, ssh:// and http:// URLs, other schemes and local paths are refused with a message"
    (doseq [url ["git://github.com/foo/bar.git" "ssh://git@github.com/foo/bar.git" "git@github.com:foo/bar.git"
                 "asdf://foo/bar.git" "http://git.example.com/a/b.git" "/tmp/repo"]]
      (testing url
        (is (= "Invalid repository URL: only HTTPS URLs are supported (e.g., https://git-host.example.com/yourcompany/repo.git)"
               (store.jgit/url-error url))))))
  (testing "an HTTPS URL of any host, and a file:// URL for tests, are accepted"
    (doseq [url ["https://github.com/foo/bar.git" "https://gitlab.com/foo/bar.git" "https://bitbucket.org/foo/bar.git"
                 "https://dev.azure.com/org/project/_git/repo" "https://git.example.com/a/b.git" "file:///tmp/repo"]]
      (testing url
        (is (nil? (store.jgit/url-error url)))))))

(def ^:private gen-scheme
  (gen/fmap str/join (gen/vector (gen/elements ["a" "f" "g" "h" "i" "l" "p" "s" "t" "e" "+"]) 1 6)))

(defspec url-error-law-test 100
  (prop/for-all [scheme gen-scheme
                 rest   (gen/fmap str/join (gen/vector (gen/elements ["a" "/" "." "-" "@"]) 0 12))]
    (let [url (str scheme "://" rest)]
      (= (contains? #{"https" "file"} scheme)
         (nil? (store.jgit/url-error url))))))

(deftest open-store-refuses-a-bad-url-test
  ;; a parent directory of this test's own: other processes make store directories in java.io.tmpdir at any time
  (let [parent (temp-dir "library-branching-parent-")]
    (try
      (let [result (try
                     (store.jgit/open-store "ssh://git@github.com/foo/bar.git" :parent-dir parent)
                     (catch clojure.lang.ExceptionInfo e e))]
        (is (instance? clojure.lang.ExceptionInfo result))
        (is (= (store.jgit/url-error "ssh://git@github.com/foo/bar.git") (ex-message result)))
        (testing "and makes no local directory"
          (is (empty? (.list parent))))
        (when (satisfies? store/Store result)
          (store/close result)))
      (finally
        (FileUtils/deleteDirectory parent)))))

(deftest token-user-test
  (testing "each host gets the user name that it expects with an access token"
    (doseq [[url user] [["https://github.com/org/repo.git" "x-access-token"]
                        ["https://gitlab.com/org/repo.git" "x-access-token"]
                        ["https://dev.azure.com/org/project/_git/repo" "x-access-token"]
                        ["https://git.example.com/org/repo.git" "x-access-token"]
                        ["https://bitbucket.org/org/repo.git" "x-token-auth"]
                        ["https://BitBucket.org/org/repo.git" "x-token-auth"]
                        ["file:///tmp/repo" "x-access-token"]]]
      (testing url
        (is (= user (store.jgit/token-user url)))))))

(defn- credential-values
  "[user password] that `provider` gives for `url`, or nil for no provider."
  [^CredentialsProvider provider ^String url]
  (when provider
    (let [user     (CredentialItem$Username.)
          password (CredentialItem$Password.)]
      (.get provider (URIish. url) ^"[Lorg.eclipse.jgit.transport.CredentialItem;" (into-array CredentialItem [user password]))
      [(.getValue user) (String. (.getValue password))])))

(deftest credentials-provider-test
  (testing "the token is the password of the user of the host"
    (is (= ["x-token-auth" "tok"]
           (credential-values (#'store.jgit/credentials-provider "https://bitbucket.org/a/b.git" "tok")
                              "https://bitbucket.org/a/b.git")))
    (is (= ["x-access-token" "tok"]
           (credential-values (#'store.jgit/credentials-provider "https://github.com/a/b.git" "tok")
                              "https://github.com/a/b.git"))))
  (testing "no token, no credentials"
    (is (nil? (#'store.jgit/credentials-provider "https://github.com/a/b.git" nil)))))

(defn- do-recording-transports
  "Calls `(f calls)`, where `calls` is an atom that receives `{:timeout s :credentials [user password]}` for each
  transport that the store opens to a remote."
  [f]
  (let [calls    (atom [])
        original (dynamic-redefs/original-fn #'store.jgit/open-transport)]
    (dynamic-redefs/with-dynamic-fn-redefs
      [store.jgit/open-transport (fn [repo url & more]
                                   (let [^Transport t (apply original repo url more)]
                                     (swap! calls conj {:timeout     (.getTimeout t)
                                                        :credentials (credential-values (.getCredentialsProvider t) url)})
                                     t))]
      (f calls))))

(deftest every-remote-call-has-the-timeout-and-the-credentials-test
  (with-remote [remote url]
    (remote-commit! remote "refs/heads/main" [] "zero")
    (set-remote-head! remote "refs/heads/main")
    (doseq [[opts want] [[{:token "tok" :timeout-seconds 17} {:timeout 17 :credentials ["x-access-token" "tok"]}]
                         [{} {:timeout 60 :credentials nil}]]]
      (testing (pr-str opts)
        (do-recording-transports
         (fn [calls]
           (let [s (store.jgit/open-store url opts)]
             (try
               (doseq [[op call] [[:head #(store/head s "main")]
                                  [:branches #(store/branches s)]
                                  [:default-branch #(store/default-branch s)]
                                  [:cas-ref! #(let [h  (store/head s "main")
                                                    c1 (store/write-commit s [h] {"a.txt" (utf8 "one")} "one")]
                                                (reset! calls [])
                                                (store/cas-ref! s "main" h c1))]]]
                 (testing op
                   (when-not (= :cas-ref! op) (reset! calls []))
                   (call)
                   (is (seq @calls) "the call opens a transport")
                   (is (every? #{want} @calls))))
               (finally
                 (store/close s))))))))))

(deftest failure-reason-test
  (testing "a remote that does not exist"
    (with-store [s (remote-url (io/file (System/getProperty "java.io.tmpdir") (str "no-such-remote-" (random-uuid))))]
      (doseq [[op call] [[:head #(store/head s "main")]
                         [:branches #(store/branches s)]
                         [:default-branch #(store/default-branch s)]]]
        (testing op
          (let [e (try (call) nil (catch clojure.lang.ExceptionInfo e e))]
            (is (= :not-found (:reason (ex-data e)))))))))
  (testing "the reason of a JGit failure"
    (let [uri (URIish. "https://github.com/a/b.git")
          t   (JGitText/get)]
      (doseq [[e reason] [[(TransportException. uri (.-notAuthorized t)) :auth-failed]
                          [(TransportException. uri (.-noCredentialsProvider t)) :auth-failed]
                          [(TransportException. uri (.-authenticationNotSupported t)) :auth-failed]
                          [(NoRemoteRepositoryException. uri "not found.") :not-found]
                          [(TransportException. uri "cannot open git-upload-pack" (UnknownHostException. "x")) :unreachable]
                          [(TransportException. uri "something else") nil]]]
        (testing (ex-message e)
          (is (= reason (#'store.jgit/failure-reason e))))))))

(deftest failure-message-test
  (is (= "Authentication failed: Please check your git credentials" (store.jgit/failure-message :auth-failed)))
  (is (= "Repository not found: Please check the repository URL" (store.jgit/failure-message :not-found)))
  (is (= "Network error: Unable to reach git repository host" (store.jgit/failure-message :unreachable)))
  (is (nil? (store.jgit/failure-message nil))))
